import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useTripDetailHandlers } from "./use-trip-detail-handlers";
import { createEvent, deleteEvent, reorderDayItems, updateDay, updateEvent } from "./actions";
import {
  addPackingItem,
  deleteTrip,
  pullTemplatesOntoTrip,
  removePackingItem,
  reorderPackingItems,
  saveTripListAsTemplate,
  togglePackingItem,
  updatePackingItem,
} from "../actions";
import { removePackingSection } from "../packing-actions";
import { RemovePackingSectionMode, type TripDetailPayload } from "@/data/types";

const { mockPush, mockRefresh } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
}));

const {
  mockUseOnlineStatus,
  mockUseOfflineDb,
  mockGetOfflineDbForSession,
  mockDeleteEventLocally,
  mockReorderEventsLocally,
  mockUpdateDayLocally,
  mockWriteEventLocally,
  mockUpdateEventLocally,
  mockWritePackingItemLocally,
} = vi.hoisted(() => ({
  mockUseOnlineStatus: vi.fn(() => true),
  mockUseOfflineDb: vi.fn<() => { userId: string } | null>(() => null),
  mockGetOfflineDbForSession: vi.fn(),
  mockDeleteEventLocally: vi.fn(),
  mockReorderEventsLocally: vi.fn(),
  mockUpdateDayLocally: vi.fn(),
  mockWriteEventLocally: vi.fn(),
  mockUpdateEventLocally: vi.fn(),
  mockWritePackingItemLocally: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("@/lib/offline/use-online-status", () => ({
  useOnlineStatus: mockUseOnlineStatus,
}));

vi.mock("@/lib/offline/db", () => ({
  getOfflineDbForSession: mockGetOfflineDbForSession,
  deleteEventLocally: mockDeleteEventLocally,
  reorderEventsLocally: mockReorderEventsLocally,
  updateDayLocally: mockUpdateDayLocally,
  useOfflineDb: mockUseOfflineDb,
  writeEventLocally: mockWriteEventLocally,
  updateEventLocally: mockUpdateEventLocally,
  writePackingItemLocally: mockWritePackingItemLocally,
}));

vi.mock("../actions", () => ({
  addPackingItem: vi.fn(),
  deleteTrip: vi.fn(),
  pullTemplatesOntoTrip: vi.fn(),
  removePackingItem: vi.fn(),
  reorderPackingItems: vi.fn(),
  saveTripListAsTemplate: vi.fn(),
  togglePackingItem: vi.fn(),
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
    mockUseOnlineStatus.mockReturnValue(true);
    mockUseOfflineDb.mockReturnValue(null);
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

  it("reorders events locally instead of calling the server action while offline", async () => {
    mockUseOnlineStatus.mockReturnValue(false);
    mockUseOfflineDb.mockReturnValue({ userId: "user-1" });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleDayItemsReorder(1, [
        { type: "note", id: "note-1" },
        { type: "event", id: "event-2" },
        { type: "event", id: "event-1" },
      ]);
    });

    await waitFor(() =>
      expect(mockReorderEventsLocally).toHaveBeenCalledWith({ userId: "user-1" }, "day-1", [
        { type: "note", id: "note-1" },
        { type: "event", id: "event-2" },
        { type: "event", id: "event-1" },
      ])
    );
    expect(vi.mocked(reorderDayItems)).not.toHaveBeenCalled();
  });

  it("shows a retry toast without refreshing when offline storage is not ready yet", async () => {
    mockUseOnlineStatus.mockReturnValue(false);
    mockUseOfflineDb.mockReturnValue(null);
    mockGetOfflineDbForSession.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleDayItemsReorder(1, [{ type: "event", id: "event-1" }]);
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Offline storage is still loading. Try again in a moment.")
    );
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(vi.mocked(reorderDayItems)).not.toHaveBeenCalled();
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

    await waitFor(() =>
      expect(addPackingItem).toHaveBeenCalledWith("trip-1", {
        id: expect.any(String),
        name: "Passport",
        isLabel: true,
      })
    );
  });

  it("creates events locally instead of calling the server action while offline", async () => {
    mockUseOnlineStatus.mockReturnValue(false);
    mockUseOfflineDb.mockReturnValue({ userId: "user-1" });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleAddEvent(1, "Museum", "event-0", 1);
    });

    await waitFor(() =>
      expect(mockWriteEventLocally).toHaveBeenCalledWith(
        { userId: "user-1" },
        "trip-1",
        "day-1",
        expect.objectContaining({
          id: expect.any(String),
          name: "Museum",
          afterEventId: "event-0",
          insertAtPosition: 1,
        })
      )
    );
    expect(vi.mocked(createEvent)).not.toHaveBeenCalled();
  });

  it("updates events locally instead of calling the server action while offline", async () => {
    mockUseOnlineStatus.mockReturnValue(false);
    mockUseOfflineDb.mockReturnValue({ userId: "user-1" });

    const updatedEvent = {
      id: "event-1",
      tripId: "trip-1",
      dayId: "day-1",
      name: "Late museum",
      note: "Bring tickets",
      position: 0,
    };

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleEventUpdate(updatedEvent);
    });

    await waitFor(() =>
      expect(mockUpdateEventLocally).toHaveBeenCalledWith(
        { userId: "user-1" },
        "event-1",
        expect.objectContaining({
          name: "Late museum",
          note: "Bring tickets",
        })
      )
    );
    expect(vi.mocked(updateEvent)).not.toHaveBeenCalled();
  });

  it("deletes events locally instead of calling the server action while offline", async () => {
    mockUseOnlineStatus.mockReturnValue(false);
    mockUseOfflineDb.mockReturnValue({ userId: "user-1" });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleEventDelete("event-1");
    });

    await waitFor(() => expect(mockDeleteEventLocally).toHaveBeenCalledWith({ userId: "user-1" }, "event-1"));
    expect(vi.mocked(deleteEvent)).not.toHaveBeenCalled();
  });

  it("shows a toast and refreshes the route when deleting an event fails", async () => {
    vi.mocked(deleteEvent).mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleEventDelete("event-1");
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to delete event. Refreshing the itinerary."));
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("updates days locally instead of calling the server action while offline", async () => {
    mockUseOnlineStatus.mockReturnValue(false);
    mockUseOfflineDb.mockReturnValue({ userId: "user-1" });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleDayUpdate(1, { label: "Arrival day", subtitle: "Tokyo" });
    });

    await waitFor(() =>
      expect(mockUpdateDayLocally).toHaveBeenCalledWith({ userId: "user-1" }, "day-1", {
        label: "Arrival day",
        subtitle: "Tokyo",
      })
    );
    expect(vi.mocked(updateDay)).not.toHaveBeenCalled();
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

  it("adds packing items locally instead of calling the server action while offline", async () => {
    mockUseOnlineStatus.mockReturnValue(false);
    mockUseOfflineDb.mockReturnValue({ userId: "user-1" });
    mockWritePackingItemLocally.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await expect(result.current.handleAddPackingItem("Passport", false, "label-1")).resolves.toBeUndefined();

    expect(mockWritePackingItemLocally).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({
        operation: "create",
        tripId: "trip-1",
        input: expect.objectContaining({
          id: expect.any(String),
          name: "Passport",
          afterItemId: "label-1",
        }),
      })
    );
    expect(vi.mocked(addPackingItem)).not.toHaveBeenCalled();
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

  it("updates packing items locally instead of calling the server action while offline", async () => {
    mockUseOnlineStatus.mockReturnValue(false);
    mockUseOfflineDb.mockReturnValue({ userId: "user-1" });
    mockWritePackingItemLocally.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleUpdatePackingItem("pack-1", "Passport (renewed)");
    });

    await waitFor(() =>
      expect(mockWritePackingItemLocally).toHaveBeenCalledWith(
        { userId: "user-1" },
        expect.objectContaining({
          operation: "update",
          itemId: "pack-1",
          patch: { name: "Passport (renewed)" },
        })
      )
    );
    expect(vi.mocked(updatePackingItem)).not.toHaveBeenCalled();
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

  it("toggles packing items locally instead of calling the server action while offline", async () => {
    mockUseOnlineStatus.mockReturnValue(false);
    mockUseOfflineDb.mockReturnValue({ userId: "user-1" });
    mockWritePackingItemLocally.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await expect(result.current.handleTogglePackingItem("pack-1")).resolves.toBeUndefined();

    expect(mockWritePackingItemLocally).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({
        operation: "toggle",
        itemId: "pack-1",
      })
    );
    expect(vi.mocked(togglePackingItem)).not.toHaveBeenCalled();
  });

  it("handleAddPackingItem passes afterItemId to the server action when provided", async () => {
    vi.mocked(addPackingItem).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    act(() => {
      result.current.handleAddPackingItem("Visa", false, "label-1");
    });

    await waitFor(() =>
      expect(addPackingItem).toHaveBeenCalledWith("trip-1", {
        id: expect.any(String),
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
        id: expect.any(String),
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
