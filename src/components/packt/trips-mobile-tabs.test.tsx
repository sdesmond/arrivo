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

import { MobileActiveTab, MobileUpcomingTab, MobilePastTab, MobileUnscheduledTab } from "./trips-mobile-tabs";
import type { Trip, TripEvent } from "@/data/types";

const NOW = new Date("2026-05-13T12:00:00.000Z");

const activeTrip: Trip = {
  id: "trip-1",
  name: "Tokyo Adventure",
  status: "active",
  startDate: "2026-05-10",
  endDate: "2026-05-20",
};

const events: TripEvent[] = [{ id: "ev-1", name: "Museum Visit", startAt: "2026-05-13T10:00:00Z", position: 0 }];

const upcomingTrips: Trip[] = [
  {
    id: "t2",
    name: "Paris Trip",
    status: "upcoming",
    startDate: "2026-06-01",
    endDate: "2026-06-10",
  },
  {
    id: "t3",
    name: "Rome Tour",
    status: "upcoming",
    startDate: "2026-07-01",
    endDate: "2026-07-08",
  },
];

const pastTrips: Trip[] = [
  {
    id: "t4",
    name: "Lisbon Escape",
    status: "past",
    startDate: "2025-09-01",
    endDate: "2025-09-07",
  },
  { id: "t5", name: "NYC Visit", status: "past", startDate: "2025-11-01", endDate: "2025-11-05" },
];

describe("MobileActiveTab", () => {
  it("renders trip name when trip is provided", () => {
    render(<MobileActiveTab trip={activeTrip} todayEvents={events} now={NOW} />);
    expect(screen.getAllByText("Tokyo Adventure").length).toBeGreaterThanOrEqual(1);
  });

  it("renders fallback when trip is null", () => {
    render(<MobileActiveTab trip={null} todayEvents={[]} now={NOW} />);
    expect(screen.getByText(/no active trip/i)).toBeInTheDocument();
  });

  it("renders UPCOMING status label for upcoming trip", () => {
    const upcomingTrip: Trip = {
      id: "trip-2",
      name: "Paris Trip",
      status: "upcoming",
      startDate: "2026-06-01",
      endDate: "2026-06-10",
    };
    render(<MobileActiveTab trip={upcomingTrip} todayEvents={[]} now={NOW} />);
    expect(screen.getAllByText("UPCOMING").length).toBeGreaterThanOrEqual(1);
  });

  it("renders event without startAt gracefully", () => {
    const eventNoTime: TripEvent = { id: "ev-x", name: "Unscheduled Visit", position: 0 };
    render(<MobileActiveTab trip={activeTrip} todayEvents={[eventNoTime]} now={NOW} />);
    expect(screen.getByText("Unscheduled Visit")).toBeInTheDocument();
  });

  it("shows Next Event label when only future events", () => {
    const futureEvent: TripEvent = {
      id: "ev-f",
      name: "Late Dinner",
      startAt: "2026-05-13T20:00:00Z",
      position: 0,
    };
    render(<MobileActiveTab trip={activeTrip} todayEvents={[futureEvent]} now={NOW} />);
    expect(screen.getByText("Next Event")).toBeInTheDocument();
  });

  it("does not show event block when todayEvents is empty", () => {
    render(<MobileActiveTab trip={activeTrip} todayEvents={[]} now={NOW} />);
    expect(screen.queryByText("Now")).not.toBeInTheDocument();
    expect(screen.queryByText("Next Event")).not.toBeInTheDocument();
  });

  it("shows past event with line-through style (isEventPast)", () => {
    const pastEvent: TripEvent = {
      id: "ev-past",
      name: "Past Museum",
      startAt: "2026-05-13T08:00:00Z",
      endAt: "2026-05-13T09:00:00Z",
      position: 0,
    };
    render(<MobileActiveTab trip={activeTrip} todayEvents={[pastEvent]} now={NOW} />);
    expect(screen.getAllByText("Past Museum").length).toBeGreaterThanOrEqual(1);
  });

  it("highlights current event (isEventNow)", () => {
    const nowEvent: TripEvent = {
      id: "ev-now",
      name: "Current Tour",
      startAt: "2026-05-13T11:00:00Z",
      endAt: "2026-05-13T13:00:00Z",
      position: 0,
    };
    render(<MobileActiveTab trip={activeTrip} todayEvents={[nowEvent]} now={NOW} />);
    expect(screen.getAllByText("Current Tour").length).toBeGreaterThanOrEqual(1);
  });
});

