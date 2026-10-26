// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isInstanceAdmin: vi.fn(),
  limit: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("./instance-roles", () => ({ isInstanceAdmin: mocks.isInstanceAdmin }));
vi.mock("@/db", () => ({
  db: { select: vi.fn(() => ({ from: () => ({ orderBy: () => ({ limit: mocks.limit }) }) })) },
}));

import { ACTIVITY_LIST_LIMIT, listRecentActivity } from "./activity-queries";

const ROW = {
  id: "event-1",
  type: "sign_in",
  actorUsername: "alice",
  endedAt: new Date("2026-10-25T12:00:00.000Z"),
  tripId: null as string | null,
};

describe("listRecentActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mocks.isInstanceAdmin.mockResolvedValue(true);
    mocks.limit.mockResolvedValue([ROW]);
  });

  it("rechecks current admin authority for the viewer and 404s otherwise", async () => {
    mocks.isInstanceAdmin.mockResolvedValue(false);
    await expect(listRecentActivity("member-1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.isInstanceAdmin).toHaveBeenCalledWith("member-1");
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("returns the safe summary shape with a bounded query", async () => {
    const events = await listRecentActivity("admin-1");
    expect(mocks.limit).toHaveBeenCalledWith(ACTIVITY_LIST_LIMIT);
    expect(events).toEqual([
      { id: "event-1", type: "sign_in", actorUsername: "alice", occurredAt: "2026-10-25T12:00:00.000Z" },
    ]);
  });

  it("keeps the snapshot username for a deleted account and passes trip ids through", async () => {
    mocks.limit.mockResolvedValue([
      { ...ROW, tripId: "trip-1" },
      { ...ROW, id: "event-2", actorUsername: null },
    ]);
    const events = await listRecentActivity("admin-1");
    expect(events[0]).toMatchObject({ actorUsername: "alice", tripId: "trip-1" });
    expect(events[1]).toMatchObject({ actorUsername: null });
    expect(events[1]).not.toHaveProperty("tripId");
  });

  it("drops unknown event types rather than showing them", async () => {
    mocks.limit.mockResolvedValue([{ ...ROW, type: "mystery" }]);
    await expect(listRecentActivity("admin-1")).resolves.toEqual([]);
  });
});
