// @vitest-environment jsdom
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
  DropdownMenuItem: ({
    children,
    onClick,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler;
    variant?: "default" | "destructive";
  }) => (
    <button data-variant={variant} onClick={onClick}>
      {children}
    </button>
  ),
}));

import { PastTripsList } from "./trips-past-list";
import type { Trip } from "@/data/types";

const pastTrips: Trip[] = [
  {
    id: "t1",
    name: "Lisbon Escape",
    status: "past",
    startDate: "2025-09-01",
    endDate: "2025-09-07",
  },
  { id: "t2", name: "NYC Visit", status: "past", startDate: "2025-11-01", endDate: "2025-11-05" },
  { id: "t3", name: "Berlin Trip", status: "past", startDate: "2025-12-01", endDate: "2025-12-05" },
];

describe("PastTripsList", () => {
  it("renders trip names", () => {
    render(<PastTripsList trips={pastTrips} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} />);
    expect(screen.getByText("Lisbon Escape")).toBeInTheDocument();
    expect(screen.getByText("NYC Visit")).toBeInTheDocument();
    expect(screen.getByText("Berlin Trip")).toBeInTheDocument();
  });

  it("renders without error for empty array", () => {
    const { container } = render(<PastTripsList trips={[]} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders trip options trigger button", () => {
    render(<PastTripsList trips={pastTrips} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} />);
    expect(screen.getAllByTitle("Trip options").length).toBeGreaterThan(0);
  });

  it("clicking Edit trip calls onEditTrip with the correct trip", async () => {
    const user = userEvent.setup();
    const onEditTrip = vi.fn();
    render(<PastTripsList trips={pastTrips} dateFormat="MM/DD/YYYY" onEditTrip={onEditTrip} />);
    const editBtns = screen.getAllByRole("button", { name: /edit trip/i });
    await user.click(editBtns[0]);
    expect(onEditTrip).toHaveBeenCalledOnce();
    expect(onEditTrip).toHaveBeenCalledWith(pastTrips[0]);
  });

  it("renders date and day count for each trip", () => {
    render(<PastTripsList trips={[pastTrips[0]]} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} />);
    expect(screen.getByText("Sep 1, 2025")).toBeInTheDocument();
    expect(screen.getByText(/7 DAYS/)).toBeInTheDocument();
  });

  it("renders and calls the destructive delete action", async () => {
    const user = userEvent.setup();
    const onDeleteTrip = vi.fn();

    render(
      <PastTripsList trips={[pastTrips[0]]} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} onDeleteTrip={onDeleteTrip} />
    );

    const deleteButton = screen.getByRole("button", { name: /delete trip/i });
    expect(deleteButton).toHaveAttribute("data-variant", "destructive");
    await user.click(deleteButton);

    expect(onDeleteTrip).toHaveBeenCalledWith(pastTrips[0]);
  });
});
