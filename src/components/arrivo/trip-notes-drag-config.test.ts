import { describe, expect, it, vi } from "vitest";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { TripNote } from "@/data/types";
import {
  sameNoteOrder,
  screenReaderInstructions,
  silentAnnouncements,
  verticalOnlyKeyboardCoordinates,
} from "./trip-notes-drag-config";

vi.mock("@dnd-kit/sortable", () => ({
  sortableKeyboardCoordinates: vi.fn(() => ({ x: 0, y: 100 })),
}));

function buildNote(id: string): TripNote {
  return { id, tripId: "trip-1", position: 0 };
}

describe("sameNoteOrder", () => {
  it("is true for the same ids in the same order", () => {
    expect(sameNoteOrder([buildNote("a"), buildNote("b")], [buildNote("a"), buildNote("b")])).toBe(true);
  });

  it("is false for a different order or a different length", () => {
    expect(sameNoteOrder([buildNote("a"), buildNote("b")], [buildNote("b"), buildNote("a")])).toBe(false);
    expect(sameNoteOrder([buildNote("a")], [buildNote("a"), buildNote("b")])).toBe(false);
  });
});

describe("verticalOnlyKeyboardCoordinates", () => {
  const args = { context: {} } as never;

  it("ignores horizontal arrow keys", () => {
    expect(verticalOnlyKeyboardCoordinates(new KeyboardEvent("keydown", { code: "ArrowLeft" }), args)).toBeUndefined();
    expect(verticalOnlyKeyboardCoordinates(new KeyboardEvent("keydown", { code: "ArrowRight" }), args)).toBeUndefined();
    expect(sortableKeyboardCoordinates).not.toHaveBeenCalled();
  });

  it("delegates vertical keys to sortableKeyboardCoordinates", () => {
    const result = verticalOnlyKeyboardCoordinates(new KeyboardEvent("keydown", { code: "ArrowDown" }), args);

    expect(sortableKeyboardCoordinates).toHaveBeenCalled();
    expect(result).toEqual({ x: 0, y: 100 });
  });
});

describe("drag accessibility config", () => {
  it("silences dnd-kit's own announcements", () => {
    expect(silentAnnouncements.onDragStart?.({ active: { id: "a" } } as never)).toBe("");
    expect(silentAnnouncements.onDragOver?.({ active: { id: "a" }, over: null } as never)).toBe("");
    expect(silentAnnouncements.onDragEnd?.({ active: { id: "a" }, over: null } as never)).toBe("");
    expect(silentAnnouncements.onDragCancel?.({ active: { id: "a" }, over: null } as never)).toBe("");
  });

  it("explains how to lift, move, drop and cancel", () => {
    expect(screenReaderInstructions.draggable).toContain("escape to cancel");
  });
});
