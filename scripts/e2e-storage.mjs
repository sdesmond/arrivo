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

export function resetE2EStorage(rootDir, bootstrap = false) {
  const storageRoot = resolveE2EStorageRoot(rootDir, bootstrap);
  rmSync(storageRoot, { recursive: true, force: true });
  mkdirSync(storageRoot, { recursive: true });
  return storageRoot;
}
