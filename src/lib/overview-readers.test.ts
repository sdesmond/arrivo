import { describe, expect, it, vi } from "vitest";
const { execute, from } = vi.hoisted(() => ({ execute: vi.fn(), from: vi.fn() }));
const { getStorageAdapter } = vi.hoisted(() => ({ getStorageAdapter: vi.fn() }));
vi.mock("@/db", () => ({ db: { execute, select: () => ({ from }) } }));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter }));
const { readRecentActivity, countActivitySince } = vi.hoisted(() => ({
  readRecentActivity: vi.fn(),
  countActivitySince: vi.fn(),
}));
vi.mock("@/lib/activity-queries", () => ({ readRecentActivity, countActivitySince }));
import { db as appDb } from "@/db";
import { ActivityEventType, type ActivityEventSummary } from "@/data/types";
import {
  ADMIN_ACTION_TYPES,
  defaultOverviewDb,
  readFailedSignIns,
  readRecentAdminActions,
  readDatabaseHealth,
  readUserCounts,
  readVersion,
  readStorageHealth,
  readUploadStorageBytes,
  readTripCount,
  readDocumentCount,
  type OverviewDb,
} from "./overview-readers";
import type { StorageAdapter } from "./storage/storage-adapter";
import { documents, trips } from "@/db/schema";

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
    countTrips: vi.fn().mockResolvedValue(3),
    countDocuments: vi.fn().mockResolvedValue(7),
    recentAdminActions: vi.fn().mockResolvedValue([]),
    countFailedSignIns: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe("recent admin actions and failed sign-ins", () => {
  const event: ActivityEventSummary = {
    id: "e1",
    type: ActivityEventType.RoleChanged,
    actorUsername: "alice",
    targetUsername: "bob",
    targetKnown: true,
    occurredAt: "2026-10-30T11:00:00.000Z",
  };

  it("names exactly the nine admin action types", () => {
    expect([...ADMIN_ACTION_TYPES].sort()).toEqual(
      [
        ActivityEventType.RetentionChanged,
        ActivityEventType.AccountCreated,
        ActivityEventType.SetupLinkGenerated,
        ActivityEventType.SetupLinkRegenerated,
        ActivityEventType.PendingAccountDeleted,
        ActivityEventType.RoleChanged,
        ActivityEventType.PasswordResetLinkGenerated,
        ActivityEventType.AdminRecoveryLinkGenerated,
        ActivityEventType.AccountDeletedByAdmin,
      ].sort()
    );
  });

  it("returns the recent admin actions with their checked time", async () => {
    const db = fakeDb({ recentAdminActions: vi.fn().mockResolvedValue([event]) });
    await expect(readRecentAdminActions(db, now)).resolves.toEqual({
      status: "ok",
      value: [event],
      checkedAt: now.toISOString(),
    });
  });

  it("counts failed sign-ins since exactly 24 hours before the check, keeping 0 as ok", async () => {
    const db = fakeDb();
    await expect(readFailedSignIns(db, now)).resolves.toEqual({ status: "ok", value: 0, checkedAt: now.toISOString() });
    expect(db.countFailedSignIns).toHaveBeenCalledWith(new Date("2026-10-29T12:00:00.000Z"));
  });

  it("measures the window from the real clock when no time is given", async () => {
    const db = fakeDb({ countFailedSignIns: vi.fn().mockResolvedValue(4) });
    const metric = await readFailedSignIns(db);
    expect(metric).toMatchObject({ status: "ok", value: 4 });
    const since = vi.mocked(db.countFailedSignIns).mock.calls[0][0];
    expect(Date.parse(metric.checkedAt) - since.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("isolates each failure as unavailable, never 0 or an empty list", async () => {
    const db = fakeDb({
      recentAdminActions: vi.fn().mockRejectedValue(new Error("private failure")),
      countFailedSignIns: vi.fn().mockRejectedValue(new Error("private failure")),
    });
    await expect(readRecentAdminActions(db, now)).resolves.toEqual({
      status: "unavailable",
      checkedAt: now.toISOString(),
    });
    await expect(readFailedSignIns(db, now)).resolves.toEqual({ status: "unavailable", checkedAt: now.toISOString() });
    await expect(readTripCount(db, now)).resolves.toMatchObject({ status: "ok", value: 3 });
  });

  it("reads the latest five admin actions and failed sign-ins through the default database", async () => {
    readRecentActivity.mockResolvedValue([event]);
    countActivitySince.mockResolvedValue(2);
    await expect(readRecentAdminActions(undefined, now)).resolves.toMatchObject({ status: "ok", value: [event] });
    expect(readRecentActivity).toHaveBeenCalledWith(appDb, ADMIN_ACTION_TYPES, 5);
    await expect(readFailedSignIns(undefined, now)).resolves.toMatchObject({ status: "ok", value: 2 });
    expect(countActivitySince).toHaveBeenCalledWith(
      appDb,
      ActivityEventType.SignInFailed,
      new Date("2026-10-29T12:00:00.000Z")
    );
  });
});

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
    const db = fakeDb();
    const result = await readUserCounts(db, now);
    expect(db.countUsers).toHaveBeenCalledOnce();
    expect(result).toEqual({
      users: { status: "ok", value: 5, checkedAt: now.toISOString() },
      admins: { status: "ok", value: 2, checkedAt: now.toISOString() },
      pending: { status: "ok", value: 0, checkedAt: now.toISOString() },
    });
    expect(new Set(Object.values(result)).size).toBe(3);
  });

  it.each(["throws", "rejects"])("marks every count unavailable when the query %s", async (failure) => {
    const countUsers = vi.fn<OverviewDb["countUsers"]>();
    if (failure === "throws") {
      countUsers.mockImplementation(() => {
        throw new Error("private failure");
      });
    } else {
      countUsers.mockRejectedValue(new Error("private failure"));
    }
    const db = fakeDb({ countUsers });
    const result = await readUserCounts(db, now);
    expect(countUsers).toHaveBeenCalledOnce();
    for (const metric of Object.values(result)) {
      expect(metric).toEqual({ status: "unavailable", checkedAt: now.toISOString() });
    }
    expect(new Set(Object.values(result)).size).toBe(3);
  });

  it("uses one shared check time when no time is supplied", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(now);
      const result = await readUserCounts(fakeDb());
      expect(Object.values(result).map((metric) => metric.checkedAt)).toEqual([
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("defaultOverviewDb", () => {
  it.each([
    ["trips", trips, readTripCount],
    ["documents", documents, readDocumentCount],
  ] as const)("counts only %s through the default database, including empty tables", async (_label, table, reader) => {
    for (const total of [0, 8]) {
      from.mockResolvedValueOnce([{ total }]);
      await expect(reader(undefined, now)).resolves.toEqual({
        status: "ok",
        value: total,
        checkedAt: now.toISOString(),
      });
      expect(from).toHaveBeenLastCalledWith(table);
    }
  });
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

describe("trip and document count readers", () => {
  const documentTime = new Date("2026-10-30T12:00:01.000Z");

  it.each([0, 12])("keeps exact count %i and each measurement time", async (total) => {
    const db = fakeDb({
      countTrips: vi.fn().mockResolvedValue(total),
      countDocuments: vi.fn().mockResolvedValue(total),
    });
    await expect(readTripCount(db, now)).resolves.toEqual({ status: "ok", value: total, checkedAt: now.toISOString() });
    await expect(readDocumentCount(db, documentTime)).resolves.toEqual({
      status: "ok",
      value: total,
      checkedAt: documentTime.toISOString(),
    });
    expect(db.countTrips).toHaveBeenCalledOnce();
    expect(db.countDocuments).toHaveBeenCalledOnce();
    expect(db.countUsers).not.toHaveBeenCalled();
    expect(db.ping).not.toHaveBeenCalled();
  });

  it.each(["countTrips", "countDocuments", "both"] as const)("isolates failures when %s rejects", async (failure) => {
    const db = fakeDb({
      ...(failure !== "countDocuments"
        ? { countTrips: vi.fn().mockRejectedValue(new Error("private trip failure")) }
        : {}),
      ...(failure !== "countTrips"
        ? { countDocuments: vi.fn().mockRejectedValue(new Error("private document failure")) }
        : {}),
    });
    const [tripMetric, documentMetric] = await Promise.all([
      readTripCount(db, now),
      readDocumentCount(db, documentTime),
    ]);
    expect(tripMetric).toEqual(
      failure === "countDocuments"
        ? { status: "ok", value: 3, checkedAt: now.toISOString() }
        : { status: "unavailable", checkedAt: now.toISOString() }
    );
    expect(documentMetric).toEqual(
      failure === "countTrips"
        ? { status: "ok", value: 7, checkedAt: documentTime.toISOString() }
        : { status: "unavailable", checkedAt: documentTime.toISOString() }
    );
  });
});
