import { describe, expect, it, vi } from "vitest";
const { execute, from } = vi.hoisted(() => ({ execute: vi.fn(), from: vi.fn() }));
vi.mock("@/db", () => ({ db: { execute, select: () => ({ from }) } }));
import {
  defaultOverviewDb,
  readDatabaseHealth,
  readUserCounts,
  readVersion,
  type OverviewDb,
} from "./overview-readers";

const now = new Date("2026-10-30T12:00:00.000Z");

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
