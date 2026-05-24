// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DayItinerary } from "@/data/types";
import { TripItineraryView, type TripItineraryViewProps } from "./trip-itinerary-view";

interface MockDayCardProps {
  day: DayItinerary;
  onRemove?: () => void;
}

vi.mock("@/components/packt/day-card", () => ({
  DayCard: ({ day, onRemove }: MockDayCardProps) => (
    <section>
      <span>{day.label}</span>
      {onRemove && <button onClick={onRemove}>Remove {day.label}</button>}
    </section>
  ),
}));

const dayOne: DayItinerary = {
  id: "day-1",
  dayNumber: 1,
  date: "2026-06-01",
  label: "Day 1",
  events: [],
};

const dayTwo: DayItinerary = {
  id: "day-2",
  dayNumber: 2,
  date: "2026-06-02",
  label: "Day 2",
  events: [],
};

function buildProps(days: DayItinerary[]): TripItineraryViewProps {
  return {
    days,
    onUpdateEvent: vi.fn(),
    onDeleteEvent: vi.fn(),
    onReorderDayItems: vi.fn(),
    onUpdateDay: vi.fn(),
    onAddEvent: vi.fn(),
    onAddNote: vi.fn(),
    onUpdateNote: vi.fn(),
    onDeleteNote: vi.fn(),
    onAddChecklist: vi.fn(),
    onUpdateChecklistTitle: vi.fn(),
    onDeleteChecklist: vi.fn(),
    onAddChecklistItem: vi.fn(),
    onUpdateChecklistItem: vi.fn(),
    onDeleteChecklistItem: vi.fn(),
    onToggleChecklistItem: vi.fn(),
    onAddDay: vi.fn(),
    onRemoveLastDay: vi.fn(),
    addingDay: false,
    removingDay: false,
  };
}

describe("TripItineraryView", () => {
  it("shows Add Day below scheduled days and delegates the action", async () => {
    const user = userEvent.setup();
    const props = buildProps([dayOne]);
    render(<TripItineraryView {...props} />);

    await user.click(screen.getByRole("button", { name: "Add Day" }));
    expect(props.onAddDay).toHaveBeenCalledOnce();
  });

  it("disables Add Day while a structural mutation is pending", () => {
    const props = buildProps([dayOne]);
    props.addingDay = true;
    render(<TripItineraryView {...props} />);

    expect(screen.getByRole("button", { name: "Adding Day..." })).toBeDisabled();
  });

  it("passes removal only to the last day and deletes an empty final day without dialog", async () => {
    const user = userEvent.setup();
    const props = buildProps([dayOne, dayTwo]);
    render(<TripItineraryView {...props} />);

    expect(screen.queryByRole("button", { name: "Remove Day 1" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Day 2" }));
    expect(props.onRemoveLastDay).toHaveBeenCalledWith(false, expect.any(Function));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("requires confirmation before removing the only day", async () => {
    const user = userEvent.setup();
    const props = buildProps([dayOne]);
    render(<TripItineraryView {...props} />);

    await user.click(screen.getByRole("button", { name: "Remove Day 1" }));
    expect(screen.getByText(/marks this trip as unscheduled/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Day" }));
    expect(props.onRemoveLastDay).toHaveBeenCalledWith(true, expect.any(Function));
  });

  it("requires destructive confirmation when the last day has planned content", async () => {
    const user = userEvent.setup();
    const props = buildProps([
      dayOne,
      { ...dayTwo, notes: [{ id: "note-1", content: "Reservation detail", position: 0 }] },
    ]);
    render(<TripItineraryView {...props} />);

    await user.click(screen.getByRole("button", { name: "Remove Day 2" }));
    expect(screen.getByText(/planned content will be deleted/i)).toBeInTheDocument();
    expect(props.onRemoveLastDay).not.toHaveBeenCalled();
  });
});
