import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const isDraggingById = vi.hoisted(() => ({}) as Record<string, boolean>);
const sortableCalls = vi.hoisted(
  () => [] as { id: string; animateLayoutChanges?: () => boolean; disabled?: boolean }[]
);

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: vi.fn((opts: { id: string; animateLayoutChanges?: () => boolean; disabled?: boolean }) => {
    sortableCalls.push(opts);
    return {
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: isDraggingById[opts.id] ?? false,
    };
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: vi.fn(() => undefined) } },
}));

vi.mock("./place-row", () => ({
  PlaceRow: ({ place, dragHandle }: { place: { id: string }; dragHandle?: React.ReactNode }) => (
    <div data-testid={`place-row-${place.id}`}>{dragHandle}</div>
  ),
}));

vi.mock("./note-item", () => ({
  NoteItem: ({ note, dragHandle }: { note: { id: string }; dragHandle?: React.ReactNode }) => (
    <div data-testid={`note-item-${note.id}`}>{dragHandle}</div>
  ),
}));

vi.mock("./checklist-item", () => ({
  ChecklistItem: ({ checklist, dragHandle }: { checklist: { id: string }; dragHandle?: React.ReactNode }) => (
    <div data-testid={`checklist-item-${checklist.id}`}>{dragHandle}</div>
  ),
}));

import { SortablePlaceRow, SortableNoteItem, SortableChecklistItem, DragGripPreview } from "./day-card-sortables";
import { TripEditAccessProvider } from "./trip-edit-access";
import { IconSize } from "@/lib/size-tokens";

beforeEach(() => {
  for (const key of Object.keys(isDraggingById)) delete isDraggingById[key];
  sortableCalls.length = 0;
});

describe("day-card-sortables", () => {
  it("passes animateLayoutChanges that always returns false to useSortable", () => {
    render(<SortablePlaceRow place={{ id: "ev-x", name: "X", position: 0 }} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    render(<SortableNoteItem note={{ id: "n-x", content: "", position: 0 }} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    render(<SortableChecklistItem checklist={{ id: "cl-x", tripDayId: "d", position: 0, items: [] }} />);
    expect(sortableCalls).toHaveLength(3);
    for (const call of sortableCalls) {
      expect(typeof call.animateLayoutChanges).toBe("function");
      expect(call.animateLayoutChanges?.()).toBe(false);
    }
  });

  describe("SortablePlaceRow", () => {
    it("renders the wrapping div at opacity 0 when isDragging is true", () => {
      isDraggingById["ev-1"] = true;
      const { container } = render(
        <SortablePlaceRow place={{ id: "ev-1", name: "Museum", position: 0 }} onUpdate={vi.fn()} onDelete={vi.fn()} />
      );
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.style.opacity).toBe("0");
    });

    it("renders the wrapping div at opacity 1 when isDragging is false", () => {
      const { container } = render(
        <SortablePlaceRow place={{ id: "ev-2", name: "Park", position: 0 }} onUpdate={vi.fn()} onDelete={vi.fn()} />
      );
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.style.opacity).toBe("1");
    });

    it("renders the wrapped PlaceRow", () => {
      const { getByTestId } = render(
        <SortablePlaceRow place={{ id: "ev-3", name: "Cafe", position: 0 }} onUpdate={vi.fn()} onDelete={vi.fn()} />
      );
      expect(getByTestId("place-row-ev-3")).toBeInTheDocument();
    });
  });

  describe("SortableNoteItem", () => {
    it("renders the wrapping div at opacity 0 when isDragging is true", () => {
      isDraggingById["n-1"] = true;
      const { container } = render(
        <SortableNoteItem note={{ id: "n-1", content: "Hi", position: 0 }} onUpdate={vi.fn()} onDelete={vi.fn()} />
      );
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.style.opacity).toBe("0");
    });

    it("renders the wrapped NoteItem", () => {
      const { getByTestId } = render(
        <SortableNoteItem note={{ id: "n-2", content: "Bye", position: 1 }} onUpdate={vi.fn()} onDelete={vi.fn()} />
      );
      expect(getByTestId("note-item-n-2")).toBeInTheDocument();
    });
  });

  describe("SortableChecklistItem", () => {
    it("renders the wrapping div at opacity 0 when isDragging is true", () => {
      isDraggingById["cl-1"] = true;
      const { container } = render(
        <SortableChecklistItem checklist={{ id: "cl-1", tripDayId: "d-1", position: 0, items: [] }} />
      );
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.style.opacity).toBe("0");
    });

    it("renders the wrapped ChecklistItem", () => {
      const { getByTestId } = render(
        <SortableChecklistItem checklist={{ id: "cl-2", tripDayId: "d-1", position: 1, items: [] }} />
      );
      expect(getByTestId("checklist-item-cl-2")).toBeInTheDocument();
    });
  });
});

