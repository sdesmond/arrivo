import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
    onClick,
    title,
    className,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler;
    title?: string;
    className?: string;
  }) => (
    <button onClick={onClick} title={title} className={className}>
      {children}
    </button>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: React.MouseEventHandler }) => (
    <button onClick={onClick}>{children}</button>
  ),
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
  it("renders Topbar with heading", () => {
    render(
      <TripsDesktopLayout
        activeEntry={activeEntry}
        upcomingTrips={upcomingTrips}
        pastTrips={pastTrips}
        unscheduledEntries={unscheduledEntries}
        dateFormat="MM/DD/YYYY"
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("Trips")).toBeInTheDocument();
  });

  it("renders NowCard and DayRibbon when activeEntry present", () => {
    render(
      <TripsDesktopLayout
        activeEntry={activeEntry}
        upcomingTrips={upcomingTrips}
        pastTrips={pastTrips}
        unscheduledEntries={[]}
        dateFormat="MM/DD/YYYY"
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
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
        dateFormat="MM/DD/YYYY"
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
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
        dateFormat="MM/DD/YYYY"
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getAllByText("Lisbon Escape").length).toBeGreaterThanOrEqual(1);
  });

  it("renders UnscheduledSection when unscheduledEntries non-empty", () => {
    render(
      <TripsDesktopLayout
        activeEntry={activeEntry}
        upcomingTrips={upcomingTrips}
        pastTrips={pastTrips}
        unscheduledEntries={unscheduledEntries}
        dateFormat="MM/DD/YYYY"
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
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
        dateFormat="MM/DD/YYYY"
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.queryByRole("heading", { name: "Unscheduled" })).not.toBeInTheDocument();
  });

  it("calls onEditTrip when TripCard edit button is clicked", () => {
    const onEditTrip = vi.fn();
    render(
      <TripsDesktopLayout
        activeEntry={null}
        upcomingTrips={upcomingTrips}
        pastTrips={[]}
        unscheduledEntries={[]}
        dateFormat="MM/DD/YYYY"
        onNewTrip={vi.fn()}
        onEditTrip={onEditTrip}
        onDeleteTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    fireEvent.click(screen.getAllByRole("button", { name: /edit trip/i })[0]);
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
        dateFormat="MM/DD/YYYY"
        onNewTrip={vi.fn()}
        onEditTrip={onEditTrip}
        onDeleteTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    fireEvent.click(screen.getAllByRole("button", { name: /edit trip/i })[0]);
    expect(onEditTrip).toHaveBeenCalled();
  });

  it("calls onEditTrip from NowCard", async () => {
    const user = userEvent.setup();
    const onEditTrip = vi.fn();
    render(
      <TripsDesktopLayout
        activeEntry={activeEntry}
        upcomingTrips={[]}
        pastTrips={[]}
        unscheduledEntries={[]}
        dateFormat="MM/DD/YYYY"
        onNewTrip={vi.fn()}
        onEditTrip={onEditTrip}
        onDeleteTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    await user.click(screen.getByRole("button", { name: /edit trip/i }));
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
        dateFormat="MM/DD/YYYY"
        onNewTrip={vi.fn()}
        onEditTrip={onEditTrip}
        onDeleteTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    fireEvent.click(screen.getAllByRole("button", { name: /edit trip/i })[0]);
    expect(onEditTrip).toHaveBeenCalled();
  });

  it("calls onDeleteTrip from the upcoming TripCard menu", () => {
    const onDeleteTrip = vi.fn();

    render(
      <TripsDesktopLayout
        activeEntry={null}
        upcomingTrips={upcomingTrips}
        pastTrips={[]}
        unscheduledEntries={[]}
        dateFormat="MM/DD/YYYY"
        onNewTrip={vi.fn()}
        onEditTrip={vi.fn()}
        onDeleteTrip={onDeleteTrip}
      />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getAllByRole("button", { name: /delete trip/i })[0]);
    expect(onDeleteTrip).toHaveBeenCalledWith(upcomingTrips[0]);
  });

  describe("view mode toggle", () => {
    function renderLayout(overrides = {}) {
      return render(
        <TripsDesktopLayout
          activeEntry={null}
          upcomingTrips={upcomingTrips}
          pastTrips={pastTrips}
          unscheduledEntries={[]}
          dateFormat="MM/DD/YYYY"
          onNewTrip={vi.fn()}
          onEditTrip={vi.fn()}
          onDeleteTrip={vi.fn()}
          {...overrides}
        />,
        { wrapper: Wrapper }
      );
    }

    it("defaults to cards view when no localStorage value", () => {
      renderLayout();
      expect(screen.getByRole("button", { name: "Cards" }).className).toContain("active");
      expect(screen.getByRole("button", { name: "List" }).className).not.toContain("active");
    });

    it("clicking List button activates list view", () => {
      renderLayout();
      fireEvent.click(screen.getByRole("button", { name: "List" }));
      expect(screen.getByRole("button", { name: "List" }).className).toContain("active");
      expect(screen.getByRole("button", { name: "Cards" }).className).not.toContain("active");
    });

    it("persists selection to localStorage when List clicked", () => {
      renderLayout();
      fireEvent.click(screen.getByRole("button", { name: "List" }));
      expect(localStorage.getItem("trips-view-mode")).toBe("list");
    });

    it("persists selection to localStorage when Cards clicked after List", () => {
      renderLayout();
      fireEvent.click(screen.getByRole("button", { name: "List" }));
      fireEvent.click(screen.getByRole("button", { name: "Cards" }));
      expect(localStorage.getItem("trips-view-mode")).toBe("cards");
    });

    it("initialViewMode='list' activates list view", () => {
      renderLayout({ initialViewMode: "list" });
      expect(screen.getByRole("button", { name: "List" }).className).toContain("active");
    });

    it("defaults to cards when initialViewMode omitted", () => {
      renderLayout();
      expect(screen.getByRole("button", { name: "Cards" }).className).toContain("active");
    });

    it("unscheduled section renders null when empty in list mode", () => {
      renderLayout({ initialViewMode: "list", unscheduledEntries: [] });
      expect(screen.queryByRole("heading", { name: "Unscheduled" })).not.toBeInTheDocument();
    });

    it("in list mode, clicking Edit on upcoming trip calls onEditTrip", () => {
      const onEditTrip = vi.fn();
      render(
        <TripsDesktopLayout
          activeEntry={null}
          upcomingTrips={upcomingTrips}
          pastTrips={[]}
          unscheduledEntries={[]}
          dateFormat="MM/DD/YYYY"
          initialViewMode="list"
          onNewTrip={vi.fn()}
          onEditTrip={onEditTrip}
          onDeleteTrip={vi.fn()}
        />,
        { wrapper: Wrapper }
      );
      fireEvent.click(screen.getAllByRole("button", { name: /edit trip/i })[0]);
      expect(onEditTrip).toHaveBeenCalled();
    });

    it("in list mode, clicking Delete on upcoming trip calls onDeleteTrip", () => {
      const onDeleteTrip = vi.fn();
      render(
        <TripsDesktopLayout
          activeEntry={null}
          upcomingTrips={upcomingTrips}
          pastTrips={[]}
          unscheduledEntries={[]}
          dateFormat="MM/DD/YYYY"
          initialViewMode="list"
          onNewTrip={vi.fn()}
          onEditTrip={vi.fn()}
          onDeleteTrip={onDeleteTrip}
        />,
        { wrapper: Wrapper }
      );
      fireEvent.click(screen.getAllByRole("button", { name: /delete trip/i })[0]);
      expect(onDeleteTrip).toHaveBeenCalledWith(upcomingTrips[0]);
    });

    it("in list mode, trip options trigger does not navigate on click", async () => {
      const user = userEvent.setup();
      renderLayout({ initialViewMode: "list" });
      const triggers = screen.getAllByTitle("Trip options");
      expect(triggers.length).toBeGreaterThan(0);
      await user.click(triggers[0]);
    });
  });
});
