import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useTripDetailHandlers } from "./use-trip-detail-handlers";
import { createChecklist, createChecklistWithItem, createEvent, createNote, reorderDayItems } from "./actions";
import {
  addPackingItem,
  deleteTrip,
  pullTemplatesOntoTrip,
  removePackingItem,
  reorderPackingItems,
  saveTripListAsTemplate,
  updatePackingItem,
} from "../actions";
import { removePackingSection } from "../packing-actions";
import { RemovePackingSectionMode, type TripDetailPayload } from "@/data/types";

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
  pullTemplatesOntoTrip: vi.fn(),
  removePackingItem: vi.fn(),
  reorderPackingItems: vi.fn(),
  saveTripListAsTemplate: vi.fn(),
  updatePackingItem: vi.fn(),
  updateTripMetadata: vi.fn(),
}));

vi.mock("../packing-actions", () => ({
  removePackingSection: vi.fn(),
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
  packingLists: [],
  reservations: [],
  expenses: [],
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

  it("handleAddEvent resolves the returned promise on success", async () => {
    vi.mocked(createEvent).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddEvent(1, "Museum");
    });

    await expect(addPromise).resolves.toBeUndefined();
    expect(createEvent).toHaveBeenCalledWith("day-1", {
      name: "Museum",
      afterEventId: undefined,
      insertAtPosition: undefined,
    });
  });

  it("handleAddEvent rejects the returned promise and shows a toast on failure", async () => {
    vi.mocked(createEvent).mockRejectedValueOnce(new Error("Add event failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddEvent(1, "Museum");
    });

    await expect(addPromise).rejects.toThrow("Add event failed");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Add event failed"));
  });

  it("handleAddNote resolves the returned promise on success", async () => {
    vi.mocked(createNote).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddNote(1, "Tickets");
    });

    await expect(addPromise).resolves.toBeUndefined();
    expect(createNote).toHaveBeenCalledWith("day-1", "Tickets", undefined);
  });

  it("handleAddNote rejects the returned promise and shows a toast on failure", async () => {
    vi.mocked(createNote).mockRejectedValueOnce(new Error("Add note failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddNote(1, "Tickets");
    });

    await expect(addPromise).rejects.toThrow("Add note failed");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Add note failed"));
  });

  it("handleAddChecklist resolves the returned promise on success", async () => {
    vi.mocked(createChecklist).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddChecklist(1, 0);
    });

    await expect(addPromise).resolves.toBeUndefined();
    expect(createChecklist).toHaveBeenCalledWith("day-1", 0);
  });

  it("handleAddChecklist rejects the returned promise and shows a toast on failure", async () => {
    vi.mocked(createChecklist).mockRejectedValueOnce(new Error("Add checklist failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddChecklist(1, 0);
    });

    await expect(addPromise).rejects.toThrow("Add checklist failed");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Add checklist failed"));
  });

  it("handleAddChecklist with firstItemContent resolves the returned promise on success", async () => {
    vi.mocked(createChecklistWithItem).mockResolvedValueOnce("checklist-1");

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddChecklist(1, 0, "Passport");
    });

    await expect(addPromise).resolves.toBeUndefined();
    expect(createChecklistWithItem).toHaveBeenCalledWith("day-1", 0, "Passport");
  });

  it("handleAddChecklist with firstItemContent rejects the returned promise and shows a toast on failure", async () => {
    vi.mocked(createChecklistWithItem).mockRejectedValueOnce(new Error("Add checklist item failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddChecklist(1, 0, "Passport");
    });

    await expect(addPromise).rejects.toThrow("Add checklist item failed");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Add checklist item failed"));
  });

  it("adds packing items against the current trip", async () => {
    vi.mocked(addPackingItem).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleAddPackingItem("Passport", true);
    });

    await waitFor(() => expect(addPackingItem).toHaveBeenCalledWith("trip-1", { name: "Passport", isLabel: true }));
  });

  it("handleAddPackingItem resolves the returned promise on success", async () => {
    vi.mocked(addPackingItem).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddPackingItem("Passport");
    });

    await expect(addPromise).resolves.toBeUndefined();
  });

  it("handleAddPackingItem rejects the returned promise and shows a toast on failure", async () => {
    vi.mocked(addPackingItem).mockRejectedValueOnce(new Error("Add failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddPackingItem("Passport");
    });

    await expect(addPromise).rejects.toThrow("Add failed");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Add failed"));
  });

  it("removes packing items by id", async () => {
    vi.mocked(removePackingItem).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleRemovePackingItem("pack-1");
    });

    await waitFor(() => expect(removePackingItem).toHaveBeenCalledWith("pack-1"));
  });

  it("handleRemovePackingItem resolves the returned promise on success", async () => {
    vi.mocked(removePackingItem).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let removePromise: Promise<void> | undefined;
    act(() => {
      removePromise = result.current.handleRemovePackingItem("pack-1");
    });

    await expect(removePromise).resolves.toBeUndefined();
  });

  it("handleRemovePackingItem rejects the returned promise and shows a toast on failure", async () => {
    vi.mocked(removePackingItem).mockRejectedValueOnce(new Error("Remove failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let removePromise: Promise<void> | undefined;
    act(() => {
      removePromise = result.current.handleRemovePackingItem("pack-1");
    });

    await expect(removePromise).rejects.toThrow("Remove failed");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Remove failed"));
  });

  it("removes a packing section with the selected mode", async () => {
    vi.mocked(removePackingSection).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let removePromise: Promise<void> | undefined;
    act(() => {
      removePromise = result.current.handleRemovePackingSection("label-1", RemovePackingSectionMode.DeleteItems);
    });

    await expect(removePromise).resolves.toBeUndefined();
    await waitFor(() =>
      expect(removePackingSection).toHaveBeenCalledWith("label-1", { mode: RemovePackingSectionMode.DeleteItems })
    );
  });

  it("handleRemovePackingSection rejects the returned promise and shows a toast on failure", async () => {
    vi.mocked(removePackingSection).mockRejectedValueOnce(new Error("Section remove failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let removePromise: Promise<void> | undefined;
    act(() => {
      removePromise = result.current.handleRemovePackingSection(
        "label-1",
        RemovePackingSectionMode.MoveItemsToUngrouped
      );
    });

    await expect(removePromise).rejects.toThrow("Section remove failed");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Section remove failed"));
  });

  it("persists reordered packing items against the current trip", async () => {
    vi.mocked(reorderPackingItems).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    const ordered = [
      { id: "pack-2", labelId: null, position: 0 },
      { id: "pack-1", labelId: null, position: 1 },
    ];

    act(() => {
      result.current.handleReorderPackingItems(ordered);
    });

    await waitFor(() => expect(reorderPackingItems).toHaveBeenCalledWith("trip-1", ordered));
    expect(toast.error).not.toHaveBeenCalled();
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
  });

  it("surfaces a toast when packing reorder fails", async () => {
    vi.mocked(reorderPackingItems).mockRejectedValueOnce(new Error("Reorder failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleReorderPackingItems([{ id: "pack-2", labelId: null, position: 0 }]);
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Reorder failed"));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("calls onError callback when packing reorder fails", async () => {
    vi.mocked(reorderPackingItems).mockRejectedValueOnce(new Error("Reorder failed"));
    const onError = vi.fn();

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleReorderPackingItems([{ id: "pack-2", labelId: null, position: 0 }], onError);
    });

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(mockRefresh).not.toHaveBeenCalled();
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

  it("handlePullTemplates calls pullTemplatesOntoTrip with the trip id and template ids", async () => {
    vi.mocked(pullTemplatesOntoTrip).mockResolvedValueOnce({ added: 3, skipped: 1 });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let pullResult: Awaited<ReturnType<typeof result.current.handlePullTemplates>>;
    await act(async () => {
      pullResult = await result.current.handlePullTemplates(["t1", "t2"]);
    });

    expect(pullTemplatesOntoTrip).toHaveBeenCalledWith("trip-1", ["t1", "t2"], undefined);
    await waitFor(() => expect(pullResult).toEqual({ added: 3, skipped: 1 }));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("handlePullTemplates shows toast.error and resolves undefined when action throws", async () => {
    vi.mocked(pullTemplatesOntoTrip).mockRejectedValueOnce(new Error("Pull failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let pullResult: Awaited<ReturnType<typeof result.current.handlePullTemplates>>;
    await act(async () => {
      pullResult = await result.current.handlePullTemplates(["t1"]);
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Pull failed"));
    expect(pullResult).toBeUndefined();
  });

  it("handleSaveAsTemplate calls saveTripListAsTemplate with trip id and name, resolves with templateId", async () => {
    vi.mocked(saveTripListAsTemplate).mockResolvedValueOnce({ templateId: "tmpl-abc" });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let saveResult: Awaited<ReturnType<typeof result.current.handleSaveAsTemplate>>;
    await act(async () => {
      saveResult = await result.current.handleSaveAsTemplate("My Template");
    });

    expect(saveTripListAsTemplate).toHaveBeenCalledWith("trip-1", "My Template");
    await waitFor(() => expect(saveResult).toBe("tmpl-abc"));
  });

  it("handleSaveAsTemplate shows toast.error and resolves undefined when action throws", async () => {
    vi.mocked(saveTripListAsTemplate).mockRejectedValueOnce(new Error("Save failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let saveResult: Awaited<ReturnType<typeof result.current.handleSaveAsTemplate>>;
    await act(async () => {
      saveResult = await result.current.handleSaveAsTemplate("My Template");
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Save failed"));
    expect(saveResult).toBeUndefined();
  });
});
