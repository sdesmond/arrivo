// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createLocalFileSystemAdapter } = vi.hoisted(() => ({
  createLocalFileSystemAdapter: vi.fn(() => ({
    put: vi.fn(),
    del: vi.fn(),
    read: vi.fn(),
    probe: vi.fn(),
    getUsageBytes: vi.fn(),
  })),
}));

vi.mock("./local-filesystem-adapter", () => ({
  createLocalFileSystemAdapter,
}));

import {
  __resetStorageAdapterCacheForTests,
  getStorageAdapter,
  isStorageNotFoundError,
  isStorageOwnerNotFoundError,
  StorageNotFoundError,
  StorageOwnerNotFoundError,
} from "./storage-adapter";

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

  it("preserves measurement results and failures across singleton reuse and reset", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "local");
    vi.stubEnv("STORAGE_LOCAL_ROOT_DIR", "/data/uploads");
    const first = getStorageAdapter();
    const local = createLocalFileSystemAdapter.mock.results[0].value;
    local.probe.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("unhealthy"));
    local.getUsageBytes.mockResolvedValueOnce(123).mockRejectedValueOnce(new Error("unavailable"));
    await expect(getStorageAdapter().probe()).resolves.toBeUndefined();
    await expect(getStorageAdapter().getUsageBytes()).resolves.toBe(123);
    await expect(getStorageAdapter().probe()).rejects.toThrow("unhealthy");
    await expect(getStorageAdapter().getUsageBytes()).rejects.toThrow("unavailable");
    expect(getStorageAdapter()).toBe(first);
    __resetStorageAdapterCacheForTests();
    const replacement = getStorageAdapter();
    expect(replacement).not.toBe(first);
    expect(replacement.probe).toBeTypeOf("function");
    expect(replacement.getUsageBytes).toBeTypeOf("function");
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

describe("isStorageNotFoundError", () => {
  it("recognizes the class", () => {
    expect(isStorageNotFoundError(new StorageNotFoundError("a/b.webp"))).toBe(true);
  });

  // The adapter is cached on globalThis and shared across Next bundles, so the error can come from another
  // copy of this module where `instanceof` fails.
  it("recognizes a copy of the error from another module instance by name", () => {
    const foreign = new Error("a/b.webp");
    foreign.name = "StorageNotFoundError";
    expect(foreign instanceof StorageNotFoundError).toBe(false);
    expect(isStorageNotFoundError(foreign)).toBe(true);
  });

  it("rejects other errors and non-errors", () => {
    expect(isStorageNotFoundError(new Error("disk failure"))).toBe(false);
    expect(isStorageNotFoundError("StorageNotFoundError")).toBe(false);
    expect(isStorageNotFoundError(undefined)).toBe(false);
  });
});

describe("isStorageOwnerNotFoundError", () => {
  it("recognizes the class and a copy from another module instance by name", () => {
    expect(isStorageOwnerNotFoundError(new StorageOwnerNotFoundError("Event not found"))).toBe(true);
    const foreign = new Error("Event not found");
    foreign.name = "StorageOwnerNotFoundError";
    expect(isStorageOwnerNotFoundError(foreign)).toBe(true);
  });

  it("rejects other errors, including a missing file, and non-errors", () => {
    expect(isStorageOwnerNotFoundError(new Error("Event not found"))).toBe(false);
    expect(isStorageOwnerNotFoundError(new StorageNotFoundError("a/b.webp"))).toBe(false);
    expect(isStorageOwnerNotFoundError(undefined)).toBe(false);
  });
});
