import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { StorageNotFoundError, type StorageAdapter } from "./storage-adapter";

const STORAGE_PROXY_PREFIX = "/api/storage/";
const PROBE_DIRECTORY = ".storage-probes";

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export function createLocalFileSystemAdapter(rootDir: string): StorageAdapter {
  return {
    async probe() {
      const probeDirectory = join(rootDir, PROBE_DIRECTORY);
      await mkdir(probeDirectory, { recursive: true });
      const directoryStats = await lstat(probeDirectory);
      if (directoryStats.isSymbolicLink() || !directoryStats.isDirectory()) {
        throw new Error("Storage probe directory must be a real directory");
      }

      if (process.env.NODE_ENV === "test" || process.env.E2E_MODE === "true") {
        try {
          await lstat(join(probeDirectory, "force-failure"));
        } catch (error) {
          if (!isErrnoException(error) || error.code !== "ENOENT") throw error;
          return runProbe(probeDirectory);
        }
        throw new Error("Storage probe failure forced by test marker");
      }

      await runProbe(probeDirectory);
    },

    async getUsageBytes() {
      async function measure(path: string, isRoot = false): Promise<number> {
        try {
          const entryStats = await lstat(path);
          if (entryStats.isSymbolicLink()) return 0;
          if (entryStats.isFile()) return entryStats.size;
          if (!entryStats.isDirectory()) return 0;

          let bytes = 0;
          for (const entry of await readdir(path)) {
            if (isRoot && entry === PROBE_DIRECTORY) continue;
            bytes += await measure(join(path, entry));
          }
          return bytes;
        } catch (error) {
          if (isErrnoException(error) && error.code === "ENOENT") return 0;
          throw error;
        }
      }
      return measure(rootDir, true);
    },

    async put(key, file) {
      const targetPath = join(rootDir, key);

      try {
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, Buffer.from(await file.arrayBuffer()));
      } catch (error) {
        if (isErrnoException(error) && (error.code === "EACCES" || error.code === "EPERM")) {
          throw new Error(
            `Failed to write file at ${targetPath}: permission denied (${error.code}). This usually indicates a PUID/PGID mismatch between the process user and the STORAGE_LOCAL_ROOT_DIR volume owner.`
          );
        }
        throw error;
      }

      return `${STORAGE_PROXY_PREFIX}${key}`;
    },

    async del(url) {
      if (!url.startsWith(STORAGE_PROXY_PREFIX)) return;

      const key = url.slice(STORAGE_PROXY_PREFIX.length);

      try {
        await unlink(join(rootDir, key));
      } catch (error) {
        console.warn(`Failed to delete local storage file for ${url}:`, error);
      }
    },

    async read(key) {
      const targetPath = join(rootDir, key);

      try {
        await stat(targetPath);
      } catch (error) {
        if (isErrnoException(error) && error.code === "ENOENT") {
          throw new StorageNotFoundError(key);
        }
        throw error;
      }

      const stream = Readable.toWeb(createReadStream(targetPath));
      if (!stream) throw new Error("Failed to create readable stream");
      return stream as ReadableStream<Uint8Array>;
    },
  };
}

async function runProbe(probeDirectory: string): Promise<void> {
  const probePath = join(probeDirectory, randomUUID());
  const payload = Buffer.from(randomUUID());
  let written = false;
  let cleanup = true;
  try {
    try {
      await writeFile(probePath, payload, { flag: "wx" });
      written = true;
    } catch (error) {
      // An exclusive-create collision belongs to another caller, never remove it.
      if (isErrnoException(error) && error.code === "EEXIST") cleanup = false;
      throw error;
    }
    const contents = await readFile(probePath);
    if (!contents.equals(payload)) throw new Error("Storage probe read-back verification failed");
  } finally {
    if (cleanup) {
      try {
        await unlink(probePath);
      } catch (error) {
        // A failed write may never have created a file; successful writes require strict cleanup.
        if (written || !isErrnoException(error) || error.code !== "ENOENT") throw error;
      }
    }
  }
}
