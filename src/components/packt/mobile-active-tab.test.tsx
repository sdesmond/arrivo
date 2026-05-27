// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
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

  it("shows the current event as Now when an active event is in progress", () => {
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

    expect(screen.getByText("Now")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Lunch Reservation/i })[0]).toHaveAttribute(
      "href",
      "/trips/trip-1?focus=event-now"
    );
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
});
