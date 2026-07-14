import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockRouterPush } = vi.hoisted(() => ({ mockRouterPush: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock("./use-route-for-event", () => ({
  useRouteForEvent: () => ({ routeResult: { status: "loading" }, geolocationStatus: null }),
}));

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

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: React.MouseEventHandler }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import { TripsActiveEntryPanel } from "./trips-active-entry-panel";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import type { TripListEntry } from "@/data/types";

const NOW_ISO = "2026-05-13T12:00:00.000Z";

const activeEntry: TripListEntry = {
  trip: { id: "trip-1", name: "Tokyo Adventure", status: "active", startDate: "2026-05-10", endDate: "2026-05-20" },
  todayEvents: [
    {
      id: "linked-1",
      tripId: "trip-1",
      name: "Check-in — Hotel Avenida Palace",
      startAt: "2026-05-13T11:00:00Z",
      position: 0,
      linkedReservationId: "res-1",
      reservationType: "lodging",
    },
  ],
  summaryEvents: [
    {
      id: "linked-1",
      tripId: "trip-1",
      name: "Check-in — Hotel Avenida Palace",
      startAt: "2026-05-13T11:00:00Z",
      position: 0,
      linkedReservationId: "res-1",
      reservationType: "lodging",
    },
  ],
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

describe("TripsActiveEntryPanel", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the active trip via NowCard", () => {
    render(
      <TripsActiveEntryPanel
        activeEntry={activeEntry}
        dateFormat="MM/DD/YYYY"
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.getAllByText("Tokyo Adventure").length).toBeGreaterThanOrEqual(1);
  });

  it("passes onEditTrip through to NowCard with the trip id", async () => {
    const user = userEvent.setup();
    const onEditTrip = vi.fn();
    render(
      <TripsActiveEntryPanel
        activeEntry={activeEntry}
        dateFormat="MM/DD/YYYY"
        onEditTrip={onEditTrip}
        onDeleteTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: /edit trip/i }));
    expect(onEditTrip).toHaveBeenCalledWith("trip-1");
  });

  it("passes onDeleteTrip through to NowCard with the trip", async () => {
    const user = userEvent.setup();
    const onDeleteTrip = vi.fn();
    render(
      <TripsActiveEntryPanel
        activeEntry={activeEntry}
        dateFormat="MM/DD/YYYY"
        onEditTrip={vi.fn()}
        onDeleteTrip={onDeleteTrip}
      />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: /delete trip/i }));
    expect(onDeleteTrip).toHaveBeenCalledWith(activeEntry.trip);
  });

  it("navigates to the Reservations highlight deep link when a linked event is tapped", async () => {
    const user = userEvent.setup();
    render(
      <TripsActiveEntryPanel
        activeEntry={activeEntry}
        dateFormat="MM/DD/YYYY"
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: /opens reservations/i }));

    expect(mockRouterPush).toHaveBeenCalledWith("/trips/trip-1?tab=res&highlight=res-1");
  });
});
