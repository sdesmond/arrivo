import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useTripDetailHandlers } from "./use-trip-detail-handlers";
import { createNote } from "./actions";
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
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  removeLastDay: vi.fn(),
  updateDay: vi.fn(),
  updateNote: vi.fn(),
}));

const detail: TripDetailPayload = {
  accessRole: "manager",
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
  notes: [],
  trip: {
    id: "trip-1",
    name: "Tokyo",
    status: "upcoming",
  },
  unscheduledEvents: [],
};

function detailWithChecklist(checklistId: string): TripDetailPayload {
  return {
    ...detail,
    days: detail.days.map((day) => ({
      ...day,
      checklists: [{ id: checklistId, tripDayId: day.id ?? "", position: 0, items: [] }],
    })),
  };
}

describe("useTripDetailHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a day reorder through the API under the day's queue key without surfacing an error", async () => {
    const { api } = await import("@/lib/api/client");
    const items = [{ type: "event" as const, id: "event-1" }];
    vi.mocked(api).mockResolvedValueOnce({ dayId: "day-1", items });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await act(async () => {
      result.current.handleDayItemsReorder(1, items);
    });

    expect(api).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ method: "PUT", path: "/api/v1/days/:dayId/order" }),
      { params: { dayId: "day-1" }, body: { items } }
    );
    expect(toast.error).not.toHaveBeenCalled();
    // Only the mutation hook's post-write refresh; the failure refresh is not taken.
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
  });

  it("toasts the 409 message and refreshes the route once when the list is stale", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(409, "conflict", "This day changed since it was loaded."));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await act(async () => {
      result.current.handleDayItemsReorder(1, [{ type: "event", id: "event-1" }]);
    });

    expect(toast.error).toHaveBeenCalledExactlyOnceWith("This day changed since it was loaded.");
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("refreshes the route once when the reorder fails on the network", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(0, "network_error", "Could not reach the server."));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await act(async () => {
      result.current.handleDayItemsReorder(1, [{ type: "event", id: "event-1" }]);
    });

    expect(toast.error).toHaveBeenCalledWith("Could not reach the server.");
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("sends rapid drags in one day in order so the last list wins", async () => {
    const { api } = await import("@/lib/api/client");
    const finished: string[] = [];
    vi.mocked(api).mockImplementationOnce(async (_endpoint, input) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      finished.push((input as { body: { items: { id: string }[] } }).body.items[0].id);
      return {};
    });
    vi.mocked(api).mockImplementation(async (_endpoint, input) => {
      finished.push((input as { body: { items: { id: string }[] } }).body.items[0].id);
      return {};
    });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await act(async () => {
      result.current.handleDayItemsReorder(1, [{ type: "event", id: "first" }]);
      result.current.handleDayItemsReorder(1, [{ type: "event", id: "second" }]);
      result.current.handleDayItemsReorder(1, [{ type: "event", id: "third" }]);
    });

    await waitFor(() => expect(finished).toEqual(["first", "second", "third"]));
  });

  it("ignores a reorder for a day number that does not exist", async () => {
    const { api } = await import("@/lib/api/client");
    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await act(async () => {
      result.current.handleDayItemsReorder(9, [{ type: "event", id: "event-1" }]);
    });

    expect(api).not.toHaveBeenCalled();
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

  it("handleAddEvent creates through the API with the draft id and the reference event", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce({ id: "draft-1" });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddEvent(1, "Museum", "event-0", undefined, "draft-1");
    });

    await expect(addPromise).resolves.toBeUndefined();
    expect(api).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ method: "POST", path: "/api/v1/days/:dayId/events" }),
      { params: { dayId: "day-1" }, body: { id: "draft-1", name: "Museum", afterEventId: "event-0" } }
    );
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("handleAddEvent sends an insert position, including 0, and no id or reference when none is given", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce({});

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await act(async () => {
      await result.current.handleAddEvent(1, "Museum", undefined, 0);
    });

    expect(api).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ method: "POST" }), {
      params: { dayId: "day-1" },
      body: { name: "Museum", insertAtPosition: 0 },
    });
  });

  it("handleAddEvent appends when no placement is given", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce({});

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await act(async () => {
      await result.current.handleAddEvent(1, "Museum");
    });

    expect(api).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ method: "POST" }), {
      params: { dayId: "day-1" },
      body: { name: "Museum" },
    });
  });

  it("handleAddEvent rejects the returned promise and shows a toast on failure", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(500, "server_error", "Add event failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddEvent(1, "Museum");
    });

    await expect(addPromise).rejects.toThrow("Add event failed");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Add event failed"));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("handleAddEvent rejects with the session message when the session was lost", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(401, "unauthenticated", "Sign in"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddEvent(1, "Museum");
    });

    await expect(addPromise).rejects.toThrow("Your session has expired.");
  });

  it("handleAddEvent ignores a day number that does not exist", async () => {
    const { api } = await import("@/lib/api/client");
    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await act(async () => {
      await result.current.handleAddEvent(9, "Museum");
    });

    expect(api).not.toHaveBeenCalled();
  });

  it("handleEventDelete keeps documents so one attached since the last refresh survives, then refreshes", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await act(async () => {
      result.current.handleEventDelete("event-1");
    });

    expect(api).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ method: "DELETE", path: "/api/v1/events/:eventId" }),
      { params: { eventId: "event-1" }, body: { tripId: "trip-1", keepDocuments: true } }
    );
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
  });

  it("handleEventDelete toasts a failure and does not refresh", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(403, "forbidden", "View access only"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await act(async () => {
      result.current.handleEventDelete("event-1");
    });

    expect(toast.error).toHaveBeenCalledWith("View access only");
    expect(mockRefresh).not.toHaveBeenCalled();
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

  it("handleAddChecklist resolves after creating through the lifecycle API", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce({ id: "checklist-1" });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddChecklist(1, 0);
    });

    await expect(addPromise).resolves.toBeUndefined();
    expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "POST" }), {
      params: { tripId: "trip-1" },
      body: { dayId: "day-1", position: 0 },
    });
    expect(result.current.newlyCreatedChecklistId).toBeNull();
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("handleAddChecklist rejects the returned promise and shows a toast on failure", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(500, "server_error", "Add checklist failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddChecklist(1, 0);
    });

    await expect(addPromise).rejects.toThrow("Add checklist failed");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Add checklist failed"));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("handleAddChecklist with firstItemContent sends one request with the first item", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce({ id: "checklist-1" });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddChecklist(1, 0, "Passport");
    });

    await expect(addPromise).resolves.toBeUndefined();
    expect(api).toHaveBeenCalledOnce();
    expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "POST" }), {
      params: { tripId: "trip-1" },
      body: { dayId: "day-1", position: 0, firstItem: { content: "Passport" } },
    });
  });

  it("keeps a checklist created with an item marked newly created until it appears in days", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce({ id: "checklist-1" });

    const { result, rerender } = renderHook(({ payload }) => useTripDetailHandlers(payload), {
      initialProps: { payload: detail },
    });

    await act(async () => {
      await result.current.handleAddChecklist(1, 0, "Passport");
    });
    expect(result.current.newlyCreatedChecklistId).toBe("checklist-1");

    // No timer clears it: a slow revalidation must still mount the checklist expanded.
    rerender({ payload: { ...detail } });
    expect(result.current.newlyCreatedChecklistId).toBe("checklist-1");

    rerender({ payload: detailWithChecklist("checklist-1") });
    await waitFor(() => expect(result.current.newlyCreatedChecklistId).toBeNull());
  });

  it("inserts from a packing source through the checklist API and keeps the marker until it appears in days", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce({ id: "checklist-2" });

    const { result, rerender } = renderHook(({ payload }) => useTripDetailHandlers(payload), {
      initialProps: { payload: detail },
    });

    await act(async () => {
      await result.current.handleInsertFromPackingSource(1, 0, "packing-list", "list-1");
    });
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST", path: "/api/v1/trips/:tripId/checklists" }),
      {
        params: { tripId: "trip-1" },
        body: { dayId: "day-1", position: 0, id: expect.any(String), source: { type: "packing-list", id: "list-1" } },
      }
    );
    expect(result.current.newlyCreatedChecklistId).toBe("checklist-2");

    // A slow revalidation must not clear it before the checklist mounts.
    rerender({ payload: { ...detail } });
    expect(result.current.newlyCreatedChecklistId).toBe("checklist-2");

    rerender({ payload: detailWithChecklist("checklist-2") });
    await waitFor(() => expect(result.current.newlyCreatedChecklistId).toBeNull());
  });

  it("handleAddChecklist with firstItemContent rejects and never expands on failure", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(0, "network_error", "Add checklist item failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddChecklist(1, 0, "Passport");
    });

    await expect(addPromise).rejects.toThrow("Add checklist item failed");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Add checklist item failed"));
    expect(result.current.newlyCreatedChecklistId).toBeNull();
  });

  it("renames, clears and deletes checklists through the lifecycle API", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useTripDetailHandlers(detailWithChecklist("list")));

    await act(async () => {
      result.current.handleUpdateChecklistTitle("list", "Docs");
      result.current.handleUpdateChecklistTitle("list", undefined);
      result.current.handleDeleteChecklist("list");
    });

    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    expect(vi.mocked(api).mock.calls).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ method: "PATCH" }), { params: { checklistId: "list" }, body: { title: "Docs" } }],
        [expect.objectContaining({ method: "PATCH" }), { params: { checklistId: "list" }, body: { title: null } }],
        [
          expect.objectContaining({ method: "DELETE" }),
          { params: { checklistId: "list" }, body: { tripId: "trip-1" } },
        ],
      ])
    );
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

vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: vi.fn(),
}));
it.each([true, false])("patches the opposite of stored checked state %s and refreshes", async (stored) => {
  const { api } = await import("@/lib/api/client");
  vi.mocked(api).mockResolvedValue({});
  const payload = detailWithChecklist("list");
  payload.days[0].checklists![0].items = [{ id: "item", checklistId: "list", content: "Passport", isChecked: stored }];
  const { result } = renderHook(() => useTripDetailHandlers(payload));
  await act(async () => {
    result.current.handleToggleChecklistItem("item");
  });
  expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH" }), {
    params: { itemId: "item" },
    body: { isChecked: !stored },
  });
  expect(mockRefresh).toHaveBeenCalledOnce();
});
it("surfaces API failure without refreshing", async () => {
  const { api, ApiClientError } = await import("@/lib/api/client");
  vi.mocked(api).mockRejectedValue(new ApiClientError(403, "forbidden", "View access only"));
  const payload = detailWithChecklist("list");
  payload.days[0].checklists![0].items = [{ id: "item", checklistId: "list", content: "Passport", isChecked: false }];
  const { result } = renderHook(() => useTripDetailHandlers(payload));
  await act(async () => {
    result.current.handleToggleChecklistItem("item");
  });
  expect(toast.error).toHaveBeenCalledWith("View access only");
  expect(mockRefresh).not.toHaveBeenCalled();
});

