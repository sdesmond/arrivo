import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DayItinerary } from "@/data/types";
import { DayCardBody } from "./day-card-body";

interface MockDayCardDndProps {
  timelineItems: { data: { id: string } }[];
  onLinkedEventTap?: (linkedReservationId: string) => void;
}

interface MockDayCardBottomAddProps {
  dayNumber: number;
  onOpenPackingListPicker?: (insertAtPosition: number) => void;
}

vi.mock("./day-card-dnd", () => ({
  DayCardDnd: ({ timelineItems, onLinkedEventTap }: MockDayCardDndProps) => (
    <div>
      {timelineItems.map((item) => (
        <span key={item.data.id}>{item.data.id}</span>
      ))}
      {onLinkedEventTap && <button onClick={() => onLinkedEventTap("linked-reservation-1")}>Trigger linked tap</button>}
    </div>
  ),
}));

vi.mock("./day-card-bottom-add", () => ({
  DayCardBottomAdd: ({ dayNumber, onOpenPackingListPicker }: MockDayCardBottomAddProps) => (
    <div>
      <button>Add a place to day {dayNumber}</button>
      {onOpenPackingListPicker && <button onClick={() => onOpenPackingListPicker(0)}>Open packing picker</button>}
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

describe("DayCardBody", () => {
  it("passes the mixed itinerary timeline to the extracted renderer", () => {
    render(<DayCardBody day={day} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />);

    expect(screen.getByText("event-1")).toBeInTheDocument();
    expect(screen.getByText("note-1")).toBeInTheDocument();
    expect(screen.getByText("checklist-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a place to day 1" })).toBeInTheDocument();
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
