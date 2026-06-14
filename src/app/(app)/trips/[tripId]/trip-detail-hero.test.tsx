import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TripDetailPayload } from "@/data/types";
import { TripDetailHero } from "./trip-detail-hero";

vi.mock("@/components/packt/trip-cover", () => ({
  TripCover: () => <div data-testid="trip-cover" />,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

function buildDetail(overrides: Partial<TripDetailPayload> = {}): TripDetailPayload {
  return {
    trip: {
      id: "trip-1",
      name: "Summer Getaway",
      status: "draft",
    },
    days: [{ id: "day-1", dayNumber: 1, label: "Day 1", events: [] }],
    unscheduledEvents: [],
    docs: [],
    collaborators: [],
    packingItems: [],
    packingLists: [],
    reservations: [],
    ...overrides,
  };
}

describe("TripDetailHero", () => {
  it("shows the correct day count for a dateless trip with one day (AC14)", () => {
    render(
      <TripDetailHero detail={buildDetail()} nowISO="2026-07-01T00:00:00Z" dateFormat="MM/DD/YYYY" onEdit={vi.fn()} />
    );

    expect(screen.getByText("1 day")).toBeInTheDocument();
  });

  it("shows the correct day count for a dateless trip with multiple days", () => {
    const detail = buildDetail({
      days: [
        { id: "day-1", dayNumber: 1, label: "Day 1", events: [] },
        { id: "day-2", dayNumber: 2, label: "Day 2", events: [] },
        { id: "day-3", dayNumber: 3, label: "Day 3", events: [] },
      ],
    });
    render(<TripDetailHero detail={detail} nowISO="2026-07-01T00:00:00Z" dateFormat="MM/DD/YYYY" onEdit={vi.fn()} />);

    expect(screen.getByText("3 days")).toBeInTheDocument();
  });

  it("shows the date-derived count for a scheduled trip", () => {
    const detail = buildDetail({
      trip: {
        id: "trip-1",
        name: "Scheduled Trip",
        status: "upcoming",
        startDate: "2026-08-01",
        endDate: "2026-08-03",
      },
      days: [
        { id: "day-1", dayNumber: 1, date: "2026-08-01", label: "Day 1", events: [] },
        { id: "day-2", dayNumber: 2, date: "2026-08-02", label: "Day 2", events: [] },
        { id: "day-3", dayNumber: 3, date: "2026-08-03", label: "Day 3", events: [] },
      ],
    });
    render(<TripDetailHero detail={detail} nowISO="2026-07-01T00:00:00Z" dateFormat="MM/DD/YYYY" onEdit={vi.fn()} />);

    expect(screen.getByText("3 days")).toBeInTheDocument();
  });
});
