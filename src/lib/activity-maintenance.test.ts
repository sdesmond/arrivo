// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const { after } = vi.hoisted(() => ({ after: vi.fn() }));
vi.mock("next/server", () => ({ after }));
vi.mock("@/db", () => ({ db: {} }));
import {
  ACTIVITY_MAINTENANCE_LOCK,
  ACTIVITY_MAINTENANCE_INTERVAL_HOURS,
  cleanupActivity,
  resetActivityMaintenanceThrottle,
  scheduleActivityMaintenance,
} from "./activity-maintenance";
const INTERVAL_MS = ACTIVITY_MAINTENANCE_INTERVAL_HOURS * 60 * 60 * 1000;
const execute = vi.fn();
const database = { transaction: vi.fn(async (run) => run({ execute })) } as unknown as Parameters<
  typeof cleanupActivity
>[0];
describe("activity maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetActivityMaintenanceThrottle();
    vi.unstubAllEnvs();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  it("bounds statements and skips a contended independent lock", async () => {
    execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ locked: false }]);
    await cleanupActivity(database);
    expect(execute).toHaveBeenCalledTimes(3);
    const lockQuery = new PgDialect().sqlToQuery(execute.mock.calls[2][0]);
    expect(lockQuery.sql).toContain("hashtextextended(current_schema() || ':' || $1, 0)");
    expect(lockQuery.params).toEqual([ACTIVITY_MAINTENANCE_LOCK]);
  });
  it("runs one bounded deletion pass after obtaining its lock", async () => {
    execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([]);
    await cleanupActivity(database);
    expect(execute).toHaveBeenCalledTimes(4);
  });
  it("catches cleanup failures", async () => {
    execute.mockRejectedValueOnce(new Error("private"));
    await expect(cleanupActivity(database)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[activity-maintenance] cleanup failed (Error)");
  });
  it("schedules a pass and catches scheduler failures", async () => {
    scheduleActivityMaintenance(0);
    expect(after).toHaveBeenCalledOnce();
    await after.mock.calls[0][0]();
    after.mockImplementationOnce(() => {
      throw new Error("private");
    });
    expect(() => scheduleActivityMaintenance(INTERVAL_MS)).not.toThrow();
  });
  it("schedules at most one pass per interval", () => {
    scheduleActivityMaintenance(1_000);
    scheduleActivityMaintenance(1_000 + INTERVAL_MS - 1);
    expect(after).toHaveBeenCalledOnce();
    scheduleActivityMaintenance(1_000 + INTERVAL_MS);
    expect(after).toHaveBeenCalledTimes(2);
  });
  it("retries on the next render when scheduling failed", () => {
    after.mockImplementationOnce(() => {
      throw new Error("private");
    });
    scheduleActivityMaintenance(0);
    scheduleActivityMaintenance(1);
    expect(after).toHaveBeenCalledTimes(2);
  });
  it("runs every render when the interval is set to zero", () => {
    vi.stubEnv("ACTIVITY_MAINTENANCE_INTERVAL_HOURS", "0");
    scheduleActivityMaintenance(0);
    scheduleActivityMaintenance(0);
    expect(after).toHaveBeenCalledTimes(2);
  });
  it("defaults to twelve hours", () => {
    expect(ACTIVITY_MAINTENANCE_INTERVAL_HOURS).toBe(12);
  });
  it("accepts a fractional-hour override", () => {
    vi.stubEnv("ACTIVITY_MAINTENANCE_INTERVAL_HOURS", "0.5");
    scheduleActivityMaintenance(0);
    scheduleActivityMaintenance(30 * 60 * 1000 - 1);
    expect(after).toHaveBeenCalledOnce();
    scheduleActivityMaintenance(30 * 60 * 1000);
    expect(after).toHaveBeenCalledTimes(2);
  });
  it("ignores an invalid interval override", () => {
    vi.stubEnv("ACTIVITY_MAINTENANCE_INTERVAL_HOURS", "soon");
    scheduleActivityMaintenance(0);
    scheduleActivityMaintenance(1);
    expect(after).toHaveBeenCalledOnce();
  });
  it("contains non-Error failures without logging their values", async () => {
    execute.mockRejectedValueOnce("private");
    await cleanupActivity(database);
    expect(console.error).toHaveBeenCalledWith("[activity-maintenance] cleanup failed (UnknownError)");
  });
});
