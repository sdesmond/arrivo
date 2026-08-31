// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createLocalFileSystemAdapter } = vi.hoisted(() => ({
  createLocalFileSystemAdapter: vi.fn(() => ({ put: vi.fn(), del: vi.fn(), read: vi.fn() })),
}));

vi.mock("./local-filesystem-adapter", () => ({
  createLocalFileSystemAdapter,
}));

import { __resetStorageAdapterCacheForTests, getStorageAdapter, StorageNotFoundError } from "./storage-adapter";

describe("getStorageAdapter", () => {
  beforeEach(() => {
    createLocalFileSystemAdapter.mockClear();
    __resetStorageAdapterCacheForTests();
  });

  afterEach(() => {
    __resetStorageAdapterCacheForTests();
    vi.unstubAllEnvs();
  });

  it("throws a clear error when STORAGE_PROVIDER is not set", () => {
    vi.stubEnv("STORAGE_PROVIDER", undefined);

    expect(() => getStorageAdapter()).toThrow(/STORAGE_PROVIDER/);
  });

  it("throws a clear error for an unsupported STORAGE_PROVIDER value", () => {
    vi.stubEnv("STORAGE_PROVIDER", "s3");

    expect(() => getStorageAdapter()).toThrow(/STORAGE_PROVIDER/);
  });

  it("throws a clear error when STORAGE_LOCAL_ROOT_DIR is missing for the local provider", () => {
    vi.stubEnv("STORAGE_PROVIDER", "local");
    vi.stubEnv("STORAGE_LOCAL_ROOT_DIR", undefined);

    expect(() => getStorageAdapter()).toThrow(/STORAGE_LOCAL_ROOT_DIR/);
  });

  it("constructs and caches the local adapter as a singleton", () => {
    vi.stubEnv("STORAGE_PROVIDER", "local");
    vi.stubEnv("STORAGE_LOCAL_ROOT_DIR", "/data/uploads");

    const first = getStorageAdapter();
    const second = getStorageAdapter();

    expect(first).toBe(second);
    expect(createLocalFileSystemAdapter).toHaveBeenCalledTimes(1);
    expect(createLocalFileSystemAdapter).toHaveBeenCalledWith("/data/uploads");
  });

  it("clears the cached instance via __resetStorageAdapterCacheForTests so a new config takes effect", () => {
    vi.stubEnv("STORAGE_PROVIDER", "local");
    vi.stubEnv("STORAGE_LOCAL_ROOT_DIR", "/data/uploads-a");
    const first = getStorageAdapter();

    __resetStorageAdapterCacheForTests();
    vi.stubEnv("STORAGE_LOCAL_ROOT_DIR", "/data/uploads-b");
    const second = getStorageAdapter();

    expect(first).not.toBe(second);
    expect(createLocalFileSystemAdapter).toHaveBeenNthCalledWith(2, "/data/uploads-b");
  });
});

describe("StorageNotFoundError", () => {
  it("defaults its message to the key and identifies itself by name", () => {
    const error = new StorageNotFoundError("event-documents/abc/uuid.jpg");

    expect(error.message).toBe("event-documents/abc/uuid.jpg");
    expect(error.name).toBe("StorageNotFoundError");
    expect(error).toBeInstanceOf(Error);
  });
});