describe("MobileUpcomingTab", () => {
  it("renders upcoming trip names", () => {
    render(<MobileUpcomingTab trips={upcomingTrips} now={NOW} dateFormat="MM/DD/YYYY" />);
    expect(screen.getByText("Paris Trip")).toBeInTheDocument();
    expect(screen.getByText("Rome Tour")).toBeInTheDocument();
  });

  it("shows 'no docs' badge for trips without documents", () => {
    render(<MobileUpcomingTab trips={upcomingTrips} now={NOW} dateFormat="MM/DD/YYYY" />);
    expect(screen.getAllByText("no docs").length).toBeGreaterThan(0);
  });

  it("shows docs count badge for trips with documents", () => {
    const tripWithDocs: Trip = {
      id: "t6",
      name: "Berlin Trip",
      status: "upcoming",
      startDate: "2026-08-01",
      endDate: "2026-08-07",
      docs: [
        { id: "d1", name: "Ticket.pdf", kind: "pdf", scope: "trip", offline: false },
        { id: "d2", name: "Hotel.pdf", kind: "pdf", scope: "trip", offline: false },
      ],
    };
    render(<MobileUpcomingTab trips={[tripWithDocs]} now={NOW} dateFormat="MM/DD/YYYY" />);
    expect(screen.getByText("2 docs")).toBeInTheDocument();
  });

  it("shows unscheduled badge for a trip without startDate", () => {
    const noDateTrip: Trip = { id: "t-nd", name: "Dateless Upcoming", status: "upcoming" };
    render(<MobileUpcomingTab trips={[noDateTrip]} now={NOW} dateFormat="MM/DD/YYYY" />);
    expect(screen.getByText("unscheduled")).toBeInTheDocument();
  });
});

describe("MobilePastTab", () => {
  it("renders past trip names", () => {
    render(<MobilePastTab trips={pastTrips} dateFormat="MM/DD/YYYY" />);
    expect(screen.getByText("Lisbon Escape")).toBeInTheDocument();
    expect(screen.getByText("NYC Visit")).toBeInTheDocument();
  });

  it("shows No dates for a past trip without startDate", () => {
    const tripNoDate: Trip = { id: "t-nd", name: "Undated Past", status: "past" };
    render(<MobilePastTab trips={[tripNoDate]} dateFormat="MM/DD/YYYY" />);
    expect(screen.getByText(/No dates/)).toBeInTheDocument();
  });
});

describe("MobileUnscheduledTab", () => {
  const unscheduledTrips: Trip[] = [
    { id: "u1", name: "Dream Trip", status: "upcoming" },
    { id: "u2", name: "Bucket List", status: "upcoming" },
  ];

  it("renders dateless trip names", () => {
    render(<MobileUnscheduledTab trips={unscheduledTrips} dateFormat="MM/DD/YYYY" />);
    expect(screen.getByText("Dream Trip")).toBeInTheDocument();
    expect(screen.getByText("Bucket List")).toBeInTheDocument();
  });

  it("shows unscheduled badge for each trip", () => {
    render(<MobileUnscheduledTab trips={unscheduledTrips} dateFormat="MM/DD/YYYY" />);
    const badges = screen.getAllByText("unscheduled");
    expect(badges).toHaveLength(2);
  });

  it("shows no docs badge when docs absent", () => {
    render(<MobileUnscheduledTab trips={unscheduledTrips} dateFormat="MM/DD/YYYY" />);
    expect(screen.getAllByText("no docs").length).toBeGreaterThan(0);
  });

  it("shows docs count badge when docs present", () => {
    const tripWithDocs: Trip = {
      id: "u3",
      name: "Berlin Trip",
      status: "upcoming",
      docs: [{ id: "d1", name: "Ticket.pdf", kind: "pdf", scope: "trip", offline: false }],
    };
    render(<MobileUnscheduledTab trips={[tripWithDocs]} dateFormat="MM/DD/YYYY" />);
    expect(screen.getByText("1 docs")).toBeInTheDocument();
  });

  it("shows 'No dates' for unscheduled trips", () => {
    render(<MobileUnscheduledTab trips={unscheduledTrips} dateFormat="MM/DD/YYYY" />);
    expect(screen.getAllByText("No dates").length).toBeGreaterThan(0);
  });

  it("shows formatted date range when trip has both dates", () => {
    const datedTrip: Trip = {
      id: "u4",
      name: "Dated Unsched",
      status: "upcoming",
      startDate: "2026-07-01",
      endDate: "2026-07-07",
    };
    render(<MobileUnscheduledTab trips={[datedTrip]} dateFormat="MM/DD/YYYY" />);
    expect(screen.queryByText("No dates")).not.toBeInTheDocument();
  });
});
