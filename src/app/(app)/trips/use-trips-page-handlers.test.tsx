import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { toast } from "sonner";
import { createTrip, deleteTrip, updateTripMetadata } from "./actions";
import { useTripsPageHandlers } from "./use-trips-page-handlers";
import { TripDateConflictResolution, type TripListEntry } from "@/data/types";

const mockPush = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("./actions", () => ({
  createTrip: vi.fn(),
  deleteTrip: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a trip and navigates to its detail page", async () => {
    vi.mocked(createTrip).mockResolvedValueOnce({ tripId: "trip-new" });

    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    await act(async () => {
      await result.current.submitCreateTrip({
        title: "Fresh Trip",
        startDate: "2026-08-01",
        endDate: "2026-08-03",
      });
    });

    expect(createTrip).toHaveBeenCalledWith({
      id: expect.any(String),
      name: "Fresh Trip",
      startDate: "2026-08-01",
      endDate: "2026-08-03",
      budgetTotal: undefined,
      destinationName: undefined,
      destinationCountry: undefined,
      destinationCountryCode: undefined,
      destinationCenter: undefined,
    });
    expect(mockPush).toHaveBeenCalledWith("/trips/trip-new?new=1");
  });

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

  it("keeps the sheet open and stores confirmation state when a date edit needs review", async () => {
    vi.mocked(updateTripMetadata).mockResolvedValueOnce({
      status: "confirmation-required",
      confirmation: {
        removedDates: ["2026-06-10"],
        events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-06-10", docCount: 0 }],
        noteCount: 0,
        checklistCount: 0,
        eventDocumentCount: 0,
      },
    });

    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    act(() => {
      result.current.setEditingTrip("trip-upcoming");
    });

    await act(async () => {
      await result.current.handleTripSave("trip-upcoming", {
        startDate: "2026-06-01",
        endDate: "2026-06-09",
      });
    });

    expect(result.current.editingTrip).toBe("trip-upcoming");
    expect(result.current.tripDateConfirmation?.removedDates).toEqual(["2026-06-10"]);
    expect(result.current.pendingTripPatch).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-09",
    });
  });

  it("replays the stored patch with the selected resolution and confirmation payload", async () => {
    const confirmation = {
      removedDates: ["2026-06-10"],
      events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-06-10", docCount: 0 }],
      noteCount: 0,
      checklistCount: 0,
      eventDocumentCount: 0,
    };
    vi.mocked(updateTripMetadata)
      .mockResolvedValueOnce({
        status: "confirmation-required",
        confirmation,
      })
      .mockResolvedValueOnce({ status: "saved" });

    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    act(() => {
      result.current.setEditingTrip("trip-upcoming");
    });

    await act(async () => {
      await result.current.handleTripSave("trip-upcoming", {
        startDate: "2026-06-01",
        endDate: "2026-06-09",
      });
    });

    await act(async () => {
      await result.current.handleTripSaveResolution(TripDateConflictResolution.DeleteEvents);
    });

    expect(updateTripMetadata).toHaveBeenLastCalledWith(
      "trip-upcoming",
      { startDate: "2026-06-01", endDate: "2026-06-09" },
      TripDateConflictResolution.DeleteEvents,
      confirmation
    );
    expect(result.current.editingTrip).toBeNull();
    expect(result.current.tripDateConfirmation).toBeNull();
    expect(result.current.pendingTripPatch).toBeNull();
  });

  it("deletes the selected trip and clears delete state", async () => {
    vi.mocked(deleteTrip).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    act(() => {
      result.current.setDeletingTrip(datedEntries[1].trip);
    });

    await act(async () => {
      await result.current.handleConfirmDeleteTrip();
    });

    expect(deleteTrip).toHaveBeenCalledWith("trip-upcoming");
    expect(result.current.deletingTrip).toBeNull();
  });

  it("shows a toast when trip deletion fails", async () => {
    vi.mocked(deleteTrip).mockRejectedValueOnce(new Error("Delete failed"));

    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    act(() => {
      result.current.setDeletingTrip(datedEntries[2].trip);
    });

    await act(async () => {
      await result.current.handleConfirmDeleteTrip();
    });

    expect(toast.error).toHaveBeenCalledWith("Delete failed");
    expect(result.current.deletingTrip?.id).toBe("trip-past");
  });
});
