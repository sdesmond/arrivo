import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

import { NowCard } from "./now-card";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import type { Trip, TripEvent } from "@/data/types";

const NOW_ISO = "2026-05-13T12:00:00.000Z";

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

  it("renders edit button when onEditTrip is provided", () => {
    render(<NowCard trip={activeTrip} todayEvents={[]} onEditTrip={vi.fn()} dateFormat="MM/DD/YYYY" />, {
      wrapper: Wrapper,
    });
    expect(screen.getByTitle("Edit trip")).toBeInTheDocument();
  });

  it("calls onEditTrip when edit button is clicked", async () => {
    const user = userEvent.setup();
    const onEditTrip = vi.fn();
    render(<NowCard trip={activeTrip} todayEvents={[]} onEditTrip={onEditTrip} dateFormat="MM/DD/YYYY" />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByTitle("Edit trip"));
    expect(onEditTrip).toHaveBeenCalledWith(activeTrip);
  });

  it("does not render edit button when onEditTrip is absent", () => {
    render(<NowCard trip={activeTrip} todayEvents={[]} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.queryByTitle("Edit trip")).not.toBeInTheDocument();
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
});