beforeEach(() => vi.clearAllMocks());

it("composes checklist optimism into displayed days", () => {
  const payload = detailWithChecklist("list");
  payload.days[0].checklists![0].items = [{ id: "item", checklistId: "list", content: "Passport", isChecked: false }];
  const { result } = renderHook(() => useTripDetailHandlers(payload));
  act(() => {
    result.current.handleToggleChecklistItem("item");
  });
  expect(result.current.days[0].checklists![0].items[0].isChecked).toBe(true);
});
it("sends checklist item add, edit and delete to the item endpoints", async () => {
  const { api } = await import("@/lib/api/client");
  vi.mocked(api).mockResolvedValue({});
  const payload = detailWithChecklist("list");
  payload.days[0].checklists![0].items = [{ id: "item", checklistId: "list", content: "Passport", isChecked: false }];
  const { result } = renderHook(() => useTripDetailHandlers(payload));
  await act(async () => {
    result.current.handleAddChecklistItem("list", "Charger");
    result.current.handleUpdateChecklistItem("item", "Passport copy");
    result.current.handleDeleteChecklistItem("item");
  });
  await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
  expect(vi.mocked(api).mock.calls).toEqual(
    expect.arrayContaining([
      [
        expect.objectContaining({ method: "POST", path: "/api/v1/checklists/:checklistId/items" }),
        { params: { checklistId: "list" }, body: { id: expect.any(String), content: "Charger" } },
      ],
      [
        expect.objectContaining({ method: "PATCH", path: "/api/v1/checklist-items/:itemId" }),
        { params: { itemId: "item" }, body: { content: "Passport copy" } },
      ],
      [
        expect.objectContaining({ method: "DELETE", path: "/api/v1/checklist-items/:itemId" }),
        { params: { itemId: "item" }, body: { tripId: "trip-1" } },
      ],
    ])
  );
});

