import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
    style,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    style?: React.CSSProperties;
  }) => (
    <a href={href} className={className} style={style}>
      {children}
    </a>
  ),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

import { MobileActiveTab } from "./mobile-active-tab";
import type { Trip, TripEvent } from "@/data/types";

const NOW = new Date("2026-05-13T12:00:00.000Z");

const activeTrip: Trip = {
  id: "trip-1",
  name: "Tokyo Adventure",
  status: "active",
  startDate: "2026-05-10",
  endDate: "2026-05-20",
};

const events: TripEvent[] = [{ id: "event-1", name: "Museum Visit", startAt: "2026-05-13T10:00:00Z", position: 0 }];

describe("MobileActiveTab", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "UTC";
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("renders the active trip name", () => {
    render(<MobileActiveTab trip={activeTrip} todayEvents={events} now={NOW} />);
    expect(screen.getAllByText("Tokyo Adventure").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the empty-state copy when no active trip exists", () => {
    render(<MobileActiveTab trip={null} todayEvents={[]} now={NOW} />);
    expect(screen.getByText(/No active trip right now/i)).toBeInTheDocument();
  });

  it("shows the next-event label when only future events exist", () => {
    render(
      <MobileActiveTab
        trip={activeTrip}
        todayEvents={[{ id: "event-2", name: "Late Dinner", startAt: "2026-05-13T20:00:00Z", position: 0 }]}
        now={NOW}
      />
    );

    expect(screen.getByText("Next Event")).toBeInTheDocument();
  });

  it("shows weekday and time for a next event on a future day while keeping today rows separate", () => {
    const { container } = render(
      <MobileActiveTab
        trip={activeTrip}
        todayEvents={[{ id: "event-untimed", name: "Free Explore", position: 0 }]}
        summaryEvents={[{ id: "event-future-day", name: "Temple Tour", startAt: "2026-05-14T14:00:00Z", position: 0 }]}
        now={NOW}
      />
    );

    expect(screen.getByText("Next Event")).toBeInTheDocument();
    expect(screen.getByText("Temple Tour")).toBeInTheDocument();
    expect(container.textContent).toContain("Thursday · 2:00 PM");
    expect(screen.getByRole("link", { name: /Free Explore/i })).toBeInTheDocument();
    expect(screen.getByText("stop")).toBeInTheDocument();
  });

  it("shows the current event as Now when an active event is in progress", () => {
    const { container } = render(
      <MobileActiveTab
        trip={activeTrip}
        todayEvents={[
          {
            id: "event-now",
            name: "Lunch Reservation",
            startAt: "2026-05-13T11:30:00Z",
            endAt: "2026-05-13T12:30:00Z",
            position: 0,
          },
          {
            id: "event-next",
            name: "Evening Walk",
            startAt: "2026-05-13T18:00:00Z",
            endAt: "2026-05-13T19:00:00Z",
            position: 1,
          },
        ]}
        now={NOW}
      />
    );

    expect(screen.getByText("Now")).toBeInTheDocument();
    expect(screen.getByText("Next Event")).toBeInTheDocument();
    expect(container.textContent).toContain("Ends at 12:30 PM");
    expect(screen.getAllByRole("link", { name: /Lunch Reservation/i })[0]).toHaveAttribute(
      "href",
      "/trips/trip-1?focus=event-now"
    );
    expect(screen.getAllByRole("link", { name: /Evening Walk/i })[0]).toHaveAttribute(
      "href",
      "/trips/trip-1?focus=event-next"
    );
  });

  it("renders Now above Next Event when both summary rows exist", () => {
    render(
      <MobileActiveTab
        trip={activeTrip}
        todayEvents={[
          {
            id: "event-now",
            name: "Lunch Reservation",
            startAt: "2026-05-13T11:30:00Z",
            endAt: "2026-05-13T12:30:00Z",
            position: 0,
          },
          {
            id: "event-next",
            name: "Evening Walk",
            startAt: "2026-05-13T18:00:00Z",
            endAt: "2026-05-13T19:00:00Z",
            position: 1,
          },
        ]}
        now={NOW}
      />
    );

    const nowLabel = screen.getByText("Now");
    const nextLabel = screen.getByText("Next Event");
    expect(nowLabel.compareDocumentPosition(nextLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not render a summary event card when the active trip has no timed events", () => {
    render(
      <MobileActiveTab
        trip={activeTrip}
        todayEvents={[{ id: "event-untimed", name: "Free Explore", position: 0 }]}
        now={NOW}
      />
    );

    expect(screen.queryByText("Now")).not.toBeInTheDocument();
    expect(screen.queryByText("Next Event")).not.toBeInTheDocument();
    expect(screen.getByText("stop")).toBeInTheDocument();
  });

  it("renders past event styling and keeps untimed rows blank", () => {
    render(
      <MobileActiveTab
        trip={activeTrip}
        todayEvents={[
          {
            id: "event-past",
            name: "Morning Coffee",
            startAt: "2026-05-13T08:00:00Z",
            endAt: "2026-05-13T09:00:00Z",
            position: 0,
          },
          { id: "event-untimed", name: "Free Explore", position: 1 },
        ]}
        now={NOW}
      />
    );

    const itineraryRow = screen.getAllByText("Morning Coffee")[1]?.closest("a");
    expect(screen.getAllByText("Morning Coffee")[1]).toHaveStyle({ textDecoration: "line-through" });
    expect(itineraryRow).toHaveStyle({ opacity: "0.5" });

    const untimedRow = screen.getByRole("link", { name: /Free Explore/i });
    expect(untimedRow.querySelector("span")).toHaveTextContent("");
  });

  it("renders the upcoming status without active-day itinerary sections", () => {
    render(
      <MobileActiveTab
        trip={{
          id: "trip-2",
          name: "Paris Escape",
          status: "upcoming",
          startDate: "2026-05-20",
          endDate: "2026-05-24",
        }}
        todayEvents={events}
        now={NOW}
      />
    );

    expect(screen.getAllByText("UPCOMING")).toHaveLength(2);
    expect(screen.queryByText(/TODAY/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Now")).not.toBeInTheDocument();
  });

  it("routes a linked-event summary card to the Reservations highlight deep link", () => {
    render(
      <MobileActiveTab
        trip={activeTrip}
        todayEvents={[
          {
            id: "linked-now",
            name: "Check-in — Hotel Avenida Palace",
            startAt: "2026-05-13T11:30:00Z",
            position: 0,
            linkedReservationId: "res-1",
            reservationType: "lodging",
          },
        ]}
        now={NOW}
      />
    );

    expect(screen.getAllByRole("link", { name: /Check-in/i })[0]).toHaveAttribute(
      "href",
      "/trips/trip-1?tab=res&highlight=res-1"
    );
  });

  it("keeps manual current and linked next summary rows on their own deep links", () => {
    render(
      <MobileActiveTab
        trip={activeTrip}
        todayEvents={[
          {
            id: "event-now",
            name: "Lunch Reservation",
            startAt: "2026-05-13T11:30:00Z",
            endAt: "2026-05-13T12:30:00Z",
            position: 0,
          },
          {
            id: "linked-next",
            name: "Check-in — Hotel Avenida Palace",
            startAt: "2026-05-13T14:00:00Z",
            position: 1,
            linkedReservationId: "res-1",
            reservationType: "lodging",
          },
        ]}
        now={NOW}
      />
    );

    expect(screen.getAllByRole("link", { name: /Lunch Reservation/i })[0]).toHaveAttribute(
      "href",
      "/trips/trip-1?focus=event-now"
    );
    expect(screen.getAllByRole("link", { name: /Check-in/i })[0]).toHaveAttribute(
      "href",
      "/trips/trip-1?tab=res&highlight=res-1"
    );
  });

  it("keeps the manual-event focus link for a non-linked event in the today list", () => {
    render(
      <MobileActiveTab
        trip={activeTrip}
        todayEvents={[
          { id: "event-untimed", name: "Free Explore", position: 0 },
          {
            id: "linked-row",
            name: "Pickup — Rental Car",
            startAt: "2026-05-13T09:00:00Z",
            endAt: "2026-05-13T09:30:00Z",
            position: 1,
            linkedReservationId: "res-2",
            reservationType: "rental-car",
          },
        ]}
        now={NOW}
      />
    );

    expect(screen.getByRole("link", { name: /Free Explore/i })).toHaveAttribute(
      "href",
      "/trips/trip-1/days/4?focus=event-untimed"
    );
  });

  it("routes a linked-event row in the today list to the Reservations highlight deep link", () => {
    render(
      <MobileActiveTab
        trip={activeTrip}
        todayEvents={[
          { id: "event-untimed", name: "Free Explore", position: 0 },
          {
            id: "linked-row",
            name: "Pickup — Rental Car",
            startAt: "2026-05-13T09:00:00Z",
            endAt: "2026-05-13T09:30:00Z",
            position: 1,
            linkedReservationId: "res-2",
            reservationType: "rental-car",
          },
        ]}
        now={NOW}
      />
    );

    expect(screen.getAllByRole("link", { name: /Pickup/i })[0]).toHaveAttribute(
      "href",
      "/trips/trip-1?tab=res&highlight=res-2"
    );
  });

  it("renders the literal stored event time unshifted under a non-UTC viewer timezone", () => {
    process.env.TZ = "America/Denver";
    render(
      <MobileActiveTab
        trip={activeTrip}
        todayEvents={[
          {
            id: "event-now",
            name: "Lunch Reservation",
            startAt: "2026-05-13T11:30:00Z",
            endAt: "2026-05-13T12:30:00Z",
            position: 0,
          },
        ]}
        now={NOW}
      />
    );

    expect(screen.getByText("11:30 AM")).toBeInTheDocument();
  });

  it("uses floating wall-clock comparisons for the summary card under a non-UTC viewer timezone", () => {
    process.env.TZ = "America/Denver";
    render(
      <MobileActiveTab
        trip={activeTrip}
        todayEvents={[
          {
            id: "event-next",
            name: "Brunch",
            startAt: "2026-05-13T11:30:00Z",
            endAt: "2026-05-13T12:30:00Z",
            position: 0,
          },
        ]}
        now={NOW}
      />
    );

    expect(screen.getByText("Next Event")).toBeInTheDocument();
    expect(screen.queryByText("Now")).not.toBeInTheDocument();
  });
});
