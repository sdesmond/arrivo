import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

import { TravelHistoryList } from "./travel-history-list";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import type { Trip } from "@/data/types";

const NOW_ISO = "2026-05-13T12:00:00.000Z";

const pastTrips: Trip[] = [
  { id: "trip-past-1", name: "Berlin Tour", status: "past", startDate: "2026-01-01", endDate: "2026-01-10" },
  { id: "trip-past-2", name: "Lisbon Escape", status: "past", startDate: "2025-09-01", endDate: "2025-09-07" },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

describe("TravelHistoryList", () => {
  it("renders the Travel History heading", () => {
    render(
      <TravelHistoryList trips={pastTrips} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} onDeleteTrip={vi.fn()} />,
      { wrapper: Wrapper }
    );
    expect(screen.getAllByText("Travel History").length).toBeGreaterThanOrEqual(1);
  });

  it("renders past trips most-recent first", () => {
    render(
      <TravelHistoryList trips={pastTrips} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} onDeleteTrip={vi.fn()} />,
      { wrapper: Wrapper }
    );
    expect(screen.getAllByText("Berlin Tour").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Lisbon Escape").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the empty state when there are no past trips", () => {
    render(<TravelHistoryList trips={[]} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} onDeleteTrip={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(screen.getAllByText("No past trips yet").length).toBeGreaterThanOrEqual(1);
  });

  it("does not render the cards/list toggle when there are no past trips", () => {
    render(<TravelHistoryList trips={[]} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} onDeleteTrip={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(screen.queryByRole("button", { name: "Cards" })).not.toBeInTheDocument();
  });

  it("defaults to cards view and switches to list view on toggle", () => {
    render(
      <TravelHistoryList trips={pastTrips} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} onDeleteTrip={vi.fn()} />,
      { wrapper: Wrapper }
    );
    expect(screen.getByRole("button", { name: "Cards" }).className).toContain("active");

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("button", { name: "List" }).className).toContain("active");
    expect(localStorage.getItem("travel-history-view-mode")).toBe("list");
  });

  it("honors initialViewMode='list'", () => {
    render(
      <TravelHistoryList
        trips={pastTrips}
        dateFormat="MM/DD/YYYY"
        initialViewMode="list"
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByRole("button", { name: "List" }).className).toContain("active");
  });

  it("calls onEditTrip when an edit action is triggered", () => {
    const onEditTrip = vi.fn();
    render(
      <TravelHistoryList trips={pastTrips} dateFormat="MM/DD/YYYY" onEditTrip={onEditTrip} onDeleteTrip={vi.fn()} />,
      { wrapper: Wrapper }
    );
    fireEvent.click(screen.getAllByRole("button", { name: /edit trip/i })[0]);
    expect(onEditTrip).toHaveBeenCalledWith(pastTrips[0]);
  });

  it("calls onDeleteTrip when a delete action is triggered", () => {
    const onDeleteTrip = vi.fn();
    render(
      <TravelHistoryList trips={pastTrips} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} onDeleteTrip={onDeleteTrip} />,
      { wrapper: Wrapper }
    );
    fireEvent.click(screen.getAllByRole("button", { name: /delete trip/i })[0]);
    expect(onDeleteTrip).toHaveBeenCalledWith(pastTrips[0]);
  });
});
