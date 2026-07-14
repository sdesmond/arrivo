import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RouteResult, TripEvent } from "@/data/types";

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

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  return {
    ...actual,
    Hotel: ({ strokeWidth, ...props }: React.SVGProps<SVGSVGElement> & { strokeWidth?: number }) => (
      <svg data-testid="hotel-icon" data-stroke-width={strokeWidth} {...props} />
    ),
  };
});

import { NowCardEventRow } from "./now-card-event-row";

const floatingNow = new Date("2026-05-13T12:00:00.000Z");

const linkedEvent: TripEvent = {
  id: "linked-1",
  tripId: "trip-1",
  name: "Check-in — Hotel Avenida Palace",
  startAt: "2026-05-13T11:00:00Z",
  position: new Date("2026-05-13T11:00:00Z").getTime(),
  linkedReservationId: "res-1",
  reservationType: "lodging",
};

const nonLinkedEvent: TripEvent = {
  id: "ev-1",
  name: "Museum Visit",
  startAt: "2026-05-13T10:00:00Z",
  position: 0,
};

const locatedEvent: TripEvent = {
  id: "ev-located",
  name: "Louvre Museum",
  startAt: "2026-05-13T14:00:00Z",
  position: 0,
  locationLat: 48.8606,
  locationLng: 2.3376,
};

describe("NowCardEventRow", () => {
  it("renders a linked event as a button with the linked aria-label", () => {
    render(<NowCardEventRow tripId="trip-1" event={linkedEvent} eventLabel="Now" floatingNow={floatingNow} />);
    expect(screen.getByTestId("hotel-icon")).toBeInTheDocument();
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label");
  });

  it("calls onLinkedEventTap with the linked reservation id when tapped", async () => {
    const user = userEvent.setup();
    const onLinkedEventTap = vi.fn();
    render(
      <NowCardEventRow
        tripId="trip-1"
        event={linkedEvent}
        eventLabel="Now"
        floatingNow={floatingNow}
        onLinkedEventTap={onLinkedEventTap}
      />
    );
    await user.click(screen.getByRole("button"));
    expect(onLinkedEventTap).toHaveBeenCalledWith("res-1");
  });

  it("renders a non-linked event as a Link, not a button", () => {
    render(
      <NowCardEventRow tripId="trip-1" event={nonLinkedEvent} eventLabel="Next Event" floatingNow={floatingNow} />
    );
    const eventLink = screen.getByText("Museum Visit").closest("a");
    expect(eventLink).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not render a DistanceTimePill when the event has no coordinates", () => {
    render(
      <NowCardEventRow tripId="trip-1" event={nonLinkedEvent} eventLabel="Next Event" floatingNow={floatingNow} />
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not render a DistanceTimePill when routeResult is not provided, even with coordinates", () => {
    render(<NowCardEventRow tripId="trip-1" event={locatedEvent} eventLabel="Next Event" floatingNow={floatingNow} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /directions|maps/i })).not.toBeInTheDocument();
  });

  it("passes routeResult and transitMode to DistanceTimePill for a located event", () => {
    const routeResult: RouteResult = { status: "ready", distanceMeters: 500, durationSeconds: 300 };
    render(
      <NowCardEventRow
        tripId="trip-1"
        event={locatedEvent}
        eventLabel="Next Event"
        floatingNow={floatingNow}
        routeResult={routeResult}
        transitMode="walk"
      />
    );
    expect(screen.getByText("500 m · 5 min walk")).toBeInTheDocument();
  });

  it("renders the DistanceTimePill as a DOM sibling of the event Link, never nested inside it", () => {
    const routeResult: RouteResult = { status: "ready", distanceMeters: 500, durationSeconds: 300 };
    render(
      <NowCardEventRow
        tripId="trip-1"
        event={locatedEvent}
        eventLabel="Next Event"
        floatingNow={floatingNow}
        routeResult={routeResult}
        onOpenMaps={vi.fn()}
      />
    );
    const pill = screen.getByRole("button", { name: /Open directions to Louvre Museum/ });
    const eventLink = screen.getByText("Louvre Museum").closest("a");
    expect(pill.closest("a")).toBeNull();
    expect(eventLink).not.toContainElement(pill);
  });

  it("wires onOpenMaps through to the DistanceTimePill", async () => {
    const user = userEvent.setup();
    const onOpenMaps = vi.fn();
    const routeResult: RouteResult = { status: "ready", distanceMeters: 500, durationSeconds: 300 };
    render(
      <NowCardEventRow
        tripId="trip-1"
        event={locatedEvent}
        eventLabel="Next Event"
        floatingNow={floatingNow}
        routeResult={routeResult}
        onOpenMaps={onOpenMaps}
      />
    );
    await user.click(screen.getByRole("button", { name: /Open directions to Louvre Museum/ }));
    expect(onOpenMaps).toHaveBeenCalledTimes(1);
  });
});
