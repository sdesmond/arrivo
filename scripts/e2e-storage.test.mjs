import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("resetE2EStorage", async () => {
  const tempRoots = [];
  const { E2E_STORAGE_DIRECTORY, BOOTSTRAP_E2E_STORAGE_DIRECTORY, resetE2EStorage } = await import("./e2e-storage.mjs");

  afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  function createProjectRoot() {
    const rootDir = mkdtempSync(join(tmpdir(), "e2e-storage-"));
    tempRoots.push(rootDir);
    return rootDir;
  }

  it("removes stale nested files and recreates the E2E storage root", () => {
    const rootDir = createProjectRoot();
    const staleFile = join(rootDir, E2E_STORAGE_DIRECTORY, "trip-documents", "trip-1", "stale.pdf");
    mkdirSync(join(rootDir, E2E_STORAGE_DIRECTORY, "trip-documents", "trip-1"), { recursive: true });
    writeFileSync(staleFile, "stale", "utf8");

    const storageRoot = resetE2EStorage(rootDir);

    expect(E2E_STORAGE_DIRECTORY).toBe(".e2e-storage");
    expect(storageRoot).toBe(join(rootDir, E2E_STORAGE_DIRECTORY));
    expect(existsSync(storageRoot)).toBe(true);
    expect(existsSync(staleFile)).toBe(false);
  });

  it("resets bootstrap storage as a separate sibling without changing normal storage", () => {
    const rootDir = createProjectRoot();
    mkdirSync(join(rootDir, E2E_STORAGE_DIRECTORY));
    writeFileSync(join(rootDir, E2E_STORAGE_DIRECTORY, "keep.txt"), "keep");
    mkdirSync(join(rootDir, BOOTSTRAP_E2E_STORAGE_DIRECTORY));
    writeFileSync(join(rootDir, BOOTSTRAP_E2E_STORAGE_DIRECTORY, "stale.txt"), "stale");
    const storageRoot = resetE2EStorage(rootDir, true);
    expect(storageRoot).toBe(join(rootDir, ".e2e-bootstrap-storage"));
    expect(existsSync(join(storageRoot, "stale.txt"))).toBe(false);
    expect(readFileSync(join(rootDir, E2E_STORAGE_DIRECTORY, "keep.txt"), "utf8")).toBe("keep");
  });

  it("creates the E2E storage root when it does not exist", () => {
    const rootDir = createProjectRoot();

    const storageRoot = resetE2EStorage(rootDir);

    expect(existsSync(storageRoot)).toBe(true);
  });

  it("leaves project files outside the fixed E2E storage child untouched", () => {
    const rootDir = createProjectRoot();
    const projectFile = join(rootDir, "keep.txt");
    writeFileSync(projectFile, "keep", "utf8");
    mkdirSync(join(rootDir, E2E_STORAGE_DIRECTORY), { recursive: true });

    resetE2EStorage(rootDir);

    expect(readFileSync(projectFile, "utf8")).toBe("keep");
  });

  function recordingRunner(result = { status: 0 }) {
    const calls = [];
    const run = (...args) => {
      calls.push(args);
      return result;
    };
    return { calls, run };
  }

  it.each([false, true])("marks the recreated root not content indexed on Windows (bootstrap: %s)", (bootstrap) => {
    const rootDir = createProjectRoot();
    const { calls, run } = recordingRunner();

    const storageRoot = resetE2EStorage(rootDir, bootstrap, { platform: "win32", run });

    expect(calls).toEqual([["attrib.exe", ["+I", storageRoot], { stdio: "ignore" }]]);
  });

  it("leaves the root unmarked on platforms without Windows Search", () => {
    const rootDir = createProjectRoot();
    const { calls, run } = recordingRunner();

    resetE2EStorage(rootDir, false, { platform: "linux", run });

    expect(calls).toEqual([]);
  });

  it.each([
    ["exits non-zero", { status: 1 }],
    ["cannot start", { status: null, error: new Error("spawn attrib.exe ENOENT") }],
  ])("warns and still resets the root when attrib %s", (_case, result) => {
    const rootDir = createProjectRoot();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const storageRoot = resetE2EStorage(rootDir, false, { platform: "win32", run: recordingRunner(result).run });

      expect(existsSync(storageRoot)).toBe(true);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("not content indexed"));
    } finally {
      warn.mockRestore();
    }
  });

  // The fix relies on NTFS handing the mark down to folders and files the dev server creates later.
  it.runIf(process.platform === "win32")("keeps uploads written later under the root out of the content index", () => {
    const rootDir = createProjectRoot();
    const isNotContentIndexed = (path) => {
      const listing = execFileSync("attrib.exe", [path], { encoding: "utf8" });
      return /\bI\b/.test(listing.slice(0, listing.toLowerCase().indexOf(path.toLowerCase())));
    };
    const storageRoot = resetE2EStorage(rootDir);
    mkdirSync(join(storageRoot, "event-documents", "event-1"), { recursive: true });
    const upload = join(storageRoot, "event-documents", "event-1", "upload.pdf");
    writeFileSync(upload, "%PDF-1.4");
    const outside = join(rootDir, "outside.pdf");
    writeFileSync(outside, "%PDF-1.4");

    expect(isNotContentIndexed(upload)).toBe(true);
    expect(isNotContentIndexed(outside)).toBe(false);
  });
});
