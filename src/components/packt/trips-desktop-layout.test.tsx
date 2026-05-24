// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
  useTheme: () => ({ resolvedTheme: "light" }),
}));

import { TripsDesktopLayout } from "./trips-desktop-layout";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import type { Trip, TripListEntry } from "@/data/types";

const NOW_ISO = "2026-05-13T12:00:00.000Z";

const activeEntry: TripListEntry = {
  trip: { id: "trip-active", name: "Active Japan", status: "active", startDate: "2026-05-10", endDate: "2026-05-20" },
  todayEvents: [],
};

const upcomingTrips: Trip[] = [
  { id: "trip-upcoming-1", name: "Paris Trip", status: "upcoming", startDate: "2026-06-01", endDate: "2026-06-10" },
  { id: "trip-upcoming-2", name: "Rome Tour", status: "upcoming", startDate: "2026-07-01", endDate: "2026-07-08" },
];

const pastTrips: Trip[] = [
  { id: "trip-past-1", name: "Lisbon Escape", status: "past", startDate: "2025-09-01", endDate: "2025-09-07" },
];

const unscheduledEntries: TripListEntry[] = [
  { trip: { id: "trip-unsched-1", name: "Dream Trip", status: "upcoming" }, todayEvents: [] },
  { trip: { id: "trip-unsched-2", name: "Bucket List", status: "upcoming" }, todayEvents: [] },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

describe("TripsDesktopLayout", () => {
  it("renders Topbar with correct tripCount", () => {
    render(
      <TripsDesktopLayout
        activeEntry={activeEntry}
        upcomingTrips={upcomingTrips}
        pastTrips={pastTrips}
        unscheduledEntries={unscheduledEntries}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        nextInDays={null}
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("My trips")).toBeInTheDocument();
  });

  it("renders NowCard and DayRibbon when activeEntry present", () => {
    render(
      <TripsDesktopLayout
        activeEntry={activeEntry}
        upcomingTrips={upcomingTrips}
        pastTrips={pastTrips}
        unscheduledEntries={[]}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        nextInDays={null}
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getAllByText("Active Japan").length).toBeGreaterThanOrEqual(1);
  });

  it("renders Upcoming section with TripCards", () => {
    render(
      <TripsDesktopLayout
        activeEntry={activeEntry}
        upcomingTrips={upcomingTrips}
        pastTrips={pastTrips}
        unscheduledEntries={[]}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        nextInDays={null}
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getAllByText("Paris Trip").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Rome Tour").length).toBeGreaterThanOrEqual(1);
  });

  it("renders Past section with PastTripsList", () => {
    render(
      <TripsDesktopLayout
        activeEntry={activeEntry}
        upcomingTrips={upcomingTrips}
        pastTrips={pastTrips}
        unscheduledEntries={[]}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        nextInDays={null}
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("Lisbon Escape")).toBeInTheDocument();
  });

  it("renders UnscheduledSection when unscheduledEntries non-empty", () => {
    render(
      <TripsDesktopLayout
        activeEntry={activeEntry}
        upcomingTrips={upcomingTrips}
        pastTrips={pastTrips}
        unscheduledEntries={unscheduledEntries}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        nextInDays={null}
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByRole("heading", { name: "Unscheduled" })).toBeInTheDocument();
    expect(screen.getAllByText("Dream Trip").length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT render UnscheduledSection when unscheduledEntries empty", () => {
    render(
      <TripsDesktopLayout
        activeEntry={activeEntry}
        upcomingTrips={upcomingTrips}
        pastTrips={pastTrips}
        unscheduledEntries={[]}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        nextInDays={null}
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.queryByRole("heading", { name: "Unscheduled" })).not.toBeInTheDocument();
  });

  it("shows NEXT IN X DAYS when nextInDays is provided", () => {
    render(
      <TripsDesktopLayout
        activeEntry={null}
        upcomingTrips={upcomingTrips}
        pastTrips={[]}
        unscheduledEntries={[]}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        nextInDays={7}
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText(/NEXT IN 7 DAYS/)).toBeInTheDocument();
  });

  it("shows singular TRIP for one upcoming trip", () => {
    render(
      <TripsDesktopLayout
        activeEntry={null}
        upcomingTrips={[upcomingTrips[0]]}
        pastTrips={[]}
        unscheduledEntries={[]}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        nextInDays={null}
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("1 TRIP")).toBeInTheDocument();
  });

  it("calls onEditTrip when TripCard edit button is clicked", () => {
    const onEditTrip = vi.fn();
    render(
      <TripsDesktopLayout
        activeEntry={null}
        upcomingTrips={upcomingTrips}
        pastTrips={[]}
        unscheduledEntries={[]}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        nextInDays={null}
        onNewTrip={vi.fn()}
        onEditTrip={onEditTrip}
      />,
      { wrapper: Wrapper }
    );
    fireEvent.click(screen.getAllByTitle("Edit trip")[0]);
    expect(onEditTrip).toHaveBeenCalled();
  });

  it("calls onEditTrip from PastTripsList", () => {
    const onEditTrip = vi.fn();
    render(
      <TripsDesktopLayout
        activeEntry={null}
        upcomingTrips={[]}
        pastTrips={pastTrips}
        unscheduledEntries={[]}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        nextInDays={null}
        onNewTrip={vi.fn()}
        onEditTrip={onEditTrip}
      />,
      { wrapper: Wrapper }
    );
    fireEvent.click(screen.getByTitle("Trip options"));
    fireEvent.click(screen.getByText("Edit trip"));
    expect(onEditTrip).toHaveBeenCalled();
  });

  it("calls onEditTrip from NowCard", () => {
    const onEditTrip = vi.fn();
    render(
      <TripsDesktopLayout
        activeEntry={activeEntry}
        upcomingTrips={[]}
        pastTrips={[]}
        unscheduledEntries={[]}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        nextInDays={null}
        onNewTrip={vi.fn()}
        onEditTrip={onEditTrip}
      />,
      { wrapper: Wrapper }
    );
    fireEvent.click(screen.getByTitle("Edit trip"));
    expect(onEditTrip).toHaveBeenCalled();
  });

  it("calls onEditTrip from UnscheduledSection", () => {
    const onEditTrip = vi.fn();
    render(
      <TripsDesktopLayout
        activeEntry={null}
        upcomingTrips={[]}
        pastTrips={[]}
        unscheduledEntries={unscheduledEntries}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        nextInDays={null}
        onNewTrip={vi.fn()}
        onEditTrip={onEditTrip}
      />,
      { wrapper: Wrapper }
    );
    fireEvent.click(screen.getAllByTitle("Edit trip")[0]);
    expect(onEditTrip).toHaveBeenCalled();
  });
});
