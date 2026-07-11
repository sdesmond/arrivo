import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { ItineraryItemType, type DayItinerary } from "@/data/types";
import { DayCardBody } from "./day-card-body";

interface MockDayCardDndProps {
  timelineItems: { data: { id: string } }[];
  renderEntries: { type: string }[];
  commitDraft: (content: string) => Promise<void>;
  onLinkedEventTap?: (linkedReservationId: string) => void;
  highlightedEventId?: string | null;
}

interface MockDayCardBottomAddProps {
  dayNumber: number;
  bottomInsertPosition: number;
  onOpenPackingListPicker?: (insertAtPosition: number) => void;
  activateDraft: (type: ItineraryItemType, insertAtPosition: number, gapKey: string) => void;
}

vi.mock("./day-card-dnd", () => ({
  DayCardDnd: ({
    timelineItems,
    renderEntries,
    commitDraft,
    onLinkedEventTap,
    highlightedEventId,
  }: MockDayCardDndProps) => (
    <div data-highlighted-event-id={highlightedEventId ?? ""}>
      {timelineItems.map((item) => (
        <span key={item.data.id}>{item.data.id}</span>
      ))}
      <span data-testid="has-draft">
        {renderEntries.some((entry) => entry.type === "draft") ? "draft-present" : "draft-absent"}
      </span>
      <button onClick={() => commitDraft("typed content")}>Commit draft</button>
      {onLinkedEventTap && <button onClick={() => onLinkedEventTap("linked-reservation-1")}>Trigger linked tap</button>}
    </div>
  ),
}));

vi.mock("./day-card-bottom-add", () => ({
  DayCardBottomAdd: ({
    dayNumber,
    bottomInsertPosition,
    onOpenPackingListPicker,
    activateDraft,
  }: MockDayCardBottomAddProps) => (
    <div>
      <button>Add a place to day {dayNumber}</button>
      <span>bottom-insert-{bottomInsertPosition}</span>
      {onOpenPackingListPicker && (
        <button onClick={() => onOpenPackingListPicker(bottomInsertPosition)}>Open packing picker</button>
      )}
      <button onClick={() => activateDraft(ItineraryItemType.Note, bottomInsertPosition, "bottom")}>
        Activate note draft
      </button>
      <button onClick={() => activateDraft(ItineraryItemType.Checklist, bottomInsertPosition, "bottom")}>
        Activate checklist draft
      </button>
    </div>
  ),
}));

const day: DayItinerary = {
  id: "day-1",
  dayNumber: 1,
  date: "2026-06-01",
  label: "Day 1",
  events: [{ id: "event-1", name: "Museum", position: 0 }],
  notes: [{ id: "note-1", content: "Tickets", position: 1 }],
  checklists: [{ id: "checklist-1", tripDayId: "day-1", position: 2, items: [] }],
};

const linkedOnlyDay: DayItinerary = {
  id: "day-2",
  dayNumber: 2,
  date: "2026-06-02",
  label: "Day 2",
  events: [
    {
      id: "linked-event-1",
      name: "Check-in — Torel Avantgarde",
      linkedReservationId: "reservation-1",
      reservationType: "lodging",
      position: -8_222_262_399_999,
    },
  ],
};

