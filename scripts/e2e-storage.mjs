import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { relative, resolve } from "node:path";

export const E2E_STORAGE_DIRECTORY = ".e2e-storage";
export const BOOTSTRAP_E2E_STORAGE_DIRECTORY = ".e2e-bootstrap-storage";

function resolveE2EStorageRoot(rootDir, bootstrap) {
  const directory = bootstrap ? BOOTSTRAP_E2E_STORAGE_DIRECTORY : E2E_STORAGE_DIRECTORY;
  const projectRoot = resolve(rootDir);
  const storageRoot = resolve(projectRoot, directory);

  if (relative(projectRoot, storageRoot) !== directory) {
    throw new Error("E2E storage root must resolve to its fixed project child.");
  }

  return storageRoot;
}

/**
 * Keeps Windows Search out of E2E uploads. The indexer reads new files under the user profile while holding them open
 * without delete sharing, so deleting a fresh 25 MiB upload waits until it lets go: 30 to 90 s, longer than a whole
 * scenario. Folders and files created later under a folder marked "not content indexed" inherit the mark, so marking
 * the root covers every upload the dev server writes.
 */
function excludeFromContentIndexing(directory, platform, run) {
  if (platform !== "win32") return;
  const result = run("attrib.exe", ["+I", directory], { stdio: "ignore" });
  if (result.error || result.status !== 0) {
    console.warn(
      `[e2e-storage] Could not mark ${directory} not content indexed; Windows Search may stall deletes of large uploads.`
    );
  }
}

export function resetE2EStorage(rootDir, bootstrap = false, { platform = process.platform, run = spawnSync } = {}) {
  const storageRoot = resolveE2EStorageRoot(rootDir, bootstrap);
  rmSync(storageRoot, { recursive: true, force: true });
  mkdirSync(storageRoot, { recursive: true });
  excludeFromContentIndexing(storageRoot, platform, run);
  return storageRoot;
}
