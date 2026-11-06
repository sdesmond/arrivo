// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, assertTripAccess, assertEventsBelongToTrip, getDayRouteSummary } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertTripAccess: vi.fn(),
  assertEventsBelongToTrip: vi.fn(),
  getDayRouteSummary: vi.fn(),
}));
vi.mock("@/lib/auth-helpers", () => ({ requireUser, assertTripAccess }));
const { rateLimitedResponse } = vi.hoisted(() => ({ rateLimitedResponse: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitedResponse }));
vi.mock("@/lib/route", () => ({ getDayRouteSummary }));
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

describe("POST /api/trips/[tripId]/routing/day-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitedResponse.mockReturnValue(null);
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    assertEventsBelongToTrip.mockResolvedValue(undefined);
    getDayRouteSummary.mockResolvedValue({ status: "unavailable" });
  });

  it("checks access and event ownership, then delegates and returns the summary uncached", async () => {
    const response = await POST(post(body), { params });
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "viewer");
    expect(assertEventsBelongToTrip).toHaveBeenCalledWith("trip-1", events);
    expect(getDayRouteSummary).toHaveBeenCalledWith(events, "drive", 400);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it.each([["not json"], [{ ...body, transitMode: "boat" }]])("returns 400 for a malformed body", async (payload) => {
    const response = await POST(post(payload), { params });
    expect(response.status).toBe(400);
    expect(getDayRouteSummary).not.toHaveBeenCalled();
  });

  it("does not delegate when an event is foreign", async () => {
    assertEventsBelongToTrip.mockRejectedValue(new Error("Event(s) do not belong to trip"));
    await expect(POST(post(body), { params })).rejects.toThrow("Event(s) do not belong to trip");
    expect(getDayRouteSummary).not.toHaveBeenCalled();
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
    expect(getDayRouteSummary).not.toHaveBeenCalled();
  });

  it("returns the 429 and skips the Mapbox lookup once the user's routing budget is spent", async () => {
    rateLimitedResponse.mockReturnValue(new Response("slow down", { status: 429 }));
    const response = await POST(post(body), { params });
    expect(response.status).toBe(429);
    expect(rateLimitedResponse).toHaveBeenCalledWith("mapboxRouting", "user-1");
    expect(getDayRouteSummary).not.toHaveBeenCalled();
  });
});
