// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useTripDetailHandlers } from "./use-trip-detail-handlers";
import { reorderDayItems } from "./actions";
import type { TripDetailPayload } from "@/data/types";

const { mockRefresh } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("../actions", () => ({
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
});
