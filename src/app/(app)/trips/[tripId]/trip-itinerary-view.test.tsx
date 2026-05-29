import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DayItinerary } from "@/data/types";
import { TripItineraryView, type TripItineraryViewProps } from "./trip-itinerary-view";

interface MockDayCardProps {
  day: DayItinerary;
  onRemove?: () => void;
}

interface MockPlaceRowProps {
  place: { id: string; name: string };
}

vi.mock("@/components/packt/day-card", () => ({
  DayCard: ({ day, onRemove }: MockDayCardProps) => (
    <section data-testid={`day-card-${day.dayNumber}`}>
      <span>{day.label}</span>
      {onRemove && <button onClick={onRemove}>Remove {day.label}</button>}
    </section>
  ),
}));

vi.mock("@/components/packt/place-row", () => ({
  PlaceRow: ({ place }: MockPlaceRowProps) => <div>{place.name}</div>,
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
    unscheduledEvents: [],
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

  it("renders unscheduled events above the day stack and hides them when collapsed", async () => {
    const user = userEvent.setup();
    const props = buildProps([dayOne]);
    props.unscheduledEvents = [
      { id: "event-1", name: "Displaced museum", displacedDate: "2026-06-03", position: 0 },
      { id: "event-2", name: "Displaced dinner", displacedDate: "2026-06-03", position: 1 },
    ];
    render(<TripItineraryView {...props} />);

    expect(screen.getByText("Unscheduled Events")).toBeInTheDocument();
    expect(screen.getByText("Displaced museum")).toBeInTheDocument();
    expect(screen.getByText("Day 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /unscheduled events/i }));
    expect(screen.queryByText("Displaced museum")).not.toBeInTheDocument();
  });

  it("does not render the unscheduled section when no unscheduled events exist", () => {
    const props = buildProps([dayOne]);
    render(<TripItineraryView {...props} />);

    expect(screen.queryByText("Unscheduled Events")).not.toBeInTheDocument();
  });

  it("wraps each day card in a stagger animation container for new trips", () => {
    const props = buildProps([dayOne, dayTwo]);
    render(<TripItineraryView {...props} isNew />);

    const firstWrapper = screen.getByTestId("day-card-1").parentElement;
    const secondWrapper = screen.getByTestId("day-card-2").parentElement;

    expect(firstWrapper).toHaveClass("animate-in");
    expect(secondWrapper).toHaveClass("animate-in");
  });

  it("renders day cards without stagger animation when the trip is not new", () => {
    const props = buildProps([dayOne, dayTwo]);
    render(<TripItineraryView {...props} isNew={false} />);

    const firstWrapper = screen.getByTestId("day-card-1").parentElement;
    const secondWrapper = screen.getByTestId("day-card-2").parentElement;

    expect(firstWrapper).not.toHaveClass("animate-in");
    expect(secondWrapper).not.toHaveClass("animate-in");
  });

  it("renders the empty state without stagger wrappers when there are no days", () => {
    const props = buildProps([]);
    render(<TripItineraryView {...props} isNew />);

    expect(screen.getByText("No itinerary yet")).toBeInTheDocument();
    expect(screen.queryByTestId("day-card-stagger-1")).not.toBeInTheDocument();
  });
});