describe("day-card-sortables drag handle names", () => {
  it("names each drag handle after its row", () => {
    const { getByLabelText } = render(
      <>
        <SortablePlaceRow place={{ id: "ev-n", name: "Museum", position: 0 }} onUpdate={vi.fn()} onDelete={vi.fn()} />
        <SortableNoteItem note={{ id: "n-n", content: "Pack bags\nand passports", position: 1 }} />
        <SortableChecklistItem checklist={{ id: "cl-n", tripDayId: "d", position: 2, title: "Beach", items: [] }} />
      </>
    );

    for (const name of ["Reorder Museum", "Reorder Pack bags", "Reorder Beach"]) {
      expect(getByLabelText(name)).toHaveAttribute("title", "Drag to reorder");
    }
  });

  it("shortens a long note and names untitled rows by their kind", () => {
    const { getByLabelText } = render(
      <>
        <SortablePlaceRow place={{ id: "ev-u", name: "", position: 0 }} onUpdate={vi.fn()} onDelete={vi.fn()} />
        <SortableNoteItem note={{ id: "n-l", content: "a".repeat(60), position: 1 }} />
        <SortableChecklistItem checklist={{ id: "cl-u", tripDayId: "d", position: 2, items: [] }} />
      </>
    );

    expect(getByLabelText("Reorder event")).toBeInTheDocument();
    expect(getByLabelText(`Reorder ${"a".repeat(40)}…`)).toBeInTheDocument();
    expect(getByLabelText("Reorder checklist")).toBeInTheDocument();
  });

  it("draws an inert, hidden grip the size of a real one for the drag preview", () => {
    const { container } = render(<DragGripPreview />);
    const grip = container.firstElementChild as HTMLElement;

    expect(grip).toHaveAttribute("aria-hidden", "true");
    expect(grip).toHaveClass("size-11", "items-center", "justify-center");
    expect(grip).not.toHaveAttribute("title");
    expect(grip.querySelector("svg")).toHaveAttribute("width", String(IconSize.rowAction));
  });
});

describe("day-card-sortables for a viewer", () => {
  function renderAsViewer(ui: React.ReactElement) {
    return render(<TripEditAccessProvider canEdit={false}>{ui}</TripEditAccessProvider>);
  }

  it("disables sorting and passes no drag handle to any item", () => {
    const place = renderAsViewer(
      <SortablePlaceRow place={{ id: "ev-v", name: "X", position: 0 }} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    const note = renderAsViewer(
      <SortableNoteItem note={{ id: "n-v", content: "", position: 0 }} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    const checklist = renderAsViewer(
      <SortableChecklistItem checklist={{ id: "cl-v", tripDayId: "d", position: 0, items: [] }} />
    );

    expect(sortableCalls.map((call) => call.disabled)).toEqual([true, true, true]);
    expect(place.getByTestId("place-row-ev-v")).toBeEmptyDOMElement();
    expect(note.getByTestId("note-item-n-v")).toBeEmptyDOMElement();
    expect(checklist.getByTestId("checklist-item-cl-v")).toBeEmptyDOMElement();
  });

  it("keeps sorting enabled with a drag handle for an editor", () => {
    const { getByTestId } = render(
      <SortablePlaceRow place={{ id: "ev-e", name: "X", position: 0 }} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(sortableCalls[0].disabled).toBe(false);
    expect(getByTestId("place-row-ev-e")).not.toBeEmptyDOMElement();
  });

  it("gives the drag handle a centred 44px target with a row-action-sized grip", () => {
    const { getByTitle } = render(
      <SortablePlaceRow place={{ id: "ev-h", name: "X", position: 0 }} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    const handle = getByTitle("Drag to reorder");
    expect(handle).toHaveClass("size-11", "items-center", "justify-center");
    expect(handle.querySelector("svg")).toHaveAttribute("width", String(IconSize.rowAction));
  });
});
