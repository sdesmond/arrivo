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

import { MobileUpcomingTab } from "./mobile-upcoming-tab";
import type { Trip } from "@/data/types";

const NOW = new Date("2026-05-13T12:00:00.000Z");

const upcomingTrips: Trip[] = [
  { id: "trip-1", name: "Paris Trip", status: "upcoming", startDate: "2026-06-01", endDate: "2026-06-10" },
  { id: "trip-2", name: "Rome Tour", status: "upcoming", startDate: "2026-07-01", endDate: "2026-07-08" },
];

describe("MobileUpcomingTab", () => {
  it("renders upcoming trip names", () => {
    render(<MobileUpcomingTab trips={upcomingTrips} now={NOW} dateFormat="MM/DD/YYYY" />);

    expect(screen.getByText("Paris Trip")).toBeInTheDocument();
    expect(screen.getByText("Rome Tour")).toBeInTheDocument();
  });

  it("shows the no-docs badge for trips without documents", () => {
    render(<MobileUpcomingTab trips={upcomingTrips} now={NOW} dateFormat="MM/DD/YYYY" />);
    expect(screen.getAllByText("no docs").length).toBeGreaterThan(0);
  });

  it("shows the docs count badge when documents exist", () => {
    render(
      <MobileUpcomingTab
        trips={[
          {
            id: "trip-3",
            name: "Berlin Trip",
            status: "upcoming",
            startDate: "2026-08-01",
            endDate: "2026-08-07",
            docs: [
              { id: "doc-1", name: "Ticket.pdf", kind: "pdf", scope: "trip" },
              { id: "doc-2", name: "Hotel.pdf", kind: "pdf", scope: "trip" },
            ],
          },
        ]}
        now={NOW}
        dateFormat="MM/DD/YYYY"
      />
    );

    expect(screen.getByText("docs")).toBeInTheDocument();
  });

  it("shows unscheduled badge when startDate is missing", () => {
    render(
      <MobileUpcomingTab
        trips={[{ id: "trip-4", name: "No Date Trip", status: "upcoming" }]}
        now={NOW}
        dateFormat="MM/DD/YYYY"
      />
    );
    expect(screen.getByText("unscheduled")).toBeInTheDocument();
  });

  it("shows No dates when startDate is missing", () => {
    render(
      <MobileUpcomingTab
        trips={[{ id: "trip-5", name: "Flexi Trip", status: "upcoming" }]}
        now={NOW}
        dateFormat="MM/DD/YYYY"
      />
    );
    expect(screen.getByText("No dates")).toBeInTheDocument();
  });

  it("shows dayTotal for dateless trips", () => {
    render(
      <MobileUpcomingTab
        trips={[{ id: "trip-6", name: "Flexi Trip", status: "upcoming", dayTotal: 3 }]}
        now={NOW}
        dateFormat="MM/DD/YYYY"
      />
    );

    expect(screen.getByText("3 DAYS")).toBeInTheDocument();
  });
});
