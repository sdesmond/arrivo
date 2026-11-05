// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, assertTripAccess, getRouteDistanceTime } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertTripAccess: vi.fn(),
  getRouteDistanceTime: vi.fn(),
}));
vi.mock("@/lib/auth-helpers", () => ({ requireUser, assertTripAccess }));
vi.mock("@/lib/route", () => ({ getRouteDistanceTime }));
import { POST } from "./route";

const params = Promise.resolve({ tripId: "trip-1" });
const body = { origin: { lat: 48.85, lng: 2.35 }, destination: { lat: 48.86, lng: 2.29 }, transitMode: "walk" };

function post(payload: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

describe("POST /api/trips/[tripId]/routing/distance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    getRouteDistanceTime.mockResolvedValue({ status: "ready", distanceMeters: 500, durationSeconds: 300 });
  });

  it("checks viewer access, delegates to route.ts and returns the result uncached", async () => {
    const response = await POST(post(body), { params });
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "viewer");
    expect(getRouteDistanceTime).toHaveBeenCalledWith(body.origin, body.destination, "walk");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ready", distanceMeters: 500, durationSeconds: 300 });
  });

  it.each([["not json"], [{ ...body, transitMode: "teleport" }]])(
    "returns 400 for a malformed body",
    async (payload) => {
      const response = await POST(post(payload), { params });
      expect(response.status).toBe(400);
      expect(getRouteDistanceTime).not.toHaveBeenCalled();
    }
  );

  it("propagates unauthenticated redirects before touching the trip", async () => {
    const redirectSignal = new Error("NEXT_REDIRECT");
    requireUser.mockRejectedValue(redirectSignal);
    await expect(POST(post(body), { params })).rejects.toBe(redirectSignal);
    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(getRouteDistanceTime).not.toHaveBeenCalled();
  });

  it("propagates denied access without computing a route", async () => {
    assertTripAccess.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(POST(post(body), { params })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getRouteDistanceTime).not.toHaveBeenCalled();
  });
});
