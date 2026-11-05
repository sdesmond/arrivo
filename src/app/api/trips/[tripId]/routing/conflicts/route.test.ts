// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, assertTripAccess, assertEventsBelongToTrip, getDayScheduleConflicts } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertTripAccess: vi.fn(),
  assertEventsBelongToTrip: vi.fn(),
  getDayScheduleConflicts: vi.fn(),
}));
vi.mock("@/lib/auth-helpers", () => ({ requireUser, assertTripAccess }));
vi.mock("@/lib/route", () => ({ getDayScheduleConflicts }));
vi.mock("@/lib/route-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/route-request")>()),
  assertEventsBelongToTrip,
}));
import { POST } from "./route";

const params = Promise.resolve({ tripId: "trip-1" });
const events = [{ id: "event-1", name: "Museum", position: 0, locationLat: 48.85, locationLng: 2.35 }];
const body = { events, transitMode: "drive", walkThresholdMeters: 400 };

function post(payload: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

describe("POST /api/trips/[tripId]/routing/conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    assertEventsBelongToTrip.mockResolvedValue(undefined);
    getDayScheduleConflicts.mockResolvedValue([]);
  });

  it("checks access and event ownership, then delegates and returns the conflicts uncached", async () => {
    const response = await POST(post(body), { params });
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "viewer");
    expect(assertEventsBelongToTrip).toHaveBeenCalledWith("trip-1", events);
    expect(getDayScheduleConflicts).toHaveBeenCalledWith(events, "trip-1", "drive", 400);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual([]);
  });

  it.each([["not json"], [{ ...body, transitMode: "boat" }]])("returns 400 for a malformed body", async (payload) => {
    const response = await POST(post(payload), { params });
    expect(response.status).toBe(400);
    expect(getDayScheduleConflicts).not.toHaveBeenCalled();
  });

  it("does not delegate when an event is foreign", async () => {
    assertEventsBelongToTrip.mockRejectedValue(new Error("Event(s) do not belong to trip"));
    await expect(POST(post(body), { params })).rejects.toThrow("Event(s) do not belong to trip");
    expect(getDayScheduleConflicts).not.toHaveBeenCalled();
  });

  it("propagates unauthenticated redirects before touching the trip", async () => {
    const redirectSignal = new Error("NEXT_REDIRECT");
    requireUser.mockRejectedValue(redirectSignal);
    await expect(POST(post(body), { params })).rejects.toBe(redirectSignal);
    expect(assertTripAccess).not.toHaveBeenCalled();
  });

  it("propagates denied access before validating events", async () => {
    assertTripAccess.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(POST(post(body), { params })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(assertEventsBelongToTrip).not.toHaveBeenCalled();
    expect(getDayScheduleConflicts).not.toHaveBeenCalled();
  });
});
