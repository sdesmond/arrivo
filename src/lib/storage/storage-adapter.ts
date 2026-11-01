import { createLocalFileSystemAdapter } from "./local-filesystem-adapter";

export class StorageNotFoundError extends Error {
  constructor(key: string) {
    super(key);
    this.name = "StorageNotFoundError";
  }
}

export interface StorageAdapter {
  put(key: string, file: File): Promise<string>;
  del(url: string): Promise<void>;
  read(key: string): Promise<ReadableStream<Uint8Array>>;
  /** Verify storage write/read/delete health; reject if any operation or cleanup fails. */
  probe(): Promise<void>;
  /** Sum actual upload file bytes, excluding transient probes and symbolic links. */
  getUsageBytes(): Promise<number>;
}

declare global {
  var __storageAdapter: StorageAdapter | undefined;
}

const SUPPORTED_STORAGE_PROVIDERS = ["local"] as const;

function createAdapterFromEnv(): StorageAdapter {
  const provider = process.env.STORAGE_PROVIDER;

  if (provider === "local") {
    const rootDir = process.env.STORAGE_LOCAL_ROOT_DIR;
    if (!rootDir) {
      throw new Error('Missing STORAGE_LOCAL_ROOT_DIR env var — required when STORAGE_PROVIDER is "local".');
    }
    return createLocalFileSystemAdapter(rootDir);
  }

  throw new Error(
    `Missing or unsupported STORAGE_PROVIDER env var: "${provider ?? ""}". Supported values: ${SUPPORTED_STORAGE_PROVIDERS.join(", ")}.`
  );
}

let cachedAdapter: StorageAdapter | undefined;

export function getStorageAdapter(): StorageAdapter {
  cachedAdapter ??= globalThis.__storageAdapter;

  if (!cachedAdapter) {
    cachedAdapter = createAdapterFromEnv();
    if (process.env.NODE_ENV !== "production") {
      globalThis.__storageAdapter = cachedAdapter;
    }
  }

  return cachedAdapter;
}

/** @internal Test-only: clears the cached adapter singleton between suites that stub different STORAGE_PROVIDER values. */
export function __resetStorageAdapterCacheForTests(): void {
  cachedAdapter = undefined;
  globalThis.__storageAdapter = undefined;
}
