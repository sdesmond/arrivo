import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useTripDetailHandlers } from "./use-trip-detail-handlers";
import { deleteTrip, saveTripListAsTemplate } from "../actions";
import { type TripDetailPayload } from "@/data/types";

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
  saveTripListAsTemplate: vi.fn(),
}));

vi.mock("../packing-actions", () => ({
  removePackingSection: vi.fn(),
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

function withPacking(): TripDetailPayload {
  return {
    ...detail,
    packingItems: [
      { id: "pack-1", name: "Socks", done: false, listId: null },
      { id: "pack-2", name: "Hat", done: false },
      { id: "pack-3", name: "Boots", done: false, listId: "list-1" },
    ],
  };
}

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

  it("handleAddNote creates through the API with the draft's ID and position, then refreshes", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce({ id: "note-1" });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddNote(1, "Tickets", 2, "11111111-1111-4111-8111-111111111111");
    });

    await expect(addPromise).resolves.toBeUndefined();
    expect(api).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ method: "POST", path: "/api/v1/days/:dayId/notes" }),
      {
        params: { dayId: "day-1" },
        body: { id: "11111111-1111-4111-8111-111111111111", content: "Tickets", insertAtPosition: 2 },
      }
    );
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
  });

  it("handleAddNote omits the ID and position when none is given", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce({ id: "note-1" });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await act(async () => {
      await result.current.handleAddNote(1, "Tickets");
    });

    expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "POST" }), {
      params: { dayId: "day-1" },
      body: { content: "Tickets" },
    });
  });

  it("handleAddNote resolves without calling the API for an unknown day", async () => {
    const { api } = await import("@/lib/api/client");
    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await act(async () => {
      await result.current.handleAddNote(9, "Tickets");
    });

    expect(api).not.toHaveBeenCalled();
  });

  it("handleAddNote rejects the returned promise and toasts on an API failure", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(403, "forbidden", "View access only"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.handleAddNote(1, "Tickets");
    });

    await expect(addPromise).rejects.toThrow("View access only");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("View access only"));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("handleUpdateNote and handleDeleteNote call the note endpoints, delete carrying the trip", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValue({});

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    await act(async () => {
      result.current.handleUpdateNote("note-1", "Tickets and map");
      result.current.handleDeleteNote("note-1");
    });

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api).mock.calls).toEqual([
      [
        expect.objectContaining({ method: "PATCH", path: "/api/v1/itinerary-notes/:noteId" }),
        { params: { noteId: "note-1" }, body: { content: "Tickets and map" } },
      ],
      [
        expect.objectContaining({ method: "DELETE", path: "/api/v1/itinerary-notes/:noteId" }),
        { params: { noteId: "note-1" }, body: { tripId: "trip-1" } },
      ],
    ]);
  });

  it("sends rapid edits to one note in the order they were made", async () => {
    const { api } = await import("@/lib/api/client");
    const finished: string[] = [];
    vi.mocked(api).mockImplementation(async (_endpoint, input) => {
      const content = (input as { body: { content: string } }).body.content;
      await new Promise((resolve) => setTimeout(resolve, content === "First" ? 20 : 0));
      finished.push(content);
      return {};
    });
    const { result } = renderHook(() => useTripDetailHandlers(detail));
    await act(async () => {
      result.current.handleUpdateNote("note-1", "First");
      result.current.handleUpdateNote("note-1", "Second");
    });
    await waitFor(() => expect(finished).toEqual(["First", "Second"]));
  });

  it("handleUpdateNote surfaces an API failure", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(403, "forbidden", "View access only"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));
    await act(async () => {
      result.current.handleUpdateNote("note-1", "x");
    });

    expect(toast.error).toHaveBeenCalledWith("View access only");
    expect(mockRefresh).not.toHaveBeenCalled();
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

  it("removes packing items through the trip-scoped API", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce(null);
    const { result } = renderHook(() => useTripDetailHandlers(detail));
    await act(async () => {
      await result.current.handleRemovePackingItem("pack-1");
    });
    expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "DELETE" }), {
      params: { itemId: "pack-1" },
      body: { tripId: "trip-1" },
    });
  });

  it("sends a packing reorder through the API for the dragged list and refreshes once", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce({});
    const { result } = renderHook(() => useTripDetailHandlers(withPacking()));

    await act(async () => {
      result.current.handleReorderPackingItems([
        { id: "pack-2", labelId: null },
        { id: "pack-1", labelId: null },
      ]);
    });

    expect(api).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ method: "PUT", path: "/api/v1/trips/:tripId/packing/order" }),
      {
        params: { tripId: "trip-1" },
        body: {
          listId: null,
          items: [
            { id: "pack-2", labelId: null },
            { id: "pack-1", labelId: null },
          ],
        },
      }
    );
    expect(toast.error).not.toHaveBeenCalled();
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
  });

  it("names the list of the first item and drops positions", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce({});
    const { result } = renderHook(() => useTripDetailHandlers(withPacking()));

    await act(async () => {
      result.current.handleReorderPackingItems([
        { id: "pack-3", labelId: null, position: 4 } as { id: string; labelId: null },
      ]);
    });

    expect(vi.mocked(api).mock.calls[0][1]).toEqual({
      params: { tripId: "trip-1" },
      body: { listId: "list-1", items: [{ id: "pack-3", labelId: null }] },
    });
  });

  it("rolls back and refreshes when a packing reorder's first item is unknown or the list is empty", async () => {
    const { api } = await import("@/lib/api/client");
    const onError = vi.fn();
    const { result } = renderHook(() => useTripDetailHandlers(withPacking()));

    await act(async () => {
      result.current.handleReorderPackingItems([{ id: "missing", labelId: null }], onError);
      result.current.handleReorderPackingItems([], onError);
    });

    expect(api).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });

  it("toasts the 409, rolls the drag back and refreshes the route when the list is stale", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(409, "conflict", "This packing list changed."));
    const onError = vi.fn();
    const { result } = renderHook(() => useTripDetailHandlers(withPacking()));

    await act(async () => {
      result.current.handleReorderPackingItems([{ id: "pack-1", labelId: null }], onError);
    });

    expect(toast.error).toHaveBeenCalledExactlyOnceWith("This packing list changed.");
    expect(onError).toHaveBeenCalledOnce();
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("rolls back without an onError callback", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(0, "network_error", "Could not reach the server."));
    const { result } = renderHook(() => useTripDetailHandlers(withPacking()));

    await act(async () => {
      result.current.handleReorderPackingItems([{ id: "pack-1", labelId: null }]);
    });

    expect(toast.error).toHaveBeenCalledWith("Could not reach the server.");
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("sends rapid packing drags of one list in order so the last order wins", async () => {
    const { api } = await import("@/lib/api/client");
    const finished: string[] = [];
    const record = (input: unknown) => finished.push((input as { body: { items: { id: string }[] } }).body.items[0].id);
    vi.mocked(api).mockImplementationOnce(async (_endpoint, input) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      record(input);
      return {};
    });
    vi.mocked(api).mockImplementation(async (_endpoint, input) => {
      record(input);
      return {};
    });
    const { result } = renderHook(() => useTripDetailHandlers(withPacking()));

    await act(async () => {
      result.current.handleReorderPackingItems([{ id: "pack-1", labelId: null }]);
      result.current.handleReorderPackingItems([{ id: "pack-2", labelId: null }]);
      result.current.handleReorderPackingItems([{ id: "pack-1", labelId: null }]);
    });

    await waitFor(() => expect(finished).toEqual(["pack-1", "pack-2", "pack-1"]));
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

  it("renames packing items through the API", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce({});
    const { result } = renderHook(() => useTripDetailHandlers(detail));
    act(() => result.current.handleUpdatePackingItem("pack-1", "Boots"));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH" }), {
        params: { itemId: "pack-1" },
        body: { name: "Boots" },
      })
    );
  });

  it("handlePullTemplates calls pullTemplatesOntoTrip with the trip id and template ids", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValueOnce({ added: 3, skipped: 1 });

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let pullResult: Awaited<ReturnType<typeof result.current.handlePullTemplates>>;
    await act(async () => {
      pullResult = await result.current.handlePullTemplates(["t1", "t2"]);
    });

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST", path: "/api/v1/trips/:tripId/packing/pull-templates" }),
      { params: { tripId: "trip-1" }, body: { templateIds: ["t1", "t2"], listId: undefined } }
    );
    await waitFor(() => expect(pullResult).toEqual({ added: 3, skipped: 1 }));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("handlePullTemplates shows toast.error and resolves undefined when action throws", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new Error("Pull failed"));

    const { result } = renderHook(() => useTripDetailHandlers(detail));

    let pullResult: Awaited<ReturnType<typeof result.current.handlePullTemplates>>;
    await act(async () => {
      pullResult = await result.current.handlePullTemplates(["t1"]);
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not save changes. Try again."));
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
it.each([
  [{ name: "Supper" }, { name: "Dinner" }],
  [{ note: "Window" }, { note: undefined }],
  [
    { startAt: "2026-08-01T19:00:00.000Z", endAt: "2026-08-01T20:00:00.000Z" },
    { startAt: undefined, endAt: undefined },
  ],
  [
    { locationName: "Bistro", locationAddress: "Tokyo", locationLat: 0, locationLng: 0 },
    { locationName: undefined, locationAddress: undefined, locationLat: undefined, locationLng: undefined },
  ],
  [{ name: "Supper" }, { note: "Window" }],
])("preserves explicit saves behind held write: %j then %j", async (first, second) => {
  const { api } = await import("@/lib/api/client");
  let releaseFirst!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  vi.mocked(api).mockImplementationOnce(async () => {
    await held;
    return {};
  });
  vi.mocked(api).mockResolvedValue({});
  const payload = { ...detail, days: detail.days.map((day) => ({ ...day, events: [editedEvent] })) };
  const { result } = renderHook(() => useTripDetailHandlers(payload));
  await act(async () => {
    result.current.handleEventUpdate({ id: editedEvent.id, ...first });
    result.current.handleEventUpdate({ id: editedEvent.id, ...second });
  });
  expect(api).toHaveBeenCalledOnce();
  await act(async () => {
    releaseFirst();
  });
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api).mock.calls.map(([, input]) => (input as { body: unknown }).body)).toEqual([
    first,
    Object.fromEntries(Object.entries(second).map(([field, value]) => [field, value ?? null])),
  ]);
});
it("patches an unknown event with only explicitly supplied fields", async () => {
  const { api } = await import("@/lib/api/client");
  vi.mocked(api).mockResolvedValue({});
  const { result } = renderHook(() => useTripDetailHandlers(detail));
  await act(async () => {
    result.current.handleEventUpdate({
      id: editedEvent.id,
      startAt: "2026-08-01T19:00:00.000Z",
      locationName: "Bistro",
      locationLat: 0,
    });
  });
  expect(api).toHaveBeenCalledOnce();
  expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH", path: "/api/v1/events/:eventId" }), {
    params: { eventId: "event-1" },
    body: {
      startAt: "2026-08-01T19:00:00.000Z",
      locationName: "Bistro",
      locationLat: 0,
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
    result.current.handleEventUpdate({ id: storedEvent.id, name: "Supper" });
  });
  expect(lastPatchBody(api)).toEqual({ name: "Supper" });
  await act(async () => {
    result.current.handleEventUpdate({ id: storedEvent.id, locationName: undefined, note: "Corner" });
  });
  expect(lastPatchBody(api)).toEqual({ locationName: null, note: "Corner" });
});
it("patches an unscheduled event by identity with only its explicitly saved field", async () => {
  const { api } = await import("@/lib/api/client");
  vi.mocked(api).mockResolvedValue({});
  const unscheduled = { ...editedEvent, id: "event-2", dayId: undefined };
  const { result } = renderHook(() => useTripDetailHandlers({ ...detail, unscheduledEvents: [unscheduled] }));
  await act(async () => {
    result.current.handleEventUpdate({ id: unscheduled.id, endAt: "2026-08-01T20:00:00.000Z" });
  });
  expect(lastPatchBody(api)).toEqual({ endAt: "2026-08-01T20:00:00.000Z" });
  expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH" }), {
    params: { eventId: "event-2" },
    body: { endAt: "2026-08-01T20:00:00.000Z" },
  });
});
it("sends nothing for identity without explicitly saved fields", async () => {
  const { api } = await import("@/lib/api/client");
  vi.mocked(api).mockClear();
  const { result } = renderHook(() => useTripDetailHandlers(detailWithStoredEvent()));
  await act(async () => {
    result.current.handleEventUpdate({ id: storedEvent.id });
  });
  expect(api).not.toHaveBeenCalled();
});
it("surfaces an event edit failure and refreshes to the stored event", async () => {
  const { api, ApiClientError } = await import("@/lib/api/client");
  vi.mocked(api).mockRejectedValue(new ApiClientError(403, "forbidden", "View access only"));
  const { result } = renderHook(() => useTripDetailHandlers(detail));
  await act(async () => {
    result.current.handleEventUpdate({ id: editedEvent.id, name: editedEvent.name });
  });
  expect(toast.error).toHaveBeenCalledWith("View access only");
  expect(mockRefresh).toHaveBeenCalledOnce();
});
it("refreshes after a timed-out event edit so the row stops showing the unsaved draft", async () => {
  const { api, ApiClientError } = await import("@/lib/api/client");
  vi.mocked(api).mockRejectedValue(new ApiClientError(0, "timeout", "The request timed out. Try again."));
  const { result } = renderHook(() => useTripDetailHandlers(detail));
  await act(async () => {
    result.current.handleEventUpdate({ id: editedEvent.id, name: "Supper" });
  });
  expect(toast.error).toHaveBeenCalledWith("The request timed out. Try again.");
  expect(mockRefresh).toHaveBeenCalledOnce();
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
    result.current.handleEventUpdate({ id: editedEvent.id, name: "First" });
    result.current.handleEventUpdate({ id: editedEvent.id, name: "Second" });
  });
  await waitFor(() => expect(finished).toEqual(["First", "Second"]));
});

