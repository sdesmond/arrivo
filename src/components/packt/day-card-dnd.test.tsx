import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

interface SortableContextCapture {
  lastItems: string[];
}

interface DndHandlerCapture {
  onDragStart?: (event: { active: { id: string } }) => void;
  onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
}

interface SortableContextProps {
  children: ReactNode;
  items: string[];
}

interface MockPlaceRowProps {
  place: { id: string; name: string; linkedReservationId?: string };
  onLinkedEventTap?: (linkedReservationId: string) => void;
}

interface MockSortablePlaceRowProps {
  place: { id: string; name: string };
}

const sortableContextCapture = vi.hoisted<SortableContextCapture>(() => ({ lastItems: [] }));
const dndHandlerCapture = vi.hoisted<DndHandlerCapture>(() => ({}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragStart,
    onDragEnd,
  }: {
    children: ReactNode;
    onDragStart?: (event: { active: { id: string } }) => void;
    onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
  }) => {
    dndHandlerCapture.onDragStart = onDragStart;
    dndHandlerCapture.onDragEnd = onDragEnd;
    return <>{children}</>;
  },
  DragOverlay: ({ children }: { children: ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children, items }: SortableContextProps) => {
    sortableContextCapture.lastItems = items;
    return <>{children}</>;
  },
  verticalListSortingStrategy: {},
  arrayMove: vi.fn(<ItemType,>(items: ItemType[], from: number, to: number) => {
    const result = [...items];
    const [moved] = result.splice(from, 1);
    result.splice(to, 0, moved);
    return result;
  }),
}));

vi.mock("./place-row", () => ({
  PlaceRow: ({ place, onLinkedEventTap }: MockPlaceRowProps) => (
    <button onClick={() => place.linkedReservationId && onLinkedEventTap?.(place.linkedReservationId)}>
      direct-place-row-{place.id}
    </button>
  ),
}));

vi.mock("./day-card-sortables", () => ({
  SortablePlaceRow: ({ place }: MockSortablePlaceRowProps) => (
    <div data-testid={`sortable-place-row-${place.id}`}>sortable-place-row-{place.id}</div>
  ),
  SortableNoteItem: ({ note }: { note: { id: string } }) => <div data-testid={`sortable-note-${note.id}`} />,
  SortableChecklistItem: ({ checklist }: { checklist: { id: string } }) => (
    <div data-testid={`sortable-checklist-${checklist.id}`} />
  ),
}));

vi.mock("./note-item", () => ({
  NoteItem: ({
    note,
    isDraft,
    onCreate,
    onCancelDraft,
  }: {
    note: { id: string };
    isDraft?: boolean;
    onCreate?: (content: string) => void;
    onCancelDraft?: () => void;
  }) =>
    isDraft ? (
      <div>
        <button onClick={() => onCreate?.("Draft note")}>create-note-draft</button>
        <button onClick={() => onCancelDraft?.()}>cancel-note-draft</button>
      </div>
    ) : (
      <div data-testid={`note-item-${note.id}`} />
    ),
}));

vi.mock("./checklist-item", () => ({
  ChecklistItem: ({
    checklist,
    isDraft,
    onCommitDraft,
    onCancelDraft,
  }: {
    checklist: { id: string };
    isDraft?: boolean;
    onCommitDraft?: (firstItemContent?: string) => void;
    onCancelDraft?: () => void;
  }) =>
    isDraft ? (
      <div>
        <button onClick={() => onCommitDraft?.("Passport")}>commit-checklist-draft</button>
        <button onClick={() => onCancelDraft?.()}>cancel-checklist-draft</button>
      </div>
    ) : (
      <div data-testid={`checklist-item-${checklist.id}`} />
    ),
}));

vi.mock("./gap-zone", () => ({
  GapZone: () => <div data-testid="gap-zone" />,
}));

import { DayCardDnd, type RenderEntry, type TimelineItem } from "./day-card-dnd";

const linkedEventItem: TimelineItem = {
  kind: "event",
  data: {
    id: "linked-event-1",
    name: "Check-in — Torel Avantgarde",
    linkedReservationId: "reservation-1",
    reservationType: "lodging",
    position: 0,
  },
  position: 0,
};

const manualEventItem: TimelineItem = {
  kind: "event",
  data: {
    id: "manual-event-1",
    name: "Museum Visit",
    position: 1,
  },
  position: 1,
};

const noteItem: TimelineItem = {
  kind: "note",
  data: {
    id: "note-1",
    content: "Bring sunscreen",
    position: 2,
  },
  position: 2,
};

const checklistItem: TimelineItem = {
  kind: "checklist",
  data: {
    id: "checklist-1",
    tripDayId: "day-1",
    position: 3,
    items: [],
  },
  position: 3,
};

const timelineItems: TimelineItem[] = [linkedEventItem, manualEventItem, noteItem, checklistItem];
const renderEntries: RenderEntry[] = timelineItems.map((item, idx) => ({
  type: "timeline",
  item,
  idx,
}));

