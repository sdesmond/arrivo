import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

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
});
