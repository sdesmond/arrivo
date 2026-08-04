import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { DayRouteSummary, TripEvent } from "@/data/types";

const { mockGetDayRouteSummary } = vi.hoisted(() => ({
  mockGetDayRouteSummary: vi.fn(),
}));

vi.mock("@/app/(app)/trips/[tripId]/route-actions", () => ({
  getDayRouteSummary: mockGetDayRouteSummary,
}));

import { useDayRouteSummary } from "./use-day-route-summary";

function makeEvents(): TripEvent[] {
  return [
    { id: "hotel", name: "Hotel", position: 0, locationLat: 48.85, locationLng: 2.35 },
    { id: "museum", name: "Museum", position: 1, locationLat: 48.86, locationLng: 2.36 },
  ];
}

function makeZeroCoordEvents(): TripEvent[] {
  return [
    { id: "origin", name: "Origin", position: 0, locationLat: 0, locationLng: 0 },
    { id: "destination", name: "Destination", position: 1, locationLat: 0, locationLng: 1 },
  ];
}

const readySummary: DayRouteSummary = {
  status: "ready",
  totalDistanceMeters: 500,
  totalDurationSeconds: 600,
  hopCount: 1,
};

describe("useDayRouteSummary", () => {
  beforeEach(() => {
    mockGetDayRouteSummary.mockReset();
    mockGetDayRouteSummary.mockResolvedValue(readySummary);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch with fewer than two located events", () => {
    const { result } = renderHook(() => useDayRouteSummary(makeEvents().slice(0, 1), "trip-1", "drive", null));

    expect(result.current.routeSummary).toEqual({ status: "loading" });
    expect(mockGetDayRouteSummary).not.toHaveBeenCalled();
  });

  it("does not fetch without a tripId", () => {
    const { result } = renderHook(() => useDayRouteSummary(makeEvents(), undefined, "drive", null));

    expect(result.current.routeSummary).toEqual({ status: "loading" });
    expect(mockGetDayRouteSummary).not.toHaveBeenCalled();
  });

  it("does not fetch without a transit mode", () => {
    const { result } = renderHook(() => useDayRouteSummary(makeEvents(), "trip-1", null, null));

    expect(result.current.routeSummary).toEqual({ status: "loading" });
    expect(mockGetDayRouteSummary).not.toHaveBeenCalled();
  });

  it("resolves a ready summary when guard conditions are satisfied", async () => {
    const events = makeEvents();
    const { result } = renderHook(() => useDayRouteSummary(events, "trip-1", "drive", null));

    await waitFor(() => expect(result.current.routeSummary).toEqual(readySummary));
    expect(mockGetDayRouteSummary).toHaveBeenCalledWith("trip-1", events, "drive", null);
  });

  it("falls back to unavailable when the fetch rejects", async () => {
    mockGetDayRouteSummary.mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => useDayRouteSummary(makeEvents(), "trip-1", "drive", null));

    await waitFor(() => expect(result.current.routeSummary).toEqual({ status: "unavailable" }));
  });

  it("does not issue a second request when a content-identical events array rerenders", async () => {
    const events = makeEvents();
    const { result, rerender } = renderHook(
      ({ eventsArg }: { eventsArg: TripEvent[] }) => useDayRouteSummary(eventsArg, "trip-1", "drive", null),
      { initialProps: { eventsArg: events } }
    );

    await waitFor(() => expect(result.current.routeSummary).toEqual(readySummary));
    expect(mockGetDayRouteSummary).toHaveBeenCalledTimes(1);

    rerender({ eventsArg: events.map((event) => ({ ...event })) });

    expect(result.current.routeSummary).toEqual(readySummary);
    expect(mockGetDayRouteSummary).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when a located event's coordinates change", async () => {
    const events = makeEvents();
    const { rerender } = renderHook(
      ({ eventsArg }: { eventsArg: TripEvent[] }) => useDayRouteSummary(eventsArg, "trip-1", "drive", null),
      { initialProps: { eventsArg: events } }
    );

    await waitFor(() => expect(mockGetDayRouteSummary).toHaveBeenCalledTimes(1));

    const movedEvents = [events[0], { ...events[1], locationLat: 48.9 }];
    mockGetDayRouteSummary.mockResolvedValueOnce({ ...readySummary, totalDistanceMeters: 900 });
    rerender({ eventsArg: movedEvents });

    await waitFor(() => expect(mockGetDayRouteSummary).toHaveBeenCalledTimes(2));
    expect(mockGetDayRouteSummary).toHaveBeenLastCalledWith("trip-1", movedEvents, "drive", null);
  });

  it("re-fetches when a located event's position changes", async () => {
    const events = makeEvents();
    const { rerender } = renderHook(
      ({ eventsArg }: { eventsArg: TripEvent[] }) => useDayRouteSummary(eventsArg, "trip-1", "drive", null),
      { initialProps: { eventsArg: events } }
    );

    await waitFor(() => expect(mockGetDayRouteSummary).toHaveBeenCalledTimes(1));

    const reorderedEvents = [
      { ...events[1], position: 0 },
      { ...events[0], position: 1 },
    ];
    rerender({ eventsArg: reorderedEvents });

    await waitFor(() => expect(mockGetDayRouteSummary).toHaveBeenCalledTimes(2));
    expect(mockGetDayRouteSummary).toHaveBeenLastCalledWith("trip-1", reorderedEvents, "drive", null);
  });

  it("treats zero latitude and longitude as located, not merely present in the key", async () => {
    const events = makeZeroCoordEvents();
    const { result } = renderHook(() => useDayRouteSummary(events, "trip-1", "drive", null));

    expect(result.current.locatedEvents).toHaveLength(2);
    await waitFor(() => expect(result.current.routeSummary).toEqual(readySummary));
    expect(mockGetDayRouteSummary).toHaveBeenCalledWith("trip-1", events, "drive", null);
  });

  it("ignores a late resolution from a stale request after the key changes before it settles", async () => {
    const events = makeEvents();
    let resolveFirst: ((value: DayRouteSummary) => void) | undefined;
    mockGetDayRouteSummary.mockImplementationOnce(
      () =>
        new Promise<DayRouteSummary>((resolve) => {
          resolveFirst = resolve;
        })
    );

    const { result, rerender } = renderHook(
      ({ eventsArg }: { eventsArg: TripEvent[] }) => useDayRouteSummary(eventsArg, "trip-1", "drive", null),
      { initialProps: { eventsArg: events } }
    );

    const changedEvents = [events[0], { ...events[1], locationLat: 48.95 }];
    const changedSummary: DayRouteSummary = { ...readySummary, totalDistanceMeters: 111 };
    mockGetDayRouteSummary.mockResolvedValueOnce(changedSummary);
    rerender({ eventsArg: changedEvents });

    await waitFor(() => expect(result.current.routeSummary).toEqual(changedSummary));

    resolveFirst?.(readySummary);
    await Promise.resolve();

    expect(result.current.routeSummary).toEqual(changedSummary);
  });

  it("ignores a late resolution after unmount", async () => {
    let resolveFetch: ((value: DayRouteSummary) => void) | undefined;
    mockGetDayRouteSummary.mockImplementationOnce(
      () =>
        new Promise<DayRouteSummary>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { unmount } = renderHook(() => useDayRouteSummary(makeEvents(), "trip-1", "drive", null));
    unmount();

    expect(() => resolveFetch?.(readySummary)).not.toThrow();
    await Promise.resolve();
  });
});
