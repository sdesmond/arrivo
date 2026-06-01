import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useTripDetailHandlers } from "./use-trip-detail-handlers";
import { reorderDayItems } from "./actions";
import { addPackingItem, deleteTrip, removePackingItem, reorderPackingItems, updatePackingItem } from "../actions";
import type { TripDetailPayload } from "@/data/types";

const { mockPush, mockRefresh } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("../actions", () => ({
  addPackingItem: vi.fn(),
  deleteTrip: vi.fn(),
  removePackingItem: vi.fn(),
  reorderPackingItems: vi.fn(),
  updatePackingItem: vi.fn(),
  updateTripMetadata: vi.fn(),
}));

vi.mock("./actions", () => ({
  addDay: vi.fn(),
  createChecklist: vi.fn(),
  createChecklistItem: vi.fn(),
  createChecklistWithItem: vi.fn(),
  createEvent: vi.fn(),
  createNote: vi.fn(),
  deleteChecklist: vi.fn(),
  deleteChecklistItem: vi.fn(),
  deleteEvent: vi.fn(),
  deleteNote: vi.fn(),
  removeLastDay: vi.fn(),
  reorderDayItems: vi.fn(),
  toggleChecklistItem: vi.fn(),
  updateChecklistItem: vi.fn(),
  updateChecklistTitle: vi.fn(),
  updateDay: vi.fn(),
  updateEvent: vi.fn(),
  updateNote: vi.fn(),
}));

const detail: TripDetailPayload = {
  collaborators: [],
  days: [
    {
      dayNumber: 1,
      date: "2026-08-01",
      events: [],
      id: "day-1",
      label: "Day 1",
      notes: [],
      checklists: [],
    },
  ],
  docs: [],
  packingItems: [],
  trip: {
    id: "trip-1",
    name: "Tokyo",
    status: "upcoming",
  },
  unscheduledEvents: [],
};

describe("useTripDetailHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates successful day reorders without surfacing an error", async () => {
    vi.mocked(reorderDayItems).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleDayItemsReorder(1, [{ type: "event", id: "event-1" }]);
    });

    await waitFor(() =>
      expect(reorderDayItems).toHaveBeenCalledWith({
        dayId: "day-1",
        orderedItems: [{ type: "event", id: "event-1" }],
      })
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("shows a toast and refreshes the route when the server rejects a stale reorder", async () => {
    vi.mocked(reorderDayItems).mockRejectedValueOnce(new Error("CONCURRENT_MODIFICATION"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleDayItemsReorder(1, [{ type: "event", id: "event-1" }]);
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("This day changed elsewhere. Refreshing the itinerary.")
    );
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("deletes the trip and returns to the trips list", async () => {
    vi.mocked(deleteTrip).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleDeleteTrip();
    });

    await waitFor(() => expect(deleteTrip).toHaveBeenCalledWith("trip-1"));
    expect(mockPush).toHaveBeenCalledWith("/trips");
  });

  it("adds packing items against the current trip", async () => {
    vi.mocked(addPackingItem).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleAddPackingItem("Passport", true);
    });

    await waitFor(() => expect(addPackingItem).toHaveBeenCalledWith("trip-1", { name: "Passport", isLabel: true }));
  });

  it("removes packing items by id", async () => {
    vi.mocked(removePackingItem).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleRemovePackingItem("pack-1");
    });

    await waitFor(() => expect(removePackingItem).toHaveBeenCalledWith("pack-1"));
  });

  it("persists reordered packing items against the current trip", async () => {
    vi.mocked(reorderPackingItems).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleReorderPackingItems(["pack-2", "pack-1"]);
    });

    await waitFor(() => expect(reorderPackingItems).toHaveBeenCalledWith("trip-1", ["pack-2", "pack-1"]));
    expect(toast.error).not.toHaveBeenCalled();
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
  });

  it("surfaces a toast and refreshes the route when packing reorder fails", async () => {
    vi.mocked(reorderPackingItems).mockRejectedValueOnce(new Error("Reorder failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleReorderPackingItems(["pack-2", "pack-1"]);
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Reorder failed"));
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("calls onError callback before refresh when packing reorder fails", async () => {
    vi.mocked(reorderPackingItems).mockRejectedValueOnce(new Error("Reorder failed"));
    const onError = vi.fn();

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleReorderPackingItems(["pack-2", "pack-1"], onError);
    });

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("surfaces a toast when trip deletion fails", async () => {
    vi.mocked(deleteTrip).mockRejectedValueOnce(new Error("Delete failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleDeleteTrip();
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Delete failed"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("handleUpdatePackingItem calls updatePackingItem server action with id and name", async () => {
    vi.mocked(updatePackingItem).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleUpdatePackingItem("pack-1", "Passport (renewed)");
    });

    await waitFor(() => expect(updatePackingItem).toHaveBeenCalledWith("pack-1", { name: "Passport (renewed)" }));
  });

  it("handleUpdatePackingItem surfaces a toast when the server action fails", async () => {
    vi.mocked(updatePackingItem).mockRejectedValueOnce(new Error("Update failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleUpdatePackingItem("pack-1", "Passport (renewed)");
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Update failed"));
  });

  it("handleAddPackingItem passes afterItemId to the server action when provided", async () => {
    vi.mocked(addPackingItem).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleAddPackingItem("Visa", false, "label-1");
    });

    await waitFor(() =>
      expect(addPackingItem).toHaveBeenCalledWith("trip-1", {
        name: "Visa",
        isLabel: false,
        afterItemId: "label-1",
      })
    );
  });

  it("handleAddPackingItem passes beforeItemId to the server action when provided", async () => {
    vi.mocked(addPackingItem).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleAddPackingItem("Travel adapter", false, undefined, "label-1");
    });

    await waitFor(() =>
      expect(addPackingItem).toHaveBeenCalledWith("trip-1", {
        name: "Travel adapter",
        isLabel: false,
        afterItemId: undefined,
        beforeItemId: "label-1",
      })
    );
  });
});
