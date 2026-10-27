// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const { after } = vi.hoisted(() => ({ after: vi.fn() }));
vi.mock("next/server", () => ({ after }));
vi.mock("@/db", () => ({ db: {} }));
import { ACTIVITY_MAINTENANCE_LOCK, cleanupActivity, scheduleActivityMaintenance } from "./activity-maintenance";
const execute = vi.fn();
const database = { transaction: vi.fn(async (run) => run({ execute })) } as unknown as Parameters<
  typeof cleanupActivity
>[0];
describe("activity maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    scheduleActivityMaintenance();
    expect(after).toHaveBeenCalledOnce();
    await after.mock.calls[0][0]();
    after.mockImplementationOnce(() => {
      throw new Error("private");
    });
    expect(() => scheduleActivityMaintenance()).not.toThrow();
  });
  it("contains non-Error failures without logging their values", async () => {
    execute.mockRejectedValueOnce("private");
    await cleanupActivity(database);
    expect(console.error).toHaveBeenCalledWith("[activity-maintenance] cleanup failed (UnknownError)");
  });
});
