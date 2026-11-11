import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TripNote } from "@/data/types";
import { SortableTripNoteRow, reorderHandleId } from "./trip-notes-sortable-row";

const listenersKeyDown = vi.hoisted(() => vi.fn());
const isDraggingState = vi.hoisted(() => ({ value: false }));

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: vi.fn(() => ({
    attributes: { "aria-roledescription": "sortable" },
    listeners: { onKeyDown: listenersKeyDown },
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: isDraggingState.value,
  })),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: vi.fn(() => undefined) } },
}));

function buildNote(overrides: Partial<TripNote> = {}): TripNote {
  return { id: "note-1", tripId: "trip-1", position: 0, title: "Pack sunscreen", ...overrides };
}

function renderRow(overrides: Partial<React.ComponentProps<typeof SortableTripNoteRow>> = {}) {
  const props = {
    note: buildNote(),
    index: 1,
    total: 4,
    isExpanded: false,
    isDisabled: false,
    isDragInert: false,
    onToggle: vi.fn(),
    onDeleteRequest: vi.fn(),
    onHandleKeyDown: vi.fn(),
    onHandleBlur: vi.fn(),
    ...overrides,
  };
  render(<SortableTripNoteRow {...props} />);
  return props;
}

describe("SortableTripNoteRow", () => {
  it("labels the handle with the note title and its 1-based position", () => {
    renderRow();

    const handle = screen.getByRole("button", { name: "Reorder Pack sunscreen, position 2 of 4" });
    expect(handle).toHaveAttribute("id", reorderHandleId("note-1"));
    expect(handle).toHaveAttribute("title", "Reorder Pack sunscreen, position 2 of 4");
  });

  it("runs dnd-kit's key listener and then forwards the key press with the note", () => {
    const props = renderRow();

    fireEvent.keyDown(screen.getByRole("button", { name: /^Reorder / }), { key: "ArrowUp" });

    expect(listenersKeyDown).toHaveBeenCalledTimes(1);
    expect(props.onHandleKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: "ArrowUp" }), props.note);
  });

  it("forwards blur with the note id", () => {
    const props = renderRow();

    fireEvent.blur(screen.getByRole("button", { name: /^Reorder / }));

    expect(props.onHandleBlur).toHaveBeenCalledWith("note-1");
  });

  it("hides the row in place while it is the dragged item", () => {
    isDraggingState.value = true;
    renderRow();

    expect(screen.getByRole("listitem")).toHaveStyle({ opacity: "0" });
    isDraggingState.value = false;
  });
});
