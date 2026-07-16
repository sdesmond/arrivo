// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAssertTripAccess,
  mockRequireUser,
  mockGetDayRouteSummary,
  mockGetRouteDistanceTime,
  mockGetDayScheduleConflicts,
} = vi.hoisted(() => {
  const mockAssertTripAccess = vi.fn();
  const mockRequireUser = vi.fn();
  const mockGetRouteDistanceTime = vi.fn();
  const mockGetDayRouteSummary = vi.fn();
  const mockGetDayScheduleConflicts = vi.fn();

  return {
    mockAssertTripAccess,
    mockRequireUser,
    mockGetDayRouteSummary,
    mockGetRouteDistanceTime,
    mockGetDayScheduleConflicts,
  };
});

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess: mockAssertTripAccess,
  requireUser: mockRequireUser,
}));

vi.mock("@/lib/route", () => ({
  getDayRouteSummary: mockGetDayRouteSummary,
  getRouteDistanceTime: mockGetRouteDistanceTime,
  getDayScheduleConflicts: mockGetDayScheduleConflicts,
}));

import { getDayRouteSummary, getRouteDistanceTime, getDayScheduleConflicts } from "./route-actions";

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

describe("getDayRouteSummary (server action)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires viewer access before delegating route aggregation", async () => {
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockGetDayRouteSummary.mockResolvedValue({ status: "unavailable" });
    const events = [{ id: "event-1", name: "Museum", position: 0, locationLat: 48.85, locationLng: 2.35 }];

    await expect(getDayRouteSummary("trip-1", events, "drive", 400)).resolves.toEqual({ status: "unavailable" });
    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "viewer");
    expect(mockGetDayRouteSummary).toHaveBeenCalledWith(events, "drive", 400);
  });

  it("rejects when the user does not have viewer access", async () => {
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    const events = [{ id: "event-1", name: "Museum", position: 0, locationLat: 48.85, locationLng: 2.35 }];

    await expect(getDayRouteSummary("trip-1", events, "drive", 400)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockGetDayRouteSummary).not.toHaveBeenCalled();
  });
});

describe("getDayScheduleConflicts (server action)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires viewer access before delegating conflict detection", async () => {
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockGetDayScheduleConflicts.mockResolvedValue([]);
    const events = [{ id: "event-1", name: "Museum", position: 0, locationLat: 48.85, locationLng: 2.35 }];

    await expect(getDayScheduleConflicts("trip-1", events, "drive", 400)).resolves.toEqual([]);
    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "viewer");
    expect(mockGetDayScheduleConflicts).toHaveBeenCalledWith(events, "trip-1", "drive", 400);
  });

  it("rejects when the user does not have viewer access", async () => {
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    const events = [{ id: "event-1", name: "Museum", position: 0, locationLat: 48.85, locationLng: 2.35 }];

    await expect(getDayScheduleConflicts("trip-1", events, "drive", 400)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockGetDayScheduleConflicts).not.toHaveBeenCalled();
  });
});
