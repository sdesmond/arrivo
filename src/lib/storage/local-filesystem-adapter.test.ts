// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StorageNotFoundError } from "./storage-adapter";

const { unlinkMock, writeFileMock } = vi.hoisted(() => ({ unlinkMock: vi.fn(), writeFileMock: vi.fn() }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  unlinkMock.mockImplementation(actual.unlink);
  writeFileMock.mockImplementation(actual.writeFile);
  return { ...actual, unlink: unlinkMock, writeFile: writeFileMock };
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
    unlinkMock.mockClear();
    writeFileMock.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(rootDir, { recursive: true, force: true });
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
