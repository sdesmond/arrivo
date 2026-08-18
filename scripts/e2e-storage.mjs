import { mkdirSync, rmSync } from "node:fs";
import { relative, resolve } from "node:path";

export const E2E_STORAGE_DIRECTORY = ".e2e-storage";

function resolveE2EStorageRoot(rootDir) {
  const projectRoot = resolve(rootDir);
  const storageRoot = resolve(projectRoot, E2E_STORAGE_DIRECTORY);

  if (relative(projectRoot, storageRoot) !== E2E_STORAGE_DIRECTORY) {
    throw new Error("E2E storage root must resolve to the project's .e2e-storage child.");
  }

  return storageRoot;
}

export function resetE2EStorage(rootDir) {
  const storageRoot = resolveE2EStorageRoot(rootDir);
  rmSync(storageRoot, { recursive: true, force: true });
  mkdirSync(storageRoot, { recursive: true });
  return storageRoot;
}