describe("DayCardBody", () => {
  it("passes the mixed itinerary timeline to the extracted renderer", () => {
    render(<DayCardBody day={day} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />);

    expect(screen.getByText("event-1")).toBeInTheDocument();
    expect(screen.getByText("note-1")).toBeInTheDocument();
    expect(screen.getByText("checklist-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a place to day 1" })).toBeInTheDocument();
  });

  it("forwards highlightedEventId to the extracted renderer", () => {
    render(
      <DayCardBody
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        highlightedEventId="event-1"
      />
    );

    expect(screen.getByText("event-1").closest("[data-highlighted-event-id]")).toHaveAttribute(
      "data-highlighted-event-id",
      "event-1"
    );
  });

  it("Backpack button click calls onOpenPackingListPicker with correct position", async () => {
    const onOpenPackingListPicker = vi.fn();
    render(
      <DayCardBody
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onOpenPackingListPicker={onOpenPackingListPicker}
      />
    );

    screen.getByRole("button", { name: "Open packing picker" }).click();
    expect(onOpenPackingListPicker).toHaveBeenCalledWith(3);
  });

  it("uses position 0 for bottom inserts when the day only contains linked events", () => {
    const onOpenPackingListPicker = vi.fn();

    render(
      <DayCardBody
        day={linkedOnlyDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onOpenPackingListPicker={onOpenPackingListPicker}
      />
    );

    expect(screen.getByText("bottom-insert-0")).toBeInTheDocument();

    screen.getByRole("button", { name: "Open packing picker" }).click();
    expect(onOpenPackingListPicker).toHaveBeenCalledWith(0);
  });

  it("threads onLinkedEventTap to DayCardDnd when provided", () => {
    const onLinkedEventTap = vi.fn();

    render(
      <DayCardBody
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onLinkedEventTap={onLinkedEventTap}
      />
    );

    screen.getByRole("button", { name: "Trigger linked tap" }).click();
    expect(onLinkedEventTap).toHaveBeenCalledWith("linked-reservation-1");
  });

  it("keeps the draft row visible until the real item lands in props, even after the add resolves", async () => {
    let resolveAdd: (() => void) | undefined;
    const onAddNote = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAdd = resolve;
        })
    );

    const { rerender } = render(
      <DayCardBody
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onAddNote={onAddNote}
      />
    );

    act(() => {
      screen.getByRole("button", { name: "Activate note draft" }).click();
    });
    expect(screen.getByTestId("has-draft")).toHaveTextContent("draft-present");

    act(() => {
      screen.getByRole("button", { name: "Commit draft" }).click();
    });

    expect(onAddNote).toHaveBeenCalledWith(1, "typed content", 3);
    expect(screen.getByTestId("has-draft")).toHaveTextContent("draft-present");

    // The action's promise resolves, but the revalidated `day` prop hasn't landed yet —
    // the draft must stay put rather than clearing on the promise alone.
    await act(async () => {
      resolveAdd?.();
    });
    expect(screen.getByTestId("has-draft")).toHaveTextContent("draft-present");

    // Once the real item actually shows up in props, the draft clears.
    rerender(
      <DayCardBody
        day={{ ...day, notes: [...day.notes!, { id: "note-2", content: "typed content", position: 3 }] }}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onAddNote={onAddNote}
      />
    );

    expect(screen.getByTestId("has-draft")).toHaveTextContent("draft-absent");
  });

  it("keeps the draft row open when the add fails, so the user can retry", async () => {
    const onAddNote = vi.fn().mockRejectedValueOnce(new Error("Add failed"));

    render(
      <DayCardBody
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onAddNote={onAddNote}
      />
    );

    act(() => {
      screen.getByRole("button", { name: "Activate note draft" }).click();
    });
    act(() => {
      screen.getByRole("button", { name: "Commit draft" }).click();
    });

    await waitFor(() => expect(onAddNote).toHaveBeenCalled());
    expect(screen.getByTestId("has-draft")).toHaveTextContent("draft-present");
  });

  it("routes checklist draft commits through onAddChecklist and keeps the draft until the real checklist lands in props", async () => {
    let resolveAdd: (() => void) | undefined;
    const onAddChecklist = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAdd = resolve;
        })
    );

    const { rerender } = render(
      <DayCardBody
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onAddChecklist={onAddChecklist}
      />
    );

    act(() => {
      screen.getByRole("button", { name: "Activate checklist draft" }).click();
    });
    act(() => {
      screen.getByRole("button", { name: "Commit draft" }).click();
    });

    expect(onAddChecklist).toHaveBeenCalledWith(1, 3, "typed content");
    expect(screen.getByTestId("has-draft")).toHaveTextContent("draft-present");

    await act(async () => {
      resolveAdd?.();
    });
    expect(screen.getByTestId("has-draft")).toHaveTextContent("draft-present");

    rerender(
      <DayCardBody
        day={{
          ...day,
          checklists: [...day.checklists!, { id: "checklist-2", tripDayId: "day-1", position: 3, items: [] }],
        }}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onAddChecklist={onAddChecklist}
      />
    );

    expect(screen.getByTestId("has-draft")).toHaveTextContent("draft-absent");
  });

  it("keeps the checklist draft row open when onAddChecklist rejects", async () => {
    const onAddChecklist = vi.fn().mockRejectedValueOnce(new Error("Add checklist failed"));

    render(
      <DayCardBody
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onAddChecklist={onAddChecklist}
      />
    );

    act(() => {
      screen.getByRole("button", { name: "Activate checklist draft" }).click();
    });
    act(() => {
      screen.getByRole("button", { name: "Commit draft" }).click();
    });

    await waitFor(() => expect(onAddChecklist).toHaveBeenCalled());
    expect(screen.getByTestId("has-draft")).toHaveTextContent("draft-present");
  });
});
