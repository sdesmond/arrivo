// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StorageNotFoundError } from "./storage-adapter";

const { unlinkMock, writeFileMock, readFileMock, readdirMock, lstatMock } = vi.hoisted(() => ({
  unlinkMock: vi.fn(),
  writeFileMock: vi.fn(),
  readFileMock: vi.fn(),
  readdirMock: vi.fn(),
  lstatMock: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  unlinkMock.mockImplementation(actual.unlink);
  writeFileMock.mockImplementation(actual.writeFile);
  readFileMock.mockImplementation(actual.readFile);
  readdirMock.mockImplementation(actual.readdir);
  lstatMock.mockImplementation(actual.lstat);
  return {
    ...actual,
    unlink: unlinkMock,
    writeFile: writeFileMock,
    readFile: readFileMock,
    readdir: readdirMock,
    lstat: lstatMock,
  };
});

import { createLocalFileSystemAdapter } from "./local-filesystem-adapter";

function makeFile(name: string, contents: string, type = "text/plain"): File {
  return new File([contents], name, { type });
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

describe("createLocalFileSystemAdapter", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "storage-test-"));
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    unlinkMock.mockReset().mockImplementation(actual.unlink);
    writeFileMock.mockReset().mockImplementation(actual.writeFile);
    readFileMock.mockReset().mockImplementation(actual.readFile);
    readdirMock.mockReset().mockImplementation(actual.readdir);
    lstatMock.mockReset().mockImplementation(actual.lstat);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await rm(rootDir, { recursive: true, force: true });
  });

  describe("probe", () => {
    it("creates a missing root, verifies bytes and removes its exclusive probe", async () => {
      const missingRoot = join(rootDir, "missing");
      await expect(createLocalFileSystemAdapter(missingRoot).probe()).resolves.toBeUndefined();
      expect(await readdir(join(missingRoot, ".storage-probes"))).toEqual([]);
      expect(writeFileMock).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), { flag: "wx" });
      expect(readFileMock).toHaveBeenCalled();
    });

    it("uses independent keys for parallel probes and preserves uploads", async () => {
      const adapter = createLocalFileSystemAdapter(rootDir);
      await adapter.put("cover.jpg", makeFile("cover.jpg", "cover"));
      writeFileMock.mockClear();
      await Promise.all(Array.from({ length: 8 }, () => adapter.probe()));
      const paths = writeFileMock.mock.calls.map(([path]) => path);
      expect(new Set(paths).size).toBe(8);
      expect(await readdir(join(rootDir, ".storage-probes"))).toEqual([]);
      expect(await readFile(join(rootDir, "cover.jpg"), "utf8")).toBe("cover");
    });

    it.each(["write", "read", "mismatch", "cleanup"])("rejects %s failure and attempts cleanup", async (failure) => {
      const adapter = createLocalFileSystemAdapter(rootDir);
      const failedOperation = new Error("probe operation failed");
      if (failure === "write") writeFileMock.mockRejectedValueOnce(failedOperation);
      if (failure === "read") readFileMock.mockRejectedValueOnce(failedOperation);
      if (failure === "mismatch") readFileMock.mockResolvedValueOnce(Buffer.from("wrong bytes"));
      if (failure === "cleanup") unlinkMock.mockRejectedValueOnce(failedOperation);
      await expect(adapter.probe()).rejects.toThrow();
      expect(unlinkMock).toHaveBeenCalled();
      if (failure !== "cleanup") expect(await readdir(join(rootDir, ".storage-probes"))).toEqual([]);
    });

    it.each(["test", "e2e"])("reads the failure marker on every %s call", async (mode) => {
      vi.stubEnv("NODE_ENV", mode === "test" ? "test" : "production");
      vi.stubEnv("E2E_MODE", mode === "e2e" ? "true" : "false");
      const adapter = createLocalFileSystemAdapter(rootDir);
      await adapter.probe();
      const marker = join(rootDir, ".storage-probes", "force-failure");
      await writeFile(marker, "fail");
      await expect(adapter.probe()).rejects.toThrow();
      await rm(marker);
      await expect(adapter.probe()).resolves.toBeUndefined();
    });

    it("ignores the failure marker outside test runtime", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("E2E_MODE", "false");
      await mkdir(join(rootDir, ".storage-probes"));
      await writeFile(join(rootDir, ".storage-probes", "force-failure"), "fail");
      await expect(createLocalFileSystemAdapter(rootDir).probe()).resolves.toBeUndefined();
    });

    it("preserves marker lookup errors", async () => {
      const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      lstatMock.mockImplementation(async (path: string) => {
        if (path === join(rootDir, ".storage-probes", "force-failure")) {
          throw Object.assign(new Error("denied"), { code: "EACCES" });
        }
        return actual.lstat(path);
      });
      await expect(createLocalFileSystemAdapter(rootDir).probe()).rejects.toThrow("denied");
    });

    it("rejects a symlinked probe directory without writing through it", async () => {
      const target = join(rootDir, "target");
      await mkdir(target);
      await symlink(target, join(rootDir, ".storage-probes"), "junction");
      await expect(createLocalFileSystemAdapter(rootDir).probe()).rejects.toThrow("real directory");
      expect(await readdir(target)).toEqual([]);
      expect(writeFileMock).not.toHaveBeenCalled();
    });

    it("removes partial probe data when a write fails", async () => {
      const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      writeFileMock.mockImplementationOnce(async (path: string) => {
        await actual.writeFile(path, "partial", { flag: "wx" });
        throw new Error("partial write failed");
      });
      await expect(createLocalFileSystemAdapter(rootDir).probe()).rejects.toThrow("partial write failed");
      expect(await readdir(join(rootDir, ".storage-probes"))).toEqual([]);
    });

    it("does not delete another probe after an exclusive-create collision", async () => {
      writeFileMock.mockRejectedValueOnce(Object.assign(new Error("collision"), { code: "EEXIST" }));
      await expect(createLocalFileSystemAdapter(rootDir).probe()).rejects.toThrow("collision");
      expect(unlinkMock).not.toHaveBeenCalled();
    });

    it("rejects when the verified probe disappears before strict cleanup", async () => {
      unlinkMock.mockRejectedValueOnce(Object.assign(new Error("gone"), { code: "ENOENT" }));
      await expect(createLocalFileSystemAdapter(rootDir).probe()).rejects.toThrow("gone");
    });
  });

  describe("getUsageBytes", () => {
    it("returns zero for empty and missing roots", async () => {
      await expect(createLocalFileSystemAdapter(rootDir).getUsageBytes()).resolves.toBe(0);
      await expect(createLocalFileSystemAdapter(join(rootDir, "missing")).getUsageBytes()).resolves.toBe(0);
    });

    it("counts nested document and cover bytes including UTF-8 and empty files, excluding reserved probes", async () => {
      const adapter = createLocalFileSystemAdapter(rootDir);
      await adapter.put("documents/nested/doc.txt", makeFile("doc.txt", "旅🧳"));
      await adapter.put("covers/cover.jpg", makeFile("cover.jpg", "cover"));
      await adapter.put("empty", makeFile("empty", ""));
      await adapter.put(".storage-probes/leftover", makeFile("leftover", "ignored"));
      await adapter.put(".storage-probes/force-failure", makeFile("force-failure", "ignored"));
      await adapter.put("documents/.storage-probes/real-upload", makeFile("real-upload", "count"));
      await expect(adapter.getUsageBytes()).resolves.toBe(Buffer.byteLength("旅🧳covercount"));
    });

    it("skips file and directory symlinks without visiting their targets", async () => {
      const outsideRoot = join(rootDir, "outside");
      const uploads = join(rootDir, "uploads");
      await mkdir(outsideRoot);
      await mkdir(uploads);
      await writeFile(join(outsideRoot, "secret"), "outside bytes");
      // Junctions work without Windows symlink privileges; mock a file link separately.
      await symlink(outsideRoot, join(uploads, "linked-directory"), "junction");
      await writeFile(join(uploads, "linked-file"), "ignored");
      const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      lstatMock.mockImplementation(async (path: string) =>
        path === join(uploads, "linked-file") ? { isSymbolicLink: () => true } : actual.lstat(path)
      );
      await expect(createLocalFileSystemAdapter(uploads).getUsageBytes()).resolves.toBe(0);
    });

    it("ignores entries and directories that disappear during traversal", async () => {
      await mkdir(join(rootDir, "vanished-directory"));
      await writeFile(join(rootDir, "vanished-file"), "gone");
      const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      lstatMock.mockImplementation(async (path: string) => {
        if (path === join(rootDir, "vanished-file")) throw Object.assign(new Error("gone"), { code: "ENOENT" });
        return actual.lstat(path);
      });
      readdirMock.mockImplementation(async (path: string) => {
        if (path === join(rootDir, "vanished-directory")) throw Object.assign(new Error("gone"), { code: "ENOENT" });
        return actual.readdir(path);
      });
      await expect(createLocalFileSystemAdapter(rootDir).getUsageBytes()).resolves.toBe(0);
    });

    it.each(["stat", "readdir"])("preserves %s traversal errors", async (operation) => {
      const error = Object.assign(new Error("denied"), { code: "EACCES" });
      if (operation === "stat") lstatMock.mockRejectedValueOnce(error);
      else readdirMock.mockRejectedValueOnce(error);
      await expect(createLocalFileSystemAdapter(rootDir).getUsageBytes()).rejects.toThrow("denied");
    });

    it("preserves non-filesystem errors and ignores special file entries", async () => {
      lstatMock.mockResolvedValueOnce({
        isSymbolicLink: () => false,
        isFile: () => false,
        isDirectory: () => false,
      });
      await expect(createLocalFileSystemAdapter(rootDir).getUsageBytes()).resolves.toBe(0);
      lstatMock.mockRejectedValueOnce("unexpected failure");
      await expect(createLocalFileSystemAdapter(rootDir).getUsageBytes()).rejects.toBe("unexpected failure");
    });
  });

  describe("put", () => {
    it("writes the file under rootDir at the key path, creating subdirectories, and returns the proxy URL", async () => {
      const adapter = createLocalFileSystemAdapter(rootDir);
      const file = makeFile("photo.jpg", "hello world");

      const url = await adapter.put("event-documents/abc-123/uuid.jpg", file);

      expect(url).toBe("/api/storage/event-documents/abc-123/uuid.jpg");
      const written = await readFile(join(rootDir, "event-documents", "abc-123", "uuid.jpg"), "utf-8");
      expect(written).toBe("hello world");
    });

    it("re-throws EACCES with a message naming the full path and a PUID/PGID hint", async () => {
      const adapter = createLocalFileSystemAdapter(rootDir);
      const file = makeFile("photo.jpg", "hello world");
      const eaccesError = Object.assign(new Error("permission denied"), { code: "EACCES" });
      writeFileMock.mockRejectedValueOnce(eaccesError);
      const targetPath = join(rootDir, "trip-documents", "trip-1", "uuid.jpg");

      let thrown: unknown;
      try {
        await adapter.put("trip-documents/trip-1/uuid.jpg", file);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain(targetPath);
      expect((thrown as Error).message).toMatch(/PUID|PGID/);
    });
  });

  describe("del", () => {
    it("deletes the file on disk when the URL matches the /api/storage/ prefix", async () => {
      const adapter = createLocalFileSystemAdapter(rootDir);
      const file = makeFile("doc.pdf", "content");
      const url = await adapter.put("trip-documents/trip-1/uuid.pdf", file);

      await adapter.del(url);

      await expect(readFile(join(rootDir, "trip-documents", "trip-1", "uuid.pdf"))).rejects.toThrow();
    });

    it("no-ops without throwing for URLs it does not recognize", async () => {
      const adapter = createLocalFileSystemAdapter(rootDir);

      await expect(
        adapter.del("https://abc123.public.blob.vercel-storage.com/trip-documents/trip-1/uuid.pdf")
      ).resolves.toBeUndefined();
    });

    it("swallows errors instead of throwing when the recognized file is already missing", async () => {
      const adapter = createLocalFileSystemAdapter(rootDir);

      await expect(adapter.del("/api/storage/trip-documents/trip-1/does-not-exist.pdf")).resolves.toBeUndefined();
      expect(console.warn).toHaveBeenCalled();
    });

    it("does not throw and logs a warning when unlink rejects with a non-ENOENT error (EACCES)", async () => {
      const adapter = createLocalFileSystemAdapter(rootDir);
      const file = makeFile("doc.pdf", "content");
      const url = await adapter.put("trip-documents/trip-1/uuid.pdf", file);
      const eaccesError = Object.assign(new Error("permission denied"), { code: "EACCES" });
      unlinkMock.mockRejectedValueOnce(eaccesError);

      await expect(adapter.del(url)).resolves.toBeUndefined();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe("read", () => {
    it("returns file bytes as a ReadableStream<Uint8Array> for an existing file", async () => {
      const adapter = createLocalFileSystemAdapter(rootDir);
      const file = makeFile("doc.pdf", "file contents");
      await adapter.put("trip-documents/trip-1/uuid.pdf", file);

      const stream = await adapter.read("trip-documents/trip-1/uuid.pdf");

      expect(stream).toBeInstanceOf(ReadableStream);
      await expect(streamToString(stream)).resolves.toBe("file contents");
    });

    it("throws StorageNotFoundError for a missing key", async () => {
      const adapter = createLocalFileSystemAdapter(rootDir);

      await expect(adapter.read("trip-documents/trip-1/nope.pdf")).rejects.toBeInstanceOf(StorageNotFoundError);
    });
  });
});
