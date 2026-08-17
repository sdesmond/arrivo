import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { StorageNotFoundError, type StorageAdapter } from "./storage-adapter";

const STORAGE_PROXY_PREFIX = "/api/storage/";

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export function createLocalFileSystemAdapter(rootDir: string): StorageAdapter {
  return {
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

      return Readable.toWeb(createReadStream(targetPath)) as ReadableStream<Uint8Array>;
    },
  };
}
