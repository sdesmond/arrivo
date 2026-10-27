// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readActivityRetention, saveActivityRetention, isRetentionDays } from "./activity-retention";

const execute = vi.fn();
const transaction = { execute };
const database = { execute, transaction: vi.fn(async (run) => run(transaction)) } as unknown as Parameters<
  typeof saveActivityRetention
>[0];
const actor = { id: "admin", username: "alice" };

describe("activity retention", () => {
  beforeEach(() => vi.clearAllMocks());
  it("accepts only the four numeric policies", () => {
    for (const days of [30, 90, 180, 365]) expect(isRetentionDays(days)).toBe(true);
    for (const days of [0, 31, Infinity, "90", null]) expect(isRetentionDays(days)).toBe(false);
  });
  it("rejects invalid input before opening a transaction", async () => {
    expect(await saveActivityRetention(database, actor.id, 31, 90)).toEqual({ status: "invalid" });
    expect(database.transaction).not.toHaveBeenCalled();
  });
  function locked(days = 90, role = "admin", passwordHash: string | null = "hash") {
    execute
      .mockResolvedValueOnce([{ id: true }])
      .mockResolvedValueOnce([{ id: actor.id }])
      .mockResolvedValueOnce([{ ...actor, role, passwordHash, days }]);
  }
  it("locks instance then account before rechecking authority and saving", async () => {
    locked();
    execute.mockResolvedValueOnce([]);
    expect(await saveActivityRetention(database, actor.id, 30, 90)).toEqual({
      status: "ok",
      days: 30,
      changed: true,
      actor,
    });
    expect(execute).toHaveBeenCalledTimes(4);
  });
  it("refuses stale policy without mutation", async () => {
    locked(180);
    expect(await saveActivityRetention(database, actor.id, 30, 90)).toEqual({ status: "stale" });
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it.each([
    ["member", "hash"],
    ["admin", null],
  ])("refuses lost or incomplete authority", async (role, passwordHash) => {
    locked(90, role!, passwordHash);
    expect(await saveActivityRetention(database, actor.id, 30, 90)).toEqual({ status: "forbidden" });
  });
  it("refuses missing instance and missing actor", async () => {
    execute.mockResolvedValueOnce([]);
    expect(await saveActivityRetention(database, actor.id, 30, 90)).toEqual({ status: "forbidden" });
    execute.mockResolvedValueOnce([{ id: true }]).mockResolvedValueOnce([]);
    expect(await saveActivityRetention(database, actor.id, 30, 90)).toEqual({ status: "forbidden" });
  });
  it("returns committed actor without writing a no-op", async () => {
    locked();
    expect(await saveActivityRetention(database, actor.id, 90, 90)).toEqual({
      status: "ok",
      days: 90,
      changed: false,
      actor,
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it("propagates rollback failures without claiming success", async () => {
    locked();
    execute.mockRejectedValueOnce(new Error("rollback"));
    await expect(saveActivityRetention(database, actor.id, 30, 90)).rejects.toThrow("rollback");
  });
  it("reads policy, inspection and timestamp from one authorized snapshot", async () => {
    execute.mockResolvedValueOnce([{ days: 90, expired: true, checkedAt: new Date("2026-10-26T12:00:00Z") }]);
    expect(await readActivityRetention(database, actor.id)).toEqual({
      status: "ok",
      days: 90,
      expired: true,
      checkedAt: "2026-10-26T12:00:00.000Z",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("returns forbidden for an unauthorized snapshot", async () => {
    execute.mockResolvedValueOnce([]);
    expect(await readActivityRetention(database, actor.id)).toEqual({ status: "forbidden" });
  });
});
