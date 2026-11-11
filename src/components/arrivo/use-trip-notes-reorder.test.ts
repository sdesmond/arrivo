import { act, renderHook, waitFor } from "@testing-library/react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TripNote } from "@/data/types";
import { api, ApiClientError } from "@/lib/api/client";
import { reorderTripNotes } from "@/lib/api/contract/trip-notes";
import { useTripNotesReorder } from "./use-trip-notes-reorder";

const { mockRefresh, mockToastError } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: mockToastError },
  Toaster: () => null,
}));

const mockApi = vi.mocked(api);

function expectReordered(noteIds: string[]) {
  expect(mockApi).toHaveBeenCalledWith(reorderTripNotes, { params: { tripId: "trip-1" }, body: { noteIds } });
}

function buildNote(id: string, title: string): TripNote {
  return { id, tripId: "trip-1", position: 0, title };
}

const NOTES = [
  buildNote("note-1", "First note"),
  buildNote("note-2", "Second note"),
  buildNote("note-3", "Third note"),
];

function renderReorder() {
  const onAnnounce = vi.fn();
  const view = renderHook(() => useTripNotesReorder({ tripId: "trip-1", notes: NOTES, onAnnounce }));
  return { ...view, onAnnounce };
}

function startDrag(result: ReturnType<typeof renderReorder>["result"], id: string, keyboard: boolean) {
  act(() => {
    result.current.handleDragStart({
      active: { id },
      activatorEvent: keyboard ? new KeyboardEvent("keydown", { code: "Space" }) : new MouseEvent("mousedown"),
    } as never);
  });
}

function dragOver(result: ReturnType<typeof renderReorder>["result"], activeId: string, overId: string) {
  act(() => {
    result.current.handleDragOver({ active: { id: activeId }, over: { id: overId } } as never);
  });
}

// Awaiting the drop inside `act` would deadlock: the keyed save waits for a page refresh React can only commit
// after `act` returns. Start the drop in `act`, then poll outside it.
async function dropOn(result: ReturnType<typeof renderReorder>["result"], activeId: string) {
  let settled = false;
  act(() => {
    void result.current.handleDragEnd({ active: { id: activeId } } as never).then(() => {
      settled = true;
    });
  });
  await waitFor(() => expect(settled).toBe(true));
}

