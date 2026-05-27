// @vitest-environment jsdom
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
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
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

import { MobilePastTab } from "./mobile-past-tab";
import type { Trip } from "@/data/types";

const pastTrips: Trip[] = [
  { id: "trip-1", name: "Lisbon Escape", status: "past", startDate: "2025-09-01", endDate: "2025-09-07" },
  { id: "trip-2", name: "NYC Visit", status: "past", startDate: "2025-11-01", endDate: "2025-11-05" },
];

describe("MobilePastTab", () => {
  it("renders past trip names", () => {
    render(<MobilePastTab trips={pastTrips} dateFormat="MM/DD/YYYY" />);
    expect(screen.getByText("Lisbon Escape")).toBeInTheDocument();
    expect(screen.getByText("NYC Visit")).toBeInTheDocument();
  });

  it("renders a delete option with destructive styling", () => {
    render(<MobilePastTab trips={[pastTrips[0]]} dateFormat="MM/DD/YYYY" onDeleteTrip={vi.fn()} />);
    expect(screen.getByRole("button", { name: /delete trip/i })).toHaveAttribute("data-variant", "destructive");
  });

  it("calls the edit and delete callbacks for the selected trip", async () => {
    const user = userEvent.setup();
    const onEditTrip = vi.fn();
    const onDeleteTrip = vi.fn();

    render(
      <MobilePastTab
        trips={[pastTrips[0]]}
        dateFormat="MM/DD/YYYY"
        onEditTrip={onEditTrip}
        onDeleteTrip={onDeleteTrip}
      />
    );

    await user.click(screen.getByRole("button", { name: /edit trip/i }));
    await user.click(screen.getByRole("button", { name: /delete trip/i }));

    expect(onEditTrip).toHaveBeenCalledWith(pastTrips[0]);
    expect(onDeleteTrip).toHaveBeenCalledWith(pastTrips[0]);
  });
});
