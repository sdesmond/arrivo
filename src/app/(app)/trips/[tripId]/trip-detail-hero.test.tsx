import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TripDetailPayload } from "@/data/types";
import { TripDetailHero } from "./trip-detail-hero";

vi.mock("@/components/arrivo/trip-cover", () => ({ TripCover: () => <div data-testid="trip-cover" /> }));
vi.mock("@/components/arrivo/trip-cover-controls", () => ({
  TripCoverControls: ({ canEdit }: { canEdit: boolean }) =>
    canEdit ? <div title="Cover options" data-testid="cover-controls" /> : null,
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
      ...overrides.trip,
    },
    days: [{ id: "day-1", dayNumber: 1, label: "Day 1", events: [] }],
    unscheduledEvents: [],
    docs: [],
    collaborators: [],
    packingItems: [],
    packingLists: [],
    reservations: [],
    expenses: [],
    notes: [],
    accessRole: "editor",
    ...overrides,
  };
}

describe("TripDetailHero", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("renders cover overflow trigger", () => {
    render(
      <TripDetailHero detail={buildDetail()} nowISO="2026-07-01T00:00:00Z" dateFormat="MM/DD/YYYY" onEdit={vi.fn()} />
    );

    expect(screen.getByTitle("Cover options")).toBeInTheDocument();
  });

  it("hides trip and cover editing controls from viewers", () => {
    render(
      <TripDetailHero
        detail={buildDetail({
          accessRole: "viewer",
          trip: {
            id: "trip-1",
            name: "Summer Getaway",
            status: "draft",
            coverImageUrl: "https://images.example.com/cover.jpg",
            coverPhotographer: "Casey Camera",
          },
        })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Cover options")).not.toBeInTheDocument();
  });

  it("keeps editor itinerary controls while hiding Share", () => {
    render(
      <TripDetailHero
        detail={buildDetail({ accessRole: "editor" })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
    expect(screen.getByTitle("Cover options")).toBeInTheDocument();
  });

  it("shows Share to managers", () => {
    render(
      <TripDetailHero
        detail={buildDetail({ accessRole: "manager" })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  });

  it("hides Share for a manager when no callback is available", () => {
    render(
      <TripDetailHero
        detail={buildDetail({ accessRole: "manager" })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });

  it("opens sharing controls when a manager selects Share", async () => {
    const onShare = vi.fn();
    const user = userEvent.setup();

    render(
      <TripDetailHero
        detail={buildDetail({ accessRole: "manager" })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
        onShare={onShare}
      />
    );

    await user.click(screen.getByRole("button", { name: "Share" }));

    expect(onShare).toHaveBeenCalledOnce();
  });

  it.each(["editor", "viewer"] as const)("offers Leave trip, not Share, to a %s", (accessRole) => {
    render(
      <TripDetailHero
        detail={buildDetail({ accessRole })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
        onShare={vi.fn()}
        onLeave={vi.fn()}
      />
    );

    const leaveButton = screen.getByRole("button", { name: "Leave trip Summer Getaway" });
    expect(leaveButton).toHaveTextContent("Leave trip");
    expect(leaveButton.style.minHeight).toBe("44px");
    expect(leaveButton.style.minWidth).toBe("44px");
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });

  it("never offers Leave trip to a manager, even if a callback is passed", () => {
    render(
      <TripDetailHero
        detail={buildDetail({ accessRole: "manager" })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
        onShare={vi.fn()}
        onLeave={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /Leave trip/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  });

  it("hides Leave trip when no callback is available", () => {
    render(
      <TripDetailHero
        detail={buildDetail({ accessRole: "viewer" })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /Leave trip/ })).not.toBeInTheDocument();
  });

  it("asks to leave when a viewer selects Leave trip", async () => {
    const onLeave = vi.fn();
    const user = userEvent.setup();

    render(
      <TripDetailHero
        detail={buildDetail({ accessRole: "viewer" })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
        onLeave={onLeave}
      />
    );

    await user.click(screen.getByRole("button", { name: /Leave trip/ }));

    expect(onLeave).toHaveBeenCalledOnce();
  });
});
