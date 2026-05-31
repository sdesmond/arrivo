import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
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

import { UnscheduledSection } from "./unscheduled-section";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import type { Trip } from "@/data/types";

const NOW_ISO = "2026-05-13T12:00:00.000Z";

const unscheduledTrips: Trip[] = [
  {
    id: "trip-1",
    name: "Unsorted Ideas",
    status: "upcoming",
  },
  {
    id: "trip-2",
    name: "Future Planning",
    status: "upcoming",
  },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

describe("UnscheduledSection", () => {
  it("renders trip names in the section", () => {
    render(
      <UnscheduledSection
        trips={unscheduledTrips}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
        dateFormat="MM/DD/YYYY"
      />,
      {
        wrapper: Wrapper,
      }
    );
    expect(screen.getAllByText("Unsorted Ideas").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Future Planning").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Unscheduled heading", () => {
    render(
      <UnscheduledSection
        trips={unscheduledTrips}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
        dateFormat="MM/DD/YYYY"
      />,
      {
        wrapper: Wrapper,
      }
    );
    expect(screen.getByRole("heading", { name: "Unscheduled" })).toBeInTheDocument();
  });

  it("does not render when trips array is empty", () => {
    const { container } = render(
      <UnscheduledSection trips={[]} onEditTrip={vi.fn()} onDeleteTrip={vi.fn()} dateFormat="MM/DD/YYYY" />,
      {
        wrapper: Wrapper,
      }
    );
    expect(container.innerHTML).toBe("");
  });

  it("links each trip to its detail page", () => {
    render(
      <UnscheduledSection
        trips={unscheduledTrips}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
        dateFormat="MM/DD/YYYY"
      />,
      {
        wrapper: Wrapper,
      }
    );
    const links = screen.getAllByRole("link");
    expect(links.some((l) => l.getAttribute("href") === "/trips/trip-1")).toBe(true);
    expect(links.some((l) => l.getAttribute("href") === "/trips/trip-2")).toBe(true);
  });

  it("renders CalendarOff icon", () => {
    render(
      <UnscheduledSection
        trips={unscheduledTrips}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
        dateFormat="MM/DD/YYYY"
      />,
      {
        wrapper: Wrapper,
      }
    );
    const svg = document.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("forwards delete actions to TripCard", async () => {
    const user = userEvent.setup();
    const onDeleteTrip = vi.fn();

    render(
      <UnscheduledSection
        trips={unscheduledTrips}
        onEditTrip={vi.fn()}
        onDeleteTrip={onDeleteTrip}
        dateFormat="MM/DD/YYYY"
      />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getAllByRole("button", { name: /delete trip/i })[0]);
    expect(onDeleteTrip).toHaveBeenCalledWith(unscheduledTrips[0]);
  });

  it("viewMode=cards renders TripCard grid (explicit prop)", () => {
    render(
      <UnscheduledSection
        trips={unscheduledTrips}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
        dateFormat="MM/DD/YYYY"
        viewMode="cards"
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getAllByTestId("trip-card-date-range").length).toBeGreaterThan(0);
  });

  it("viewMode=list renders list rows instead of card grid", () => {
    render(
      <UnscheduledSection
        trips={unscheduledTrips}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
        dateFormat="MM/DD/YYYY"
        viewMode="list"
      />,
      { wrapper: Wrapper }
    );
    expect(screen.queryByTestId("trip-card-date-range")).not.toBeInTheDocument();
    expect(screen.getAllByText("Unsorted Ideas").length).toBeGreaterThanOrEqual(1);
  });

  it("viewMode=list renders null when trips empty", () => {
    const { container } = render(
      <UnscheduledSection
        trips={[]}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
        dateFormat="MM/DD/YYYY"
        viewMode="list"
      />,
      { wrapper: Wrapper }
    );
    expect(container.innerHTML).toBe("");
  });

  it("viewMode=list forwards delete actions via row dropdown", async () => {
    const user = userEvent.setup();
    const onDeleteTrip = vi.fn();

    render(
      <UnscheduledSection
        trips={unscheduledTrips}
        onEditTrip={vi.fn()}
        onDeleteTrip={onDeleteTrip}
        dateFormat="MM/DD/YYYY"
        viewMode="list"
      />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getAllByRole("button", { name: /delete trip/i })[0]);
    expect(onDeleteTrip).toHaveBeenCalledWith(unscheduledTrips[0]);
  });

  it("viewMode=list forwards edit actions via row dropdown", async () => {
    const user = userEvent.setup();
    const onEditTrip = vi.fn();

    render(
      <UnscheduledSection
        trips={unscheduledTrips}
        onEditTrip={onEditTrip}
        onDeleteTrip={vi.fn()}
        dateFormat="MM/DD/YYYY"
        viewMode="list"
      />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getAllByRole("button", { name: /edit trip/i })[0]);
    expect(onEditTrip).toHaveBeenCalledWith(unscheduledTrips[0]);
  });

  it("viewMode=list trip options trigger does not navigate on click", async () => {
    const user = userEvent.setup();

    render(
      <UnscheduledSection
        trips={unscheduledTrips}
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
        dateFormat="MM/DD/YYYY"
        viewMode="list"
      />,
      { wrapper: Wrapper }
    );

    const triggers = screen.getAllByTitle("Trip options");
    expect(triggers.length).toBeGreaterThan(0);
    await user.click(triggers[0]);
  });
});
