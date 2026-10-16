import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { TripEvent } from "@/data/types";

const { mockGetDayScheduleConflicts } = vi.hoisted(() => ({
  mockGetDayScheduleConflicts: vi.fn(),
}));

vi.mock("@/app/(app)/trips/[tripId]/route-actions", () => ({
  getDayScheduleConflicts: mockGetDayScheduleConflicts,
}));

import { useScheduleConflicts } from "./use-schedule-conflicts";

function makeEvents(): TripEvent[] {
  return [
    {
      id: "hotel",
      name: "Hotel",
      position: 0,
      locationLat: 48.85,
      locationLng: 2.35,
      startAt: "2026-07-15T09:00:00Z",
      endAt: "2026-07-15T09:30:00Z",
    },
    {
      id: "museum",
      name: "Museum",
      position: 1,
      locationLat: 48.86,
      locationLng: 2.36,
      startAt: "2026-07-15T09:35:00Z",
      endAt: "2026-07-15T10:30:00Z",
    },
  ];
}

const conflict = {
  eventIndex: 1,
  previousEventId: "hotel",
  currentEventId: "museum",
  travelTimeSeconds: 700,
  scheduledGapSeconds: 300,
};

describe("useScheduleConflicts", () => {
  beforeEach(() => {
    mockGetDayScheduleConflicts.mockReset();
    mockGetDayScheduleConflicts.mockResolvedValue([conflict]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns no conflicts and does not fetch with fewer than two located events", () => {
    const { result } = renderHook(() => useScheduleConflicts(makeEvents().slice(0, 1), 1, "trip-1", "drive", null));

    expect(result.current).toEqual([]);
    expect(mockGetDayScheduleConflicts).not.toHaveBeenCalled();
  });

  it("returns no conflicts and does not fetch without a tripId", () => {
    const { result } = renderHook(() => useScheduleConflicts(makeEvents(), 2, undefined, "drive", null));

    expect(result.current).toEqual([]);
    expect(mockGetDayScheduleConflicts).not.toHaveBeenCalled();
  });

  it("returns no conflicts and does not fetch without a transit mode", () => {
    const { result } = renderHook(() => useScheduleConflicts(makeEvents(), 2, "trip-1", null, null));

    expect(result.current).toEqual([]);
    expect(mockGetDayScheduleConflicts).not.toHaveBeenCalled();
  });

  it("fetches and resolves conflicts when guard conditions are satisfied", async () => {
    const events = makeEvents();
    const { result } = renderHook(() => useScheduleConflicts(events, 2, "trip-1", "drive", null));

    await waitFor(() => expect(result.current).toEqual([conflict]));
    expect(mockGetDayScheduleConflicts).toHaveBeenCalledWith("trip-1", events, "drive", null);
  });

  it("falls back to no conflicts when the fetch rejects", async () => {
    mockGetDayScheduleConflicts.mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => useScheduleConflicts(makeEvents(), 2, "trip-1", "drive", null));

    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("re-fetches when the underlying events change", async () => {
    const events = makeEvents();
    const { result, rerender } = renderHook(
      ({ eventsArg }: { eventsArg: TripEvent[] }) => useScheduleConflicts(eventsArg, 2, "trip-1", "drive", null),
      { initialProps: { eventsArg: events } }
    );

    await waitFor(() => expect(result.current).toEqual([conflict]));

    const updatedEvents = [events[0], { ...events[1], startAt: "2026-07-15T11:00:00Z", endAt: "2026-07-15T11:30:00Z" }];
    mockGetDayScheduleConflicts.mockResolvedValueOnce([]);
    rerender({ eventsArg: updatedEvents });

    await waitFor(() => expect(result.current).toEqual([]));
    expect(mockGetDayScheduleConflicts).toHaveBeenCalledTimes(2);
  });
});
