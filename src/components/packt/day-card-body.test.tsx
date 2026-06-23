import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DayItinerary } from "@/data/types";
import { DayCardBody } from "./day-card-body";

interface MockDayCardDndProps {
  timelineItems: { data: { id: string } }[];
  onLinkedEventTap?: (linkedReservationId: string) => void;
  highlightedEventId?: string | null;
}

interface MockDayCardBottomAddProps {
  dayNumber: number;
  bottomInsertPosition: number;
  onOpenPackingListPicker?: (insertAtPosition: number) => void;
}

vi.mock("./day-card-dnd", () => ({
  DayCardDnd: ({ timelineItems, onLinkedEventTap, highlightedEventId }: MockDayCardDndProps) => (
    <div data-highlighted-event-id={highlightedEventId ?? ""}>
      {timelineItems.map((item) => (
        <span key={item.data.id}>{item.data.id}</span>
      ))}
      {onLinkedEventTap && <button onClick={() => onLinkedEventTap("linked-reservation-1")}>Trigger linked tap</button>}
    </div>
  ),
}));

vi.mock("./day-card-bottom-add", () => ({
  DayCardBottomAdd: ({ dayNumber, bottomInsertPosition, onOpenPackingListPicker }: MockDayCardBottomAddProps) => (
    <div>
      <button>Add a place to day {dayNumber}</button>
      <span>bottom-insert-{bottomInsertPosition}</span>
      {onOpenPackingListPicker && (
        <button onClick={() => onOpenPackingListPicker(bottomInsertPosition)}>Open packing picker</button>
      )}
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
});
