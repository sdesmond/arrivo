// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    title,
    style,
  }: {
    children: React.ReactNode;
    href: string;
    title?: string;
    style?: React.CSSProperties;
  }) => (
    <a href={href} title={title} style={style}>
      {children}
    </a>
  ),
}));

import { DayRibbon } from "./day-ribbon";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import type { Trip, TripEvent } from "@/data/types";

const NOW_ISO = "2026-05-13T12:00:00.000Z";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

const trip: Trip = {
  id: "trip-1",
  name: "Tokyo Adventure",
  status: "active",
  startDate: "2026-05-10",
  endDate: "2026-05-20",
};

const events: TripEvent[] = [
  { id: "ev-1", name: "Museum Visit", startAt: "2026-05-13T10:00:00Z" },
  { id: "ev-2", name: "Dinner", startAt: "2026-05-13T19:00:00Z" },
];

describe("DayRibbon", () => {
  it("renders with empty events", () => {
    const { container } = render(<DayRibbon trip={trip} todayEvents={[]} />, { wrapper: Wrapper });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders event names when events are provided", () => {
    render(<DayRibbon trip={trip} todayEvents={events} />, { wrapper: Wrapper });
    expect(screen.getByText("Museum Visit")).toBeInTheDocument();
    expect(screen.getByText("Dinner")).toBeInTheDocument();
  });

  it("renders a link to the trip", () => {
    render(<DayRibbon trip={trip} todayEvents={[]} />, { wrapper: Wrapper });
    const link = screen.getByTitle("Open day planner");
    expect(link).toBeInTheDocument();
  });

  it("renders without day number for non-active trip (upcoming)", () => {
    const upcomingTrip: Trip = {
      id: "trip-2",
      name: "Paris Vacation",
      status: "upcoming",
      startDate: "2026-06-01",
      endDate: "2026-06-10",
    };
    render(<DayRibbon trip={upcomingTrip} todayEvents={[]} />, { wrapper: Wrapper });
    expect(screen.queryByText(/DAY \d+/i)).not.toBeInTheDocument();
  });
});
