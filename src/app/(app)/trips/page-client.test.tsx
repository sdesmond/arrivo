// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTripsPageHandlers } from "./use-trips-page-handlers";
import type { TripListEntry } from "@/data/types";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("./actions", () => ({
  createTrip: vi.fn(),
  updateTripMetadata: vi.fn(),
}));

const NOW = new Date("2026-05-13T12:00:00.000Z");

const datedEntries: TripListEntry[] = [
  {
    trip: { id: "trip-active", name: "Tokyo", status: "active", startDate: "2026-05-10", endDate: "2026-05-20" },
    todayEvents: [],
  },
  {
    trip: { id: "trip-upcoming", name: "Paris", status: "upcoming", startDate: "2026-06-01", endDate: "2026-06-10" },
    todayEvents: [],
  },
  {
    trip: { id: "trip-past", name: "Lisbon", status: "past", startDate: "2025-09-01", endDate: "2025-09-07" },
    todayEvents: [],
  },
];

const unscheduledEntry: TripListEntry = {
  trip: { id: "trip-unscheduled", name: "Unsorted", status: "upcoming" },
  todayEvents: [],
};

describe("useTripsPageHandlers", () => {
  it("separates unscheduled entries from dated entries", () => {
    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    expect(result.current.unscheduledEntries).toHaveLength(1);
    expect(result.current.unscheduledEntries[0].trip.id).toBe("trip-unscheduled");
  });

  it("filters active entries from dated entries only", () => {
    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    expect(result.current.activeEntry?.trip.id).toBe("trip-active");
    expect(result.current.upcomingTrips).toHaveLength(1);
    expect(result.current.upcomingTrips[0].id).toBe("trip-upcoming");
    expect(result.current.pastTrips).toHaveLength(1);
    expect(result.current.pastTrips[0].id).toBe("trip-past");
  });

  it("defaults to Unscheduled mobile tab when no active entry and unscheduled exist", () => {
    const entries = [datedEntries[1], datedEntries[2], unscheduledEntry];
    const { result } = renderHook(() => useTripsPageHandlers(entries, NOW));

    expect(result.current.mobileTab).toBe("Unscheduled");
  });

  it("defaults to Active mobile tab when active entry exists", () => {
    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    expect(result.current.mobileTab).toBe("Active");
  });

  it("defaults to Upcoming mobile tab when no active and no unscheduled", () => {
    const { result } = renderHook(() => useTripsPageHandlers([datedEntries[1], datedEntries[2]], NOW));

    expect(result.current.mobileTab).toBe("Upcoming");
  });

  it("returns null nextInDays when no upcoming trips", () => {
    const { result } = renderHook(() =>
      useTripsPageHandlers([datedEntries[0], datedEntries[2], unscheduledEntry], NOW)
    );

    expect(result.current.nextInDays).toBeNull();
  });

  it("calculates nextInDays from upcoming trips", () => {
    const { result } = renderHook(() => useTripsPageHandlers(datedEntries, NOW));

    expect(result.current.nextInDays).toBe(19);
  });

  it("computes editingEntry from editingTrip id", () => {
    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    act(() => {
      result.current.setEditingTrip("trip-active");
    });
    expect(result.current.editingEntry?.trip.id).toBe("trip-active");
  });
});
