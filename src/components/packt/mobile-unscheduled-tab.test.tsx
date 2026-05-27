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

import { MobileUnscheduledTab } from "./mobile-unscheduled-tab";
import type { Trip } from "@/data/types";

const unscheduledTrips: Trip[] = [
  { id: "trip-1", name: "Dream Trip", status: "upcoming" },
  { id: "trip-2", name: "Bucket List", status: "upcoming" },
];

describe("MobileUnscheduledTab", () => {
  it("renders dateless trip names", () => {
    render(<MobileUnscheduledTab trips={unscheduledTrips} dateFormat="MM/DD/YYYY" />);

    expect(screen.getByText("Dream Trip")).toBeInTheDocument();
    expect(screen.getByText("Bucket List")).toBeInTheDocument();
  });

  it("shows unscheduled badges and no-date copy", () => {
    render(<MobileUnscheduledTab trips={unscheduledTrips} dateFormat="MM/DD/YYYY" />);

    expect(screen.getAllByText("unscheduled")).toHaveLength(2);
    expect(screen.getAllByText("No dates").length).toBeGreaterThan(0);
  });

  it("renders a formatted date range and doc badge when dates and docs exist", () => {
    render(
      <MobileUnscheduledTab
        trips={[
          {
            id: "trip-3",
            name: "Booked Trip",
            status: "upcoming",
            startDate: "2026-08-01",
            endDate: "2026-08-03",
            docs: [{ id: "doc-1", name: "Boarding Pass", kind: "pdf", size: "1 MB", scope: "trip", offline: false }],
          },
        ]}
        dateFormat="MM/DD/YYYY"
      />
    );

    expect(screen.getByText("Aug 1, 2026 — Aug 3, 2026")).toBeInTheDocument();
    expect(screen.getByText("1 docs")).toBeInTheDocument();
    expect(screen.queryByText("No dates")).not.toBeInTheDocument();
    expect(screen.queryByText("no docs")).not.toBeInTheDocument();
  });
});
