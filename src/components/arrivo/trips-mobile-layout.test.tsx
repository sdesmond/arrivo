import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

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

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({
    children,
    title,
    className,
    style,
  }: {
    children: React.ReactNode;
    title?: string;
    className?: string;
    style?: React.CSSProperties;
  }) => (
    <button title={title} className={className} style={style}>
      {children}
    </button>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: React.MouseEventHandler }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import { TripsMobileLayout } from "./trips-mobile-layout";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import type { Trip, TripListEntry } from "@/data/types";

const NOW_ISO = "2026-05-13T12:00:00.000Z";

const activeEntry: TripListEntry = {
  trip: { id: "trip-active", name: "Active Japan", status: "active", startDate: "2026-05-10", endDate: "2026-05-20" },
  todayEvents: [],
  summaryEvents: [],
};

const upcomingTrips: Trip[] = [
  { id: "trip-upcoming-1", name: "Paris Trip", status: "upcoming", startDate: "2026-06-01", endDate: "2026-06-10" },
];

const unscheduledEntries: TripListEntry[] = [
  { trip: { id: "trip-unsched-1", name: "Dream Trip", status: "upcoming" }, todayEvents: [], summaryEvents: [] },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

describe("TripsMobileLayout", () => {
  it("shows Unscheduled tab when unscheduled entries exist", () => {
    render(
      <TripsMobileLayout
        activeEntry={activeEntry}
        upcomingTrips={upcomingTrips}
        unscheduledEntries={unscheduledEntries}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        mobileTab="Unscheduled"
        onTabChange={vi.fn()}
        onNewTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("Unscheduled")).toBeInTheDocument();
  });

  it("does not show Unscheduled tab when no unscheduled entries", () => {
    render(
      <TripsMobileLayout
        activeEntry={activeEntry}
        upcomingTrips={upcomingTrips}
        unscheduledEntries={[]}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        mobileTab="Active"
        onTabChange={vi.fn()}
        onNewTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.queryByText("Unscheduled")).not.toBeInTheDocument();
  });

  it("renders MobileUnscheduledTab content when Unscheduled tab is active", () => {
    render(
      <TripsMobileLayout
        activeEntry={null}
        upcomingTrips={upcomingTrips}
        unscheduledEntries={unscheduledEntries}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        mobileTab="Unscheduled"
        onTabChange={vi.fn()}
        onNewTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("Dream Trip")).toBeInTheDocument();
  });

  it("renders Active tab content when active tab", () => {
    render(
      <TripsMobileLayout
        activeEntry={activeEntry}
        upcomingTrips={upcomingTrips}
        unscheduledEntries={[]}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        mobileTab="Active"
        onTabChange={vi.fn()}
        onNewTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getAllByText("Active Japan").length).toBeGreaterThanOrEqual(1);
  });

  it("renders Upcoming tab content when upcoming tab", () => {
    render(
      <TripsMobileLayout
        activeEntry={null}
        upcomingTrips={upcomingTrips}
        unscheduledEntries={[]}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        mobileTab="Upcoming"
        onTabChange={vi.fn()}
        onNewTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("Paris Trip")).toBeInTheDocument();
  });

  it("calls onTabChange when a tab is clicked", () => {
    const onTabChange = vi.fn();
    render(
      <TripsMobileLayout
        activeEntry={null}
        upcomingTrips={upcomingTrips}
        unscheduledEntries={unscheduledEntries}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        mobileTab="Upcoming"
        onTabChange={onTabChange}
        onNewTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    fireEvent.click(screen.getByText("Unscheduled"));
    expect(onTabChange).toHaveBeenCalledWith("Unscheduled");
  });

  it("resets mobileTab to Upcoming when Unscheduled entries are removed", async () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <TripsMobileLayout
        activeEntry={null}
        upcomingTrips={upcomingTrips}
        unscheduledEntries={unscheduledEntries}
        now={new Date(NOW_ISO)}
        dateFormat="MM/DD/YYYY"
        mobileTab="Unscheduled"
        onTabChange={onTabChange}
        onNewTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    act(() => {
      rerender(
        <TripsMobileLayout
          activeEntry={null}
          upcomingTrips={upcomingTrips}
          unscheduledEntries={[]}
          now={new Date(NOW_ISO)}
          dateFormat="MM/DD/YYYY"
          mobileTab="Unscheduled"
          onTabChange={onTabChange}
          onNewTrip={vi.fn()}
        />
      );
    });
    await waitFor(() => {
      expect(onTabChange).toHaveBeenCalledWith("Upcoming");
    });
  });
});
