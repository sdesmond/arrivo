// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAssertTripAccess, mockRequireUser, mockGetRouteDistanceTime } = vi.hoisted(() => {
  const mockAssertTripAccess = vi.fn();
  const mockRequireUser = vi.fn();
  const mockGetRouteDistanceTime = vi.fn();

  return { mockAssertTripAccess, mockRequireUser, mockGetRouteDistanceTime };
});

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess: mockAssertTripAccess,
  requireUser: mockRequireUser,
}));

vi.mock("@/lib/route", () => ({
  getRouteDistanceTime: mockGetRouteDistanceTime,
}));

import { getRouteDistanceTime } from "./route-actions";

describe("getRouteDistanceTime (server action)", () => {
  const origin = { lat: 48.8566, lng: 2.3522 };
  const destination = { lat: 48.8584, lng: 2.2945 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockGetRouteDistanceTime.mockResolvedValue({ status: "ready", distanceMeters: 500, durationSeconds: 300 });
  });

  it("requires the user before checking trip access", async () => {
    await getRouteDistanceTime("trip-1", origin, destination, "walk");

    expect(mockRequireUser).toHaveBeenCalledOnce();
    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "viewer");
  });

  it("delegates to route.ts and returns its result", async () => {
    const result = await getRouteDistanceTime("trip-1", origin, destination, "walk");

    expect(mockGetRouteDistanceTime).toHaveBeenCalledWith(origin, destination, "walk");
    expect(result).toEqual({ status: "ready", distanceMeters: 500, durationSeconds: 300 });
  });

  it("rejects when the user is not authenticated", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthenticated"));

    await expect(getRouteDistanceTime("trip-1", origin, destination, "walk")).rejects.toThrow("Unauthenticated");
    expect(mockAssertTripAccess).not.toHaveBeenCalled();
    expect(mockGetRouteDistanceTime).not.toHaveBeenCalled();
  });

  it("rejects when the user does not have viewer access", async () => {
    mockAssertTripAccess.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(getRouteDistanceTime("trip-1", origin, destination, "walk")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockGetRouteDistanceTime).not.toHaveBeenCalled();
  });
});
