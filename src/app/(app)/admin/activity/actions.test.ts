// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUser,
  readActivityPage,
  database,
  saveRetention,
  readRetention,
  recordActivity,
  maintenance,
  revalidatePath,
} = vi.hoisted(() => ({
  saveRetention: vi.fn(),
  readRetention: vi.fn(),
  recordActivity: vi.fn(),
  maintenance: vi.fn(),
  revalidatePath: vi.fn(),
  requireUser: vi.fn(),
  readActivityPage: vi.fn(),
  database: {},
}));
vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/lib/activity-queries", () => ({ readActivityPage }));
vi.mock("@/db", () => ({ db: database }));
vi.mock("@/lib/activity-retention", () => ({
  saveActivityRetention: saveRetention,
  readActivityRetention: readRetention,
}));
vi.mock("@/lib/activity", () => ({ recordActivity }));
vi.mock("@/lib/activity-maintenance", () => ({ scheduleActivityMaintenance: maintenance }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { loadActivityPage, saveActivityRetentionPolicy, refreshActivityRetention } from "./actions";

describe("retention actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "admin-1" });
  });
  it("emits changed event after committed save and schedules maintenance", async () => {
    saveRetention.mockResolvedValue({
      status: "ok",
      days: 30,
      changed: true,
      actor: { id: "admin-1", username: "alice" },
    });
    expect(await saveActivityRetentionPolicy(30, 90)).toEqual({ status: "ok", days: 30 });
    expect(recordActivity).toHaveBeenCalledWith({
      type: "retention_changed",
      actor: { id: "admin-1", username: "alice" },
    });
    expect(maintenance).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/activity");
    expect(recordActivity.mock.invocationCallOrder[0]).toBeGreaterThan(saveRetention.mock.invocationCallOrder[0]);
  });
  it("successful no-op schedules maintenance without event", async () => {
    saveRetention.mockResolvedValue({ status: "ok", days: 90, changed: false });
    await saveActivityRetentionPolicy(90, 90);
    expect(recordActivity).not.toHaveBeenCalled();
    expect(maintenance).toHaveBeenCalledOnce();
  });
  it.each(["stale", "forbidden", "invalid"])("%s never schedules cleanup or event", async (status) => {
    saveRetention.mockResolvedValue({ status });
    expect(await saveActivityRetentionPolicy(30, 90)).toEqual({ status });
    expect(recordActivity).not.toHaveBeenCalled();
    expect(maintenance).not.toHaveBeenCalled();
  });
  it("failed saves return safe error without side effects", async () => {
    saveRetention.mockRejectedValue(new Error("private"));
    expect(await saveActivityRetentionPolicy(30, 90)).toEqual({ status: "unavailable" });
    expect(recordActivity).not.toHaveBeenCalled();
    expect(maintenance).not.toHaveBeenCalled();
  });
  it("refresh rechecks authority and contains failures", async () => {
    readRetention.mockResolvedValueOnce({ status: "forbidden" }).mockRejectedValueOnce(new Error("private"));
    expect(await refreshActivityRetention()).toEqual({ status: "forbidden" });
    expect(readRetention).toHaveBeenCalledWith(database, "admin-1");
    expect(await refreshActivityRetention()).toEqual({ status: "unavailable" });
  });
});

describe("loadActivityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "admin-1" });
  });

  it("authenticates, then reads for that viewer with the read service", async () => {
    const page = { status: "ok", events: [], actors: [], loadedAt: "2026-10-26T12:00:00.000Z" };
    readActivityPage.mockResolvedValue(page);
    await expect(loadActivityPage({ actorId: "a", type: "sign_in", from: "f", to: "t", cursor: "c" })).resolves.toBe(
      page
    );
    expect(readActivityPage).toHaveBeenCalledWith(database, "admin-1", {
      actorId: "a",
      type: "sign_in",
      from: "f",
      to: "t",
      cursor: "c",
    });
    expect(requireUser.mock.invocationCallOrder[0]).toBeLessThan(readActivityPage.mock.invocationCallOrder[0]);
  });

  it("passes a lost-authority result through without content", async () => {
    readActivityPage.mockResolvedValue({ status: "forbidden" });
    await expect(loadActivityPage({})).resolves.toEqual({ status: "forbidden" });
  });

  it("drops non-string and empty wire values", async () => {
    readActivityPage.mockResolvedValue({ status: "forbidden" });
    await loadActivityPage({ actorId: 5, type: "", from: { x: 1 }, extra: "no" } as never);
    await loadActivityPage(null as never);
    expect(readActivityPage).toHaveBeenNthCalledWith(1, database, "admin-1", {
      actorId: undefined,
      type: undefined,
      from: undefined,
      to: undefined,
      cursor: undefined,
    });
    expect(readActivityPage).toHaveBeenCalledTimes(2);
  });

  it("reports unavailable instead of leaking the error", async () => {
    readActivityPage.mockRejectedValue(new Error("connection to db.internal:5432 refused"));
    const result = await loadActivityPage({});
    expect(result).toEqual({ status: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("db.internal");
  });
});
