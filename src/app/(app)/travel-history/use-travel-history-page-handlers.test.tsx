import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { toast } from "sonner";
import { deleteTrip, updateTripMetadata } from "@/app/(app)/trips/actions";
import { useTravelHistoryPageHandlers } from "./use-travel-history-page-handlers";
import { TripDateConflictResolution, type TripListEntry } from "@/data/types";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/app/(app)/trips/actions", () => ({
  deleteTrip: vi.fn(),
  updateTripMetadata: vi.fn(),
}));

const NOW = new Date("2026-05-13T12:00:00.000Z");

const entries: TripListEntry[] = [
  {
    trip: { id: "trip-active", name: "Tokyo", status: "active", startDate: "2026-05-10", endDate: "2026-05-20" },
    todayEvents: [],
  },
  {
    trip: { id: "trip-past-older", name: "Lisbon", status: "past", startDate: "2025-09-01", endDate: "2025-09-07" },
    todayEvents: [],
  },
  {
    trip: { id: "trip-past-newer", name: "Berlin", status: "past", startDate: "2026-01-01", endDate: "2026-01-10" },
    todayEvents: [],
  },
];

describe("useTravelHistoryPageHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters to past trips only and sorts by endDate descending", () => {
    const { result } = renderHook(() => useTravelHistoryPageHandlers(entries, NOW));

    expect(result.current.pastTrips.map((trip) => trip.id)).toEqual(["trip-past-newer", "trip-past-older"]);
  });

  it("computes editingEntry from editingTrip id", () => {
    const { result } = renderHook(() => useTravelHistoryPageHandlers(entries, NOW));

    act(() => {
      result.current.setEditingTrip("trip-past-older");
    });
    expect(result.current.editingEntry?.trip.id).toBe("trip-past-older");
  });

  it("keeps the sheet open and stores confirmation state when a date edit needs review", async () => {
    vi.mocked(updateTripMetadata).mockResolvedValueOnce({
      status: "confirmation-required",
      confirmation: {
        removedDates: ["2026-01-05"],
        events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-01-05", docCount: 0 }],
        noteCount: 0,
        checklistCount: 0,
        eventDocumentCount: 0,
      },
    });

    const { result } = renderHook(() => useTravelHistoryPageHandlers(entries, NOW));

    act(() => {
      result.current.setEditingTrip("trip-past-newer");
    });

    await act(async () => {
      await result.current.handleTripSave("trip-past-newer", {
        startDate: "2026-01-01",
        endDate: "2026-01-09",
      });
    });

    expect(result.current.editingTrip).toBe("trip-past-newer");
    expect(result.current.tripDateConfirmation?.removedDates).toEqual(["2026-01-05"]);
  });

  it("replays the stored patch with the selected resolution and confirmation payload", async () => {
    const confirmation = {
      removedDates: ["2026-01-05"],
      events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-01-05", docCount: 0 }],
      noteCount: 0,
      checklistCount: 0,
      eventDocumentCount: 0,
    };
    vi.mocked(updateTripMetadata)
      .mockResolvedValueOnce({ status: "confirmation-required", confirmation })
      .mockResolvedValueOnce({ status: "saved" });

    const { result } = renderHook(() => useTravelHistoryPageHandlers(entries, NOW));

    act(() => {
      result.current.setEditingTrip("trip-past-newer");
    });

    await act(async () => {
      await result.current.handleTripSave("trip-past-newer", {
        startDate: "2026-01-01",
        endDate: "2026-01-09",
      });
    });

    await act(async () => {
      await result.current.handleTripSaveResolution(TripDateConflictResolution.DeleteEvents);
    });

    expect(updateTripMetadata).toHaveBeenLastCalledWith(
      "trip-past-newer",
      { startDate: "2026-01-01", endDate: "2026-01-09" },
      TripDateConflictResolution.DeleteEvents,
      confirmation
    );
    expect(result.current.editingTrip).toBeNull();
    expect(result.current.tripDateConfirmation).toBeNull();
  });

  it("clears the pending date confirmation when cancelled", async () => {
    vi.mocked(updateTripMetadata).mockResolvedValueOnce({
      status: "confirmation-required",
      confirmation: {
        removedDates: ["2026-01-05"],
        events: [],
        noteCount: 0,
        checklistCount: 0,
        eventDocumentCount: 0,
      },
    });

    const { result } = renderHook(() => useTravelHistoryPageHandlers(entries, NOW));

    act(() => {
      result.current.setEditingTrip("trip-past-newer");
    });
    await act(async () => {
      await result.current.handleTripSave("trip-past-newer", { startDate: "2026-01-01", endDate: "2026-01-09" });
    });

    act(() => {
      result.current.cancelTripDateChange();
    });

    expect(result.current.tripDateConfirmation).toBeNull();
    expect(result.current.pendingTripPatch).toBeNull();
  });

  it("shows a toast when saving trip changes fails", async () => {
    vi.mocked(updateTripMetadata).mockRejectedValueOnce(new Error("Save failed"));

    const { result } = renderHook(() => useTravelHistoryPageHandlers(entries, NOW));

    act(() => {
      result.current.setEditingTrip("trip-past-newer");
    });

    await act(async () => {
      await result.current.handleTripSave("trip-past-newer", { name: "New name" });
    });

    expect(toast.error).toHaveBeenCalledWith("Save failed");
  });

  it("deletes the selected trip and clears delete state", async () => {
    vi.mocked(deleteTrip).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTravelHistoryPageHandlers(entries, NOW));

    act(() => {
      result.current.setDeletingTrip(entries[1].trip);
    });

    await act(async () => {
      await result.current.handleConfirmDeleteTrip();
    });

    expect(deleteTrip).toHaveBeenCalledWith("trip-past-older");
    expect(result.current.deletingTrip).toBeNull();
  });

  it("shows a toast when trip deletion fails", async () => {
    vi.mocked(deleteTrip).mockRejectedValueOnce(new Error("Delete failed"));

    const { result } = renderHook(() => useTravelHistoryPageHandlers(entries, NOW));

    act(() => {
      result.current.setDeletingTrip(entries[1].trip);
    });

    await act(async () => {
      await result.current.handleConfirmDeleteTrip();
    });

    expect(toast.error).toHaveBeenCalledWith("Delete failed");
    expect(result.current.deletingTrip?.id).toBe("trip-past-older");
  });
});
