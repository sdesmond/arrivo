import { describe, expect, it, vi } from "vitest";
const { execute, from } = vi.hoisted(() => ({ execute: vi.fn(), from: vi.fn() }));
const { getStorageAdapter } = vi.hoisted(() => ({ getStorageAdapter: vi.fn() }));
vi.mock("@/db", () => ({ db: { execute, select: () => ({ from }) } }));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter }));
import {
  defaultOverviewDb,
  readDatabaseHealth,
  readUserCounts,
  readVersion,
  readStorageHealth,
  readUploadStorageBytes,
  type OverviewDb,
} from "./overview-readers";
import type { StorageAdapter } from "./storage/storage-adapter";

const now = new Date("2026-10-30T12:00:00.000Z");

function fakeStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    put: vi.fn(),
    del: vi.fn(),
    read: vi.fn(),
    probe: vi.fn().mockResolvedValue(undefined),
    getUsageBytes: vi.fn().mockResolvedValue(1234567),
    ...overrides,
  };
}

describe("storage readers", () => {
  it("reports healthy storage with its checked time", async () => {
    const storage = fakeStorage();
    await expect(readStorageHealth(storage, now)).resolves.toEqual({
      status: "ok",
      value: "Healthy",
      checkedAt: now.toISOString(),
    });
    expect(storage.probe).toHaveBeenCalledOnce();
    expect(storage.getUsageBytes).not.toHaveBeenCalled();
  });

  it.each([0, 1234567])("reports exact usage of %i bytes with its checked time", async (bytes) => {
    const storage = fakeStorage({ getUsageBytes: vi.fn().mockResolvedValue(bytes) });
    await expect(readUploadStorageBytes(storage, now)).resolves.toEqual({
      status: "ok",
      value: bytes,
      checkedAt: now.toISOString(),
    });
    expect(storage.getUsageBytes).toHaveBeenCalledOnce();
    expect(storage.probe).not.toHaveBeenCalled();
  });

  it.each(["probe", "getUsageBytes"] as const)(
    "keeps outcomes and checked times independent when %s rejects",
    async (method) => {
      const storage = fakeStorage({ [method]: vi.fn().mockRejectedValue(new Error("private failure")) });
      const usageTime = new Date("2026-10-30T12:00:01.000Z");
      const [health, usage] = await Promise.all([
        readStorageHealth(storage, now),
        readUploadStorageBytes(storage, usageTime),
      ]);
      expect(health).toEqual(
        method === "probe"
          ? { status: "unavailable", checkedAt: now.toISOString() }
          : { status: "ok", value: "Healthy", checkedAt: now.toISOString() }
      );
      expect(usage).toEqual(
        method === "getUsageBytes"
          ? { status: "unavailable", checkedAt: usageTime.toISOString() }
          : { status: "ok", value: 1234567, checkedAt: usageTime.toISOString() }
      );
    }
  );

  it("delegates both default readers to the storage factory", async () => {
    const storage = fakeStorage();
    getStorageAdapter.mockReturnValue(storage);
    await expect(readStorageHealth()).resolves.toMatchObject({
      status: "ok",
      value: "Healthy",
      checkedAt: expect.any(String),
    });
    await expect(readUploadStorageBytes()).resolves.toMatchObject({
      status: "ok",
      value: 1234567,
      checkedAt: expect.any(String),
    });
    expect(storage.probe).toHaveBeenCalledOnce();
    expect(storage.getUsageBytes).toHaveBeenCalledOnce();
  });

  it("contains factory exceptions within each measurement", async () => {
    getStorageAdapter.mockImplementation(() => {
      throw new Error("private config failure");
    });
    await expect(readStorageHealth(undefined, now)).resolves.toEqual({
      status: "unavailable",
      checkedAt: now.toISOString(),
    });
    await expect(readUploadStorageBytes(undefined, now)).resolves.toEqual({
      status: "unavailable",
      checkedAt: now.toISOString(),
    });
  });
});

function fakeDb(overrides: Partial<OverviewDb> = {}): OverviewDb {
  return {
    ping: vi.fn().mockResolvedValue(undefined),
    countUsers: vi.fn().mockResolvedValue({ users: 5, admins: 2, pending: 0 }),
    ...overrides,
  };
}

describe("readVersion", () => {
  it("returns the injected APP_VERSION", async () => {
    vi.stubEnv("APP_VERSION", "1.2.3");
    await expect(readVersion(now)).resolves.toEqual({
      status: "ok",
      value: "1.2.3",
      checkedAt: "2026-10-30T12:00:00.000Z",
    });
    vi.unstubAllEnvs();
  });

  it("is unavailable when APP_VERSION is missing", async () => {
    vi.stubEnv("APP_VERSION", "");
    await expect(readVersion(now)).resolves.toMatchObject({ status: "unavailable" });
    vi.unstubAllEnvs();
  });
});

describe("readDatabaseHealth", () => {
  it("is ok when the ping resolves", async () => {
    await expect(readDatabaseHealth(fakeDb(), now)).resolves.toMatchObject({ status: "ok", value: "Healthy" });
  });

  it("is unavailable when the ping rejects", async () => {
    const db = fakeDb({ ping: vi.fn().mockRejectedValue(new Error("down")) });
    await expect(readDatabaseHealth(db, now)).resolves.toEqual({
      status: "unavailable",
      checkedAt: "2026-10-30T12:00:00.000Z",
    });
  });
});

describe("readUserCounts", () => {
  it("returns an independent metric per count, keeping 0 as ok", async () => {
    const result = await readUserCounts(fakeDb(), now);
    expect(result.users).toMatchObject({ status: "ok", value: 5 });
    expect(result.admins).toMatchObject({ status: "ok", value: 2 });
    expect(result.pending).toMatchObject({ status: "ok", value: 0 });
  });

  it("marks every count unavailable when the query rejects", async () => {
    const db = fakeDb({ countUsers: vi.fn().mockRejectedValue(new Error("down")) });
    const result = await readUserCounts(db, now);
    expect(result.users.status).toBe("unavailable");
    expect(result.admins.status).toBe("unavailable");
    expect(result.pending.status).toBe("unavailable");
  });
});

describe("defaultOverviewDb", () => {
  it("pings the database with execute", async () => {
    execute.mockResolvedValue([{ "?column?": 1 }]);
    await defaultOverviewDb.ping();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("maps the aggregate row to user counts", async () => {
    from.mockResolvedValue([{ total: 7, admins: 2, pending: 1 }]);
    await expect(defaultOverviewDb.countUsers()).resolves.toEqual({ users: 7, admins: 2, pending: 1 });
  });
});