describe("DayCardDnd", () => {
  it("renders linked events as direct PlaceRow entries and not as SortablePlaceRow entries", () => {
    render(
      <DayCardDnd
        dayNumber={1}
        dayDate="2030-06-16"
        timelineItems={timelineItems}
        renderEntries={renderEntries}
        makeGapProps={() => ({
          gapKey: "gap-1",
          isActive: false,
          onOpen: vi.fn(),
          onSelectType: vi.fn(),
          onDismiss: vi.fn(),
        })}
        commitDraft={vi.fn()}
        cancelDraft={vi.fn()}
        setOptimisticOrder={vi.fn()}
        onReorderDayItems={vi.fn()}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onLinkedEventTap={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "direct-place-row-linked-event-1" })).toBeInTheDocument();
    expect(screen.queryByTestId("sortable-place-row-linked-event-1")).not.toBeInTheDocument();
  });

  it("computes a safe insertAtPosition for gaps near a Linked Event row instead of using its sort-only position", () => {
    const makeGapProps = vi.fn((gapKey: string) => ({
      gapKey,
      isActive: false,
      onOpen: vi.fn(),
      onSelectType: vi.fn(),
      onDismiss: vi.fn(),
    }));

    render(
      <DayCardDnd
        dayNumber={1}
        dayDate="2030-06-16"
        timelineItems={timelineItems}
        renderEntries={renderEntries}
        makeGapProps={makeGapProps}
        commitDraft={vi.fn()}
        cancelDraft={vi.fn()}
        setOptimisticOrder={vi.fn()}
        onReorderDayItems={vi.fn()}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onLinkedEventTap={vi.fn()}
      />
    );

    // Gap after the Linked Event (idx 0, position 0): no preceding real item exists, so it falls back to 0
    // instead of using the Linked Event's own position (which would be a huge negative number in production).
    expect(makeGapProps).toHaveBeenCalledWith("ti-0", 0);
    // Gap after the manual event (idx 1, position 1): unaffected, behaves exactly as before the fix.
    expect(makeGapProps).toHaveBeenCalledWith("ti-1", 2);
  });

  it("keeps manual events sortable", () => {
    render(
      <DayCardDnd
        dayNumber={1}
        dayDate="2030-06-16"
        timelineItems={timelineItems}
        renderEntries={renderEntries}
        makeGapProps={() => ({
          gapKey: "gap-1",
          isActive: false,
          onOpen: vi.fn(),
          onSelectType: vi.fn(),
          onDismiss: vi.fn(),
        })}
        commitDraft={vi.fn()}
        cancelDraft={vi.fn()}
        setOptimisticOrder={vi.fn()}
        onReorderDayItems={vi.fn()}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onLinkedEventTap={vi.fn()}
      />
    );

    expect(screen.getByTestId("sortable-place-row-manual-event-1")).toBeInTheDocument();
  });

  it("threads onLinkedEventTap to linked PlaceRow rows", async () => {
    const user = userEvent.setup();
    const onLinkedEventTap = vi.fn();

    render(
      <DayCardDnd
        dayNumber={1}
        dayDate="2030-06-16"
        timelineItems={timelineItems}
        renderEntries={renderEntries}
        makeGapProps={() => ({
          gapKey: "gap-1",
          isActive: false,
          onOpen: vi.fn(),
          onSelectType: vi.fn(),
          onDismiss: vi.fn(),
        })}
        commitDraft={vi.fn()}
        cancelDraft={vi.fn()}
        setOptimisticOrder={vi.fn()}
        onReorderDayItems={vi.fn()}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onLinkedEventTap={onLinkedEventTap}
      />
    );

    await user.click(screen.getByRole("button", { name: "direct-place-row-linked-event-1" }));

    expect(onLinkedEventTap).toHaveBeenCalledWith("reservation-1");
  });

  it("excludes linked event ids from the SortableContext items list", () => {
    render(
      <DayCardDnd
        dayNumber={1}
        dayDate="2030-06-16"
        timelineItems={timelineItems}
        renderEntries={renderEntries}
        makeGapProps={() => ({
          gapKey: "gap-1",
          isActive: false,
          onOpen: vi.fn(),
          onSelectType: vi.fn(),
          onDismiss: vi.fn(),
        })}
        commitDraft={vi.fn()}
        cancelDraft={vi.fn()}
        setOptimisticOrder={vi.fn()}
        onReorderDayItems={vi.fn()}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onLinkedEventTap={vi.fn()}
      />
    );

    expect(sortableContextCapture.lastItems).not.toContain("linked-event-1");
    expect(sortableContextCapture.lastItems).toEqual(["manual-event-1", "note-1", "checklist-1"]);
  });

  it("renders the note drag overlay when a note becomes active", () => {
    render(
      <DayCardDnd
        dayNumber={1}
        dayDate="2030-06-16"
        timelineItems={timelineItems}
        renderEntries={renderEntries}
        makeGapProps={() => ({
          gapKey: "gap-1",
          isActive: false,
          onOpen: vi.fn(),
          onSelectType: vi.fn(),
          onDismiss: vi.fn(),
        })}
        commitDraft={vi.fn()}
        cancelDraft={vi.fn()}
        setOptimisticOrder={vi.fn()}
        onReorderDayItems={vi.fn()}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onLinkedEventTap={vi.fn()}
      />
    );

    act(() => {
      dndHandlerCapture.onDragStart?.({ active: { id: "note-1" } });
    });

    expect(screen.getByTestId("note-item-note-1")).toBeInTheDocument();
  });

  it("renders the event drag overlay when an event becomes active", () => {
    render(
      <DayCardDnd
        dayNumber={1}
        dayDate="2030-06-16"
        timelineItems={timelineItems}
        renderEntries={renderEntries}
        makeGapProps={() => ({
          gapKey: "gap-1",
          isActive: false,
          onOpen: vi.fn(),
          onSelectType: vi.fn(),
          onDismiss: vi.fn(),
        })}
        commitDraft={vi.fn()}
        cancelDraft={vi.fn()}
        setOptimisticOrder={vi.fn()}
        onReorderDayItems={vi.fn()}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onLinkedEventTap={vi.fn()}
      />
    );

    act(() => {
      dndHandlerCapture.onDragStart?.({ active: { id: "manual-event-1" } });
    });

    expect(screen.getByRole("button", { name: "direct-place-row-manual-event-1" })).toBeInTheDocument();
  });

  it("excludes the Linked Event from the reorder payload sent to the server", () => {
    const onReorderDayItems = vi.fn();

    render(
      <DayCardDnd
        dayNumber={1}
        dayDate="2030-06-16"
        timelineItems={timelineItems}
        renderEntries={renderEntries}
        makeGapProps={() => ({
          gapKey: "gap-1",
          isActive: false,
          onOpen: vi.fn(),
          onSelectType: vi.fn(),
          onDismiss: vi.fn(),
        })}
        commitDraft={vi.fn()}
        cancelDraft={vi.fn()}
        setOptimisticOrder={vi.fn()}
        onReorderDayItems={onReorderDayItems}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onLinkedEventTap={vi.fn()}
      />
    );

    // Dragging "manual-event-1" past "note-1" moves it within the full timelineItems array,
    // which still contains the Linked Event at index 0 — that entry must not reach the server,
    // since it has no corresponding DB row and would trip the reorder action's count check.
    act(() => {
      dndHandlerCapture.onDragEnd?.({ active: { id: "manual-event-1" }, over: { id: "note-1" } });
    });

    expect(onReorderDayItems).toHaveBeenCalledWith(1, [
      { type: "note", id: "note-1" },
      { type: "event", id: "manual-event-1" },
      { type: "checklist", id: "checklist-1" },
    ]);
  });

  it("renders the note draft row and commits through the provided callback", async () => {
    const user = userEvent.setup();
    const commitDraft = vi.fn();
    const cancelDraft = vi.fn();

    render(
      <DayCardDnd
        dayNumber={1}
        dayDate="2030-06-16"
        timelineItems={timelineItems}
        renderEntries={[{ type: "draft", draftKind: "note" }]}
        draftInsertAtPosition={7}
        makeGapProps={() => ({
          gapKey: "gap-1",
          isActive: false,
          onOpen: vi.fn(),
          onSelectType: vi.fn(),
          onDismiss: vi.fn(),
        })}
        commitDraft={commitDraft}
        cancelDraft={cancelDraft}
        setOptimisticOrder={vi.fn()}
        onReorderDayItems={vi.fn()}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onLinkedEventTap={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "create-note-draft" }));
    await user.click(screen.getByRole("button", { name: "cancel-note-draft" }));

    expect(commitDraft).toHaveBeenCalledWith("Draft note");
    expect(cancelDraft).toHaveBeenCalledOnce();
  });

  it("renders the checklist draft row and commits through the provided callback", async () => {
    const user = userEvent.setup();
    const onAddChecklist = vi.fn();
    const cancelDraft = vi.fn();

    render(
      <DayCardDnd
        dayNumber={4}
        dayId="day-4"
        dayDate="2030-06-16"
        timelineItems={timelineItems}
        renderEntries={[{ type: "draft", draftKind: "checklist" }]}
        draftInsertAtPosition={9}
        makeGapProps={() => ({
          gapKey: "gap-1",
          isActive: false,
          onOpen: vi.fn(),
          onSelectType: vi.fn(),
          onDismiss: vi.fn(),
        })}
        commitDraft={vi.fn()}
        cancelDraft={cancelDraft}
        setOptimisticOrder={vi.fn()}
        onReorderDayItems={vi.fn()}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onLinkedEventTap={vi.fn()}
        onAddChecklist={onAddChecklist}
      />
    );

    await user.click(screen.getByRole("button", { name: "commit-checklist-draft" }));
    await user.click(screen.getByRole("button", { name: "cancel-checklist-draft" }));

    expect(onAddChecklist).toHaveBeenCalledWith(4, 9, "Passport");
    expect(cancelDraft).toHaveBeenCalledTimes(2);
  });
});