describe("useTripNotesReorder", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue(undefined as never);
    mockToastError.mockReset();
    mockRefresh.mockReset();
  });

  it("persists the new order after a pointer drag and announces only the outcome", async () => {
    const { result, onAnnounce } = renderReorder();

    startDrag(result, "note-1", false);
    dragOver(result, "note-1", "note-2");
    expect(result.current.workingNotes.map((note) => note.id)).toEqual(["note-2", "note-1", "note-3"]);
    expect(result.current.isDragInert).toBe(true);
    await dropOn(result, "note-1");

    expectReordered(["note-2", "note-1", "note-3"]);
    expect(onAnnounce).toHaveBeenCalledTimes(1);
    expect(onAnnounce).toHaveBeenCalledWith("Reordered. First note now at position 2 of 3");
  });

  it("persists the new order after a keyboard drag and announces each step", async () => {
    const { result, onAnnounce } = renderReorder();

    startDrag(result, "note-3", true);
    expect(result.current.isDragInert).toBe(false);
    dragOver(result, "note-3", "note-2");
    await dropOn(result, "note-3");

    expect(onAnnounce).toHaveBeenCalledWith(expect.stringContaining("Reordering Third note."));
    expect(onAnnounce).toHaveBeenCalledWith("Third note, position 2 of 3");
    expectReordered(["note-1", "note-3", "note-2"]);
  });

  it("calls nothing when the drop leaves the order unchanged", async () => {
    const { result } = renderReorder();

    startDrag(result, "note-1", false);
    await dropOn(result, "note-1");

    expect(mockApi).not.toHaveBeenCalled();
    expect(result.current.workingNotes).toBe(NOTES);
  });

  it("ignores a drag over itself or an unknown item", () => {
    const { result } = renderReorder();

    startDrag(result, "note-1", false);
    dragOver(result, "note-1", "note-1");
    dragOver(result, "note-1", "missing");
    act(() => {
      result.current.handleDragOver({ active: { id: "note-1" }, over: null } as never);
    });

    expect(result.current.workingNotes).toBe(NOTES);
  });

  it("restores the persisted order, toasts and announces the restored position when the save fails", async () => {
    mockApi.mockRejectedValue(new ApiClientError(500, "server_error", "The server could not reorder the notes."));
    const { result, onAnnounce } = renderReorder();

    startDrag(result, "note-1", false);
    dragOver(result, "note-1", "note-2");
    await dropOn(result, "note-1");

    expect(result.current.workingNotes).toBe(NOTES);
    expect(mockToastError).toHaveBeenCalledWith("The server could not reorder the notes.");
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(onAnnounce).toHaveBeenCalledWith(
      "Couldn't reorder notes. Try again. First note restored to position 1 of 3"
    );
    expect(result.current.isPersisting).toBe(false);
  });

  it("restores the order and refreshes the page when the server reports a stale list", async () => {
    mockApi.mockRejectedValue(new ApiClientError(409, "conflict", "The notes changed since they were loaded."));
    const { result, onAnnounce } = renderReorder();

    startDrag(result, "note-1", false);
    dragOver(result, "note-1", "note-2");
    await dropOn(result, "note-1");

    expect(result.current.workingNotes).toBe(NOTES);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(onAnnounce).toHaveBeenCalledWith(
      "Couldn't reorder notes. Try again. First note restored to position 1 of 3"
    );
  });

  it("sends each of two rapid reorders in order, the second built from the refreshed notes", async () => {
    const onAnnounce = vi.fn();
    const { result, rerender } = renderHook(
      ({ notes }: { notes: TripNote[] }) => useTripNotesReorder({ tripId: "trip-1", notes, onAnnounce }),
      { initialProps: { notes: NOTES } }
    );

    startDrag(result, "note-1", false);
    dragOver(result, "note-1", "note-2");
    await dropOn(result, "note-1");
    const afterFirst = [NOTES[1], NOTES[0], NOTES[2]];
    rerender({ notes: afterFirst });

    startDrag(result, "note-3", false);
    dragOver(result, "note-3", "note-2");
    await dropOn(result, "note-3");

    expect(mockApi.mock.calls.map(([, input]) => (input as { body: { noteIds: string[] } }).body.noteIds)).toEqual([
      ["note-2", "note-1", "note-3"],
      ["note-3", "note-2", "note-1"],
    ]);
  });

  it("resets the working order on cancel and announces a keyboard cancel", () => {
    const { result, onAnnounce } = renderReorder();

    startDrag(result, "note-1", true);
    dragOver(result, "note-1", "note-2");
    act(() => {
      result.current.handleDragCancel({ active: { id: "note-1" } } as never);
    });

    expect(result.current.workingNotes).toBe(NOTES);
    expect(result.current.activeNote).toBeUndefined();
    expect(onAnnounce).toHaveBeenCalledWith("Reorder cancelled. First note restored to position 1 of 3");
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("announces boundary attempts only for a keyboard drag, ignoring repeats and other keys", () => {
    const { result, onAnnounce } = renderReorder();
    const note = NOTES[0];

    startDrag(result, "note-1", true);
    onAnnounce.mockClear();
    act(() => {
      result.current.handleHandleKeyDown({ key: "ArrowUp", repeat: true } as ReactKeyboardEvent, note);
      result.current.handleHandleKeyDown({ key: "a", repeat: false } as ReactKeyboardEvent, note);
    });
    expect(onAnnounce).not.toHaveBeenCalled();

    act(() => {
      result.current.handleHandleKeyDown({ key: "ArrowUp", repeat: false } as ReactKeyboardEvent, note);
    });
    expect(onAnnounce).toHaveBeenCalledWith("First note is already at position 1 of 3");
  });

  it("dispatches Escape when the dragged handle blurs during a keyboard drag", () => {
    const dispatchSpy = vi.spyOn(document, "dispatchEvent");
    const { result } = renderReorder();

    act(() => {
      result.current.handleHandleBlur("note-1");
    });
    expect(dispatchSpy).not.toHaveBeenCalled();

    startDrag(result, "note-1", true);
    act(() => {
      result.current.handleHandleBlur("note-2");
    });
    expect(dispatchSpy).not.toHaveBeenCalled();

    act(() => {
      result.current.handleHandleBlur("note-1");
    });
    expect(dispatchSpy.mock.calls.some(([event]) => (event as KeyboardEvent).key === "Escape")).toBe(true);
    dispatchSpy.mockRestore();
  });

  it("drops the optimistic order when a refreshed notes prop arrives after a settled drag", async () => {
    const onAnnounce = vi.fn();
    const { result, rerender } = renderHook(
      ({ notes }: { notes: TripNote[] }) => useTripNotesReorder({ tripId: "trip-1", notes, onAnnounce }),
      { initialProps: { notes: NOTES } }
    );

    startDrag(result, "note-1", false);
    dragOver(result, "note-1", "note-2");
    await dropOn(result, "note-1");
    const refreshed = [buildNote("note-4", "Brand new"), ...NOTES];
    rerender({ notes: refreshed });

    expect(result.current.workingNotes).toBe(refreshed);
  });
});