describe("day handlers", () => {
  const tripDays: TripDetailPayload = {
    ...detail,
    days: [1, 2, 3].map((dayNumber) => ({
      id: `day-${dayNumber}`,
      dayNumber,
      date: `2026-08-0${dayNumber}`,
      label: `Day ${dayNumber}`,
      events: [],
      notes: [],
      checklists: [],
    })),
  };
  const firstId = "11111111-1111-4111-8111-111111111111";
  const secondId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(firstId);
  });

  it("patches a day through the API, then refreshes", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValue({ id: "day-1" });
    const { result } = renderHook(() => useTripDetailHandlers(detail));
    // A keyed write resolves once the refresh it started settles, which the mocked router never reports.
    await act(async () => {
      void result.current.handleDayUpdate(1, { label: "Arrival" });
    });
    expect(api).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ method: "PATCH", path: "/api/v1/days/:dayId" }),
      { params: { dayId: "day-1" }, body: { label: "Arrival" } }
    );
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("sends rapid edits to one day in the order they were made", async () => {
    const { api } = await import("@/lib/api/client");
    const finished: string[] = [];
    vi.mocked(api).mockImplementation(async (_endpoint, input) => {
      const label = (input as { body: { label: string } }).body.label;
      await new Promise((resolve) => setTimeout(resolve, label === "First" ? 20 : 0));
      finished.push(label);
      return {};
    });
    const { result } = renderHook(() => useTripDetailHandlers(detail));
    await act(async () => {
      void result.current.handleDayUpdate(1, { label: "First" });
      void result.current.handleDayUpdate(1, { label: "Second" });
    });
    await waitFor(() => expect(finished).toEqual(["First", "Second"]));
  });

  it("sends a present-but-undefined text field as null so it clears, and never a cleared label", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValue({ id: "day-1" });
    const { result } = renderHook(() => useTripDetailHandlers(detail));
    await act(async () => {
      void result.current.handleDayUpdate(1, {
        label: undefined,
        subtitle: undefined,
        weather: undefined,
        travelSummary: "Train",
      });
    });
    expect(api).toHaveBeenCalledWith(expect.anything(), {
      params: { dayId: "day-1" },
      body: { subtitle: null, weather: null, travelSummary: "Train" },
    });
  });

  it("sends nothing for an update that carries no editable field, or for an unknown day", async () => {
    const { api } = await import("@/lib/api/client");
    const { result } = renderHook(() => useTripDetailHandlers(detail));
    await act(async () => {
      await result.current.handleDayUpdate(1, { dayNumber: 1 });
      await result.current.handleDayUpdate(9, { label: "Ghost" });
    });
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects the returned promise and toasts when the day update fails", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(422, "validation_failed", "Day label is too long."));
    const { result } = renderHook(() => useTripDetailHandlers(detail));
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.handleDayUpdate(1, { label: "x" });
    });
    await expect(pending).rejects.toThrow("Day label is too long.");
    expect(toast.error).toHaveBeenCalledWith("Day label is too long.");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("rejects with a fallback message for a non-API failure, and with the session message when auth is lost", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce("boom");
    const { result } = renderHook(() => useTripDetailHandlers(detail));
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.handleDayUpdate(1, { label: "x" });
    });
    await expect(pending).rejects.toThrow("Failed to update day. Please try again.");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(401, "unauthenticated", "Sign in"));
    const second = renderHook(() => useTripDetailHandlers(detail));
    act(() => {
      pending = second.result.current.handleDayUpdate(1, { label: "x" });
    });
    await expect(pending).rejects.toThrow("Your session has expired.");
  });

  it("adds a day through the API with a client id and refreshes", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValue({ id: firstId });
    const { result } = renderHook(() => useTripDetailHandlers(detail));
    await act(async () => {
      result.current.handleAddDay();
    });
    expect(api).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ method: "POST", path: "/api/v1/trips/:tripId/days" }),
      { params: { tripId: "trip-1" }, body: { id: firstId } }
    );
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
  });

  it("reuses the id after a failed add (lost response), and replaces it after a success", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
    vi.mocked(api)
      .mockRejectedValueOnce(new ApiClientError(0, "network_error", "Could not reach the server."))
      .mockResolvedValue({ id: firstId });
    const { result } = renderHook(() => useTripDetailHandlers(detail));
    await act(async () => {
      result.current.handleAddDay();
    });
    await act(async () => {
      result.current.handleAddDay();
    });
    await act(async () => {
      result.current.handleAddDay();
    });
    const ids = vi.mocked(api).mock.calls.map(([, input]) => (input as { body: { id: string } }).body.id);
    expect(ids).toEqual([firstId, firstId, secondId]);
  });

  it("replaces the id after a 409 so the next click is a fresh add", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
    vi.mocked(api)
      .mockRejectedValueOnce(new ApiClientError(409, "conflict", "This ID was already used for a different day."))
      .mockResolvedValue({ id: secondId });
    const { result } = renderHook(() => useTripDetailHandlers(detail));
    await act(async () => {
      result.current.handleAddDay();
    });
    expect(toast.error).toHaveBeenCalledWith("This ID was already used for a different day.");
    await act(async () => {
      result.current.handleAddDay();
    });
    const ids = vi.mocked(api).mock.calls.map(([, input]) => (input as { body: { id: string } }).body.id);
    expect(ids).toEqual([firstId, secondId]);
  });

  it("drops a failed add's id once a day is removed, so the next add is not refused as a deleted day", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
    vi.mocked(api)
      .mockRejectedValueOnce(new ApiClientError(0, "network_error", "Could not reach the server."))
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: secondId });
    const { result } = renderHook(() => useTripDetailHandlers(tripDays));
    await act(async () => {
      result.current.handleAddDay();
    });
    await act(async () => {
      result.current.handleRemoveLastDay(false, vi.fn());
    });
    await act(async () => {
      result.current.handleAddDay();
    });
    const addIds = vi
      .mocked(api)
      .mock.calls.filter(([endpoint]) => (endpoint as { method: string }).method === "POST")
      .map(([, input]) => (input as { body: { id: string } }).body.id);
    expect(addIds).toEqual([firstId, secondId]);
  });

  it("keeps a failed add's id when the day removal fails", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
    vi.mocked(api)
      .mockRejectedValueOnce(new ApiClientError(0, "network_error", "Could not reach the server."))
      .mockRejectedValueOnce(new ApiClientError(0, "network_error", "Could not reach the server."))
      .mockResolvedValue({ id: firstId });
    const { result } = renderHook(() => useTripDetailHandlers(tripDays));
    await act(async () => {
      result.current.handleAddDay();
    });
    await act(async () => {
      result.current.handleRemoveLastDay(false, vi.fn());
    });
    await act(async () => {
      result.current.handleAddDay();
    });
    const addIds = vi
      .mocked(api)
      .mock.calls.filter(([endpoint]) => (endpoint as { method: string }).method === "POST")
      .map(([, input]) => (input as { body: { id: string } }).body.id);
    expect(addIds).toEqual([firstId, firstId]);
  });

  it("reports addingDay while the request is in flight", async () => {
    const { api } = await import("@/lib/api/client");
    let finish: (value: unknown) => void = () => {};
    vi.mocked(api).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { result } = renderHook(() => useTripDetailHandlers(detail));
    expect(result.current.addingDay).toBe(false);
    act(() => {
      result.current.handleAddDay();
    });
    await waitFor(() => expect(result.current.addingDay).toBe(true));
    await act(async () => {
      finish({ id: firstId });
    });
    await waitFor(() => expect(result.current.addingDay).toBe(false));
  });

  it("removes the highest-numbered day with the trip in the body and no confirmation", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValue(null);
    const onConfirmationRequired = vi.fn();
    const { result } = renderHook(() => useTripDetailHandlers(tripDays));
    await act(async () => {
      result.current.handleRemoveLastDay(false, onConfirmationRequired);
    });
    expect(api).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ method: "DELETE", path: "/api/v1/days/:dayId" }),
      { params: { dayId: "day-3" }, body: { tripId: "trip-1" } }
    );
    expect(onConfirmationRequired).not.toHaveBeenCalled();
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
  });

  it("sends confirmDestructive once the dialog confirmed", async () => {
    const { api } = await import("@/lib/api/client");
    vi.mocked(api).mockResolvedValue(null);
    const { result } = renderHook(() => useTripDetailHandlers(tripDays));
    await act(async () => {
      result.current.handleRemoveLastDay(true, vi.fn());
    });
    expect(api).toHaveBeenCalledWith(expect.anything(), {
      params: { dayId: "day-3" },
      body: { tripId: "trip-1", confirmDestructive: true },
    });
  });

  it("opens the confirmation with no toast and no refresh on confirmation_required", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(
      new ApiClientError(409, "confirmation_required", "This day has planned content. Confirm to remove it.")
    );
    const onConfirmationRequired = vi.fn();
    const { result } = renderHook(() => useTripDetailHandlers(tripDays));
    await act(async () => {
      result.current.handleRemoveLastDay(false, onConfirmationRequired);
    });
    expect(onConfirmationRequired).toHaveBeenCalledExactlyOnceWith(true);
    expect(toast.error).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("toasts any other removal failure and never opens the confirmation", async () => {
    const { api, ApiClientError } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new ApiClientError(409, "conflict", "Only the last day can be removed."));
    const onConfirmationRequired = vi.fn();
    const { result } = renderHook(() => useTripDetailHandlers(tripDays));
    await act(async () => {
      result.current.handleRemoveLastDay(false, onConfirmationRequired);
    });
    expect(toast.error).toHaveBeenCalledWith("Only the last day can be removed.");
    expect(onConfirmationRequired).not.toHaveBeenCalled();
  });

  it("does nothing when the trip has no day to remove", async () => {
    const { api } = await import("@/lib/api/client");
    const { result } = renderHook(() => useTripDetailHandlers({ ...detail, days: [] }));
    await act(async () => {
      result.current.handleRemoveLastDay(false, vi.fn());
    });
    expect(api).not.toHaveBeenCalled();
  });

  it("reports removingDay while the request is in flight", async () => {
    const { api } = await import("@/lib/api/client");
    let finish: (value: unknown) => void = () => {};
    vi.mocked(api).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { result } = renderHook(() => useTripDetailHandlers(tripDays));
    act(() => {
      result.current.handleRemoveLastDay(false, vi.fn());
    });
    await waitFor(() => expect(result.current.removingDay).toBe(true));
    await act(async () => {
      finish(null);
    });
    await waitFor(() => expect(result.current.removingDay).toBe(false));
  });
});

it("sends metadata through the API with the chosen currency conversion", async () => {
  const { api } = await import("@/lib/api/client");
  const { TripCurrencyChangeMode } = await import("@/data/types");
  vi.mocked(api).mockResolvedValueOnce({});
  const { result } = renderHook(() => useTripDetailHandlers(detail));
  await act(async () => {
    await result.current.handleTripSave(
      { name: "New", startDate: null, endDate: null, budgetCurrency: "EUR" },
      TripCurrencyChangeMode.Convert
    );
  });
  expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH", path: "/api/v1/trips/:tripId" }), {
    params: { tripId: detail.trip.id },
    body: { name: "New", budgetCurrency: "EUR", convertCurrency: true },
  });
  expect(mockRefresh).toHaveBeenCalled();
});
