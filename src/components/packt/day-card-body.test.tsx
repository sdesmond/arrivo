// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DayItinerary } from "@/data/types";
import { DayCardBody } from "./day-card-body";

interface MockDayCardDndProps {
  timelineItems: { data: { id: string } }[];
}

interface MockDayCardBottomAddProps {
  dayNumber: number;
}

vi.mock("./day-card-dnd", () => ({
  DayCardDnd: ({ timelineItems }: MockDayCardDndProps) => (
    <div>
      {timelineItems.map((item) => (
        <span key={item.data.id}>{item.data.id}</span>
      ))}
    </div>
  ),
  DayCardBottomAdd: ({ dayNumber }: MockDayCardBottomAddProps) => <button>Add a place to day {dayNumber}</button>,
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
});
