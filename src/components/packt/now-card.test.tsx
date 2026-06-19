import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  return {
    ...actual,
    Hotel: ({ strokeWidth, ...props }: React.SVGProps<SVGSVGElement> & { strokeWidth?: number }) => (
      <svg data-testid="hotel-icon" data-stroke-width={strokeWidth} {...props} />
    ),
  };
});

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

import { NowCard } from "./now-card";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import { formatAnchorDateTime } from "./reservation-type-badge";
import type { Trip, TripEvent } from "@/data/types";

const NOW_ISO = "2026-05-13T12:00:00.000Z";

const linkedEventNow: TripEvent = {
  id: "linked-1",
  tripId: "trip-1",
  name: "Check-in — Hotel Avenida Palace",
  startAt: "2026-05-13T11:00:00Z",
  position: new Date("2026-05-13T11:00:00Z").getTime(),
  linkedReservationId: "res-1",
  reservationType: "lodging",
};

const linkedEventNextUp: TripEvent = {
  id: "linked-2",
  tripId: "trip-1",
  name: "Check-in — Hotel Avenida Palace",
  startAt: "2026-05-13T14:00:00Z",
  position: new Date("2026-05-13T14:00:00Z").getTime(),
  linkedReservationId: "res-1",
  reservationType: "lodging",
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

const activeTrip: Trip = {
  id: "trip-1",
  name: "Tokyo Adventure",
  status: "active",
  startDate: "2026-05-10",
  endDate: "2026-05-20",
};

const todayEvents: TripEvent[] = [
  { id: "ev-1", name: "Museum Visit", startAt: "2026-05-13T10:00:00Z", position: 0 },
  { id: "ev-2", name: "Dinner", startAt: "2026-05-13T19:00:00Z", position: 1 },
];

const upcomingTrip: Trip = {
  id: "trip-2",
  name: "Paris Trip",
  status: "upcoming",
  startDate: "2026-06-01",
  endDate: "2026-06-10",
};

describe("NowCard", () => {
  it("renders trip name for active trip", () => {
    render(<NowCard trip={activeTrip} todayEvents={todayEvents} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getAllByText("Tokyo Adventure").length).toBeGreaterThanOrEqual(1);
  });

  it("renders dates in MM/DD/YYYY format", () => {
    render(<NowCard trip={activeTrip} todayEvents={[]} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText(/May 10, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/May 20, 2026/)).toBeInTheDocument();
  });

  it("renders dates in DD/MM/YYYY format", () => {
    render(<NowCard trip={activeTrip} todayEvents={[]} dateFormat="DD/MM/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText(/10 May 2026/)).toBeInTheDocument();
    expect(screen.getByText(/20 May 2026/)).toBeInTheDocument();
  });

  it("renders upcoming trip without crash", () => {
    render(<NowCard trip={upcomingTrip} todayEvents={[]} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getAllByText("Paris Trip").length).toBeGreaterThanOrEqual(1);
  });

  it("renders trip options trigger", () => {
    render(<NowCard trip={activeTrip} todayEvents={[]} onEditTrip={vi.fn()} dateFormat="MM/DD/YYYY" />, {
      wrapper: Wrapper,
    });
    expect(screen.getByRole("button", { name: /trip options/i })).toBeInTheDocument();
  });

  it("calls onEditTrip when edit trip is clicked in the dropdown", async () => {
    const user = userEvent.setup();
    const onEditTrip = vi.fn();
    render(<NowCard trip={activeTrip} todayEvents={[]} onEditTrip={onEditTrip} dateFormat="MM/DD/YYYY" />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /edit trip/i }));
    expect(onEditTrip).toHaveBeenCalledWith(activeTrip);
  });

  it("does not render edit trip item when onEditTrip is absent", () => {
    render(<NowCard trip={activeTrip} todayEvents={[]} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.queryByRole("button", { name: /edit trip/i })).not.toBeInTheDocument();
  });

  it("renders PAST TRIP label for past trips", () => {
    const pastTrip: Trip = {
      id: "trip-3",
      name: "Rome Vacation",
      status: "past",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
    };
    render(<NowCard trip={pastTrip} todayEvents={[]} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getAllByText("PAST TRIP").length).toBeGreaterThanOrEqual(1);
  });

  it("renders collaborators AvatarStack when trip has collaborators", () => {
    const tripWithCollaborators: Trip = {
      ...activeTrip,
      collaborators: [
        { name: "Alice Smith", initials: "AS", email: "alice@example.com", role: "editor" },
        { name: "Bob Jones", initials: "BJ", email: "bob@example.com", role: "viewer" },
      ],
    };
    render(<NowCard trip={tripWithCollaborators} todayEvents={[]} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByLabelText("Alice Smith, Bob Jones")).toBeInTheDocument();
  });

  it("renders current event when todayEvents has a past event", () => {
    render(<NowCard trip={activeTrip} todayEvents={todayEvents} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText("Museum Visit")).toBeInTheDocument();
  });

  it("renders next event when no current event exists", () => {
    const futureEvents: TripEvent[] = [
      { id: "ev-3", name: "Future Event", startAt: "2026-05-13T14:00:00Z", position: 0 },
    ];
    render(<NowCard trip={activeTrip} todayEvents={futureEvents} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText("Next Event")).toBeInTheDocument();
    expect(screen.getByText("Future Event")).toBeInTheDocument();
  });

  it("does not render event section when no events exist", () => {
    render(<NowCard trip={activeTrip} todayEvents={[]} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.queryByText("Now")).not.toBeInTheDocument();
    expect(screen.queryByText("Next Event")).not.toBeInTheDocument();
  });

  it("does not render collaborators section when trip has no collaborators", () => {
    render(<NowCard trip={activeTrip} todayEvents={[]} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.queryByLabelText(/alice/i)).not.toBeInTheDocument();
  });

  it("renders ACTIVE TRIP label for active trips", () => {
    render(<NowCard trip={activeTrip} todayEvents={[]} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getAllByText("ACTIVE TRIP").length).toBeGreaterThanOrEqual(1);
  });

  it("renders UPCOMING TRIP label for upcoming trips", () => {
    render(<NowCard trip={upcomingTrip} todayEvents={[]} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getAllByText("UPCOMING TRIP").length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'No dates' when startDate and endDate are missing", () => {
    const tripNoDates: Trip = { id: "trip-4", name: "No Date Trip", status: "active" };
    render(<NowCard trip={tripNoDates} todayEvents={[]} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText("No dates")).toBeInTheDocument();
  });

  it("does not render event section when events have no startAt", () => {
    const eventsNoStart: TripEvent[] = [{ id: "ev-4", name: "Open-ended", position: 0 }];
    render(<NowCard trip={activeTrip} todayEvents={eventsNoStart} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.queryByText("Open-ended")).not.toBeInTheDocument();
  });

  it("renders Linked Event with icon and badge when currently happening", () => {
    render(<NowCard trip={activeTrip} todayEvents={[linkedEventNow]} dateFormat="MM/DD/YYYY" />, {
      wrapper: Wrapper,
    });
    expect(screen.getByTestId("hotel-icon")).toBeInTheDocument();
    expect(screen.getByText("Linked")).toBeInTheDocument();
    expect(screen.getByText("Now")).toBeInTheDocument();
  });

  it("renders Linked Event with icon and badge when next up", () => {
    render(<NowCard trip={activeTrip} todayEvents={[linkedEventNextUp]} dateFormat="MM/DD/YYYY" />, {
      wrapper: Wrapper,
    });
    expect(screen.getByTestId("hotel-icon")).toBeInTheDocument();
    expect(screen.getByText("Linked")).toBeInTheDocument();
    expect(screen.getByText("Next Event")).toBeInTheDocument();
    expect(screen.queryByText("Now")).not.toBeInTheDocument();
  });

  it("uses single-button aria-label for Linked Event row", () => {
    render(<NowCard trip={activeTrip} todayEvents={[linkedEventNow]} dateFormat="MM/DD/YYYY" />, {
      wrapper: Wrapper,
    });
    const expectedLabel = `Check-in: ${formatAnchorDateTime(linkedEventNow.startAt!)} — Hotel Avenida Palace, Linked, opens Reservations`;
    const button = screen.getByRole("button", { name: expectedLabel });
    expect(button).toBeInTheDocument();
    for (const child of Array.from(button.children)) {
      expect(child).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("manual event preferred when chronologically current alongside Linked Event", () => {
    const manualEvent: TripEvent = { id: "ev-manual", name: "Breakfast", startAt: "2026-05-13T10:00:00Z", position: 0 };
    const linkedEvent: TripEvent = { ...linkedEventNow, startAt: "2026-05-13T13:00:00Z" };
    render(<NowCard trip={activeTrip} todayEvents={[manualEvent, linkedEvent]} dateFormat="MM/DD/YYYY" />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText("Breakfast")).toBeInTheDocument();
    expect(screen.queryByText("Check-in — Hotel Avenida Palace")).not.toBeInTheDocument();
  });

  it("manual event row is not a button", () => {
    render(<NowCard trip={activeTrip} todayEvents={todayEvents} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    const eventLink = screen.getByText("Museum Visit").closest("a");
    expect(eventLink).toBeInTheDocument();
    expect(screen.getByText("Museum Visit").closest("button")).not.toBeInTheDocument();
  });

  it("renders same-day Linked Event with flat aria-label (no separator in name)", () => {
    const sameDayLinked: TripEvent = {
      id: "linked-same",
      tripId: "trip-1",
      name: "Hotel Avenida Palace",
      startAt: "2026-05-13T11:00:00Z",
      position: new Date("2026-05-13T11:00:00Z").getTime(),
      linkedReservationId: "res-same",
      reservationType: "lodging",
    };
    render(<NowCard trip={activeTrip} todayEvents={[sameDayLinked]} dateFormat="MM/DD/YYYY" />, {
      wrapper: Wrapper,
    });
    const expectedLabel = `Hotel Avenida Palace: ${formatAnchorDateTime(sameDayLinked.startAt!)}, Linked, opens Reservations`;
    const button = screen.getByRole("button", { name: expectedLabel });
    expect(button).toBeInTheDocument();
  });

  it("renders Linked Event with fallback aria-label when startAt is missing", () => {
    const noStartLinked: TripEvent = {
      id: "linked-no-start",
      tripId: "trip-1",
      name: "Check-in — Hotel Avenida Palace",
      position: 0,
      linkedReservationId: "res-no-start",
      reservationType: "lodging",
    };
    render(<NowCard trip={activeTrip} todayEvents={[noStartLinked]} dateFormat="MM/DD/YYYY" />, {
      wrapper: Wrapper,
    });
    const expectedLabel = "Check-in — Hotel Avenida Palace, time not set, Linked, opens Reservations";
    const button = screen.getByRole("button", { name: expectedLabel });
    expect(button).toBeInTheDocument();
  });

  it("calls onLinkedEventTap with the linked reservation id when the Linked Event row is tapped", async () => {
    const user = userEvent.setup();
    const onLinkedEventTap = vi.fn();
    render(
      <NowCard
        trip={activeTrip}
        todayEvents={[linkedEventNow]}
        onLinkedEventTap={onLinkedEventTap}
        dateFormat="MM/DD/YYYY"
      />,
      { wrapper: Wrapper }
    );
    await user.click(screen.getByText("Linked"));
    expect(onLinkedEventTap).toHaveBeenCalledWith("res-1");
  });
});