const editedEvent = { id: "event-1", tripId: "trip-1", dayId: "day-1", name: "Dinner", position: 0 };
it("patches an event the page does not hold with every field, cleared ones as null", async () => {
  const { api } = await import("@/lib/api/client");
  vi.mocked(api).mockResolvedValue({});
  const { result } = renderHook(() => useTripDetailHandlers(detail));
  await act(async () => {
    result.current.handleEventUpdate({
      ...editedEvent,
      startAt: "2026-08-01T19:00:00.000Z",
      locationName: "Bistro",
      locationLat: 0,
    });
  });
  expect(api).toHaveBeenCalledOnce();
  expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH", path: "/api/v1/events/:eventId" }), {
    params: { eventId: "event-1" },
    body: {
      name: "Dinner",
      startAt: "2026-08-01T19:00:00.000Z",
      endAt: null,
      locationName: "Bistro",
      locationAddress: null,
      locationLat: 0,
      locationLng: null,
      confirmationNumber: null,
      note: null,
    },
  });
  expect(mockRefresh).toHaveBeenCalledOnce();
});
const storedEvent = { ...editedEvent, startAt: "2026-08-01T19:00:00.000Z", locationName: "Bistro", note: "Window" };
function detailWithStoredEvent(): TripDetailPayload {
  return {
    ...detail,
    days: detail.days.map((day, index) => (index === 0 ? { ...day, events: [storedEvent] } : day)),
  };
}
function lastPatchBody(api: unknown): unknown {
  const calls = vi.mocked(api as (...args: unknown[]) => unknown).mock.calls;
  return (calls[calls.length - 1][1] as { body: unknown }).body;
}
it("sends only the fields an edit changed, so a stale row cannot overwrite an earlier edit", async () => {
  const { api } = await import("@/lib/api/client");
  vi.mocked(api).mockResolvedValue({});
  const { result } = renderHook(() => useTripDetailHandlers(detailWithStoredEvent()));
  await act(async () => {
    result.current.handleEventUpdate({ ...storedEvent, name: "Supper" });
  });
  expect(lastPatchBody(api)).toEqual({ name: "Supper" });
  await act(async () => {
    result.current.handleEventUpdate({ ...storedEvent, locationName: undefined, note: "Corner" });
  });
  expect(lastPatchBody(api)).toEqual({ locationName: null, note: "Corner" });
});
it("finds the stored row of an unscheduled event", async () => {
  const { api } = await import("@/lib/api/client");
  vi.mocked(api).mockResolvedValue({});
  const unscheduled = { ...editedEvent, id: "event-2", dayId: undefined };
  const { result } = renderHook(() => useTripDetailHandlers({ ...detail, unscheduledEvents: [unscheduled] }));
  await act(async () => {
    result.current.handleEventUpdate({ ...unscheduled, endAt: "2026-08-01T20:00:00.000Z" });
  });
  expect(lastPatchBody(api)).toEqual({ endAt: "2026-08-01T20:00:00.000Z" });
});
it("sends nothing for an edit that changes no field", async () => {
  const { api } = await import("@/lib/api/client");
  vi.mocked(api).mockClear();
  const { result } = renderHook(() => useTripDetailHandlers(detailWithStoredEvent()));
  await act(async () => {
    result.current.handleEventUpdate({ ...storedEvent });
  });
  expect(api).not.toHaveBeenCalled();
});
it("surfaces an event edit failure without refreshing", async () => {
  const { api, ApiClientError } = await import("@/lib/api/client");
  vi.mocked(api).mockRejectedValue(new ApiClientError(403, "forbidden", "View access only"));
  const { result } = renderHook(() => useTripDetailHandlers(detail));
  await act(async () => {
    result.current.handleEventUpdate(editedEvent);
  });
  expect(toast.error).toHaveBeenCalledWith("View access only");
  expect(mockRefresh).not.toHaveBeenCalled();
});
it("sends rapid edits to one event in the order they were made", async () => {
  const { api } = await import("@/lib/api/client");
  const finished: string[] = [];
  vi.mocked(api).mockImplementation(async (_endpoint, input) => {
    const name = (input as { body: { name: string } }).body.name;
    await new Promise((resolve) => setTimeout(resolve, name === "First" ? 20 : 0));
    finished.push(name);
    return {};
  });
  const { result } = renderHook(() => useTripDetailHandlers(detail));
  await act(async () => {
    result.current.handleEventUpdate({ ...editedEvent, name: "First" });
    result.current.handleEventUpdate({ ...editedEvent, name: "Second" });
  });
  await waitFor(() => expect(finished).toEqual(["First", "Second"]));
});
