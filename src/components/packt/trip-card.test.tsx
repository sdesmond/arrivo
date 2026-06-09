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

import { TripCard } from "./trip-card";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import type { Trip } from "@/data/types";

const NOW_ISO = "2026-05-13T12:00:00.000Z";

const baseTrip: Trip = {
  id: "trip-1",
  name: "Tokyo Adventure",
  status: "upcoming",
  startDate: "2026-06-01",
  endDate: "2026-06-10",
  collaborators: [
    { name: "Alice Smith", email: "alice@example.com", initials: "AS", role: "editor" },
    { name: "Bob Jones", email: "bob@example.com", initials: "BJ", role: "viewer" },
  ],
  docs: [
    { id: "doc-1", name: "Itinerary.pdf", kind: "pdf", scope: "trip", offline: false },
    { id: "doc-2", name: "Hotels.pdf", kind: "pdf", scope: "trip", offline: false },
    { id: "doc-3", name: "Flights.pdf", kind: "pdf", scope: "trip", offline: false },
  ],
};

const defaultHandlers = { onEditTrip: vi.fn(), onDeleteTrip: vi.fn() };

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

describe("TripCard", () => {
  it("renders the trip name", () => {
    render(<TripCard trip={baseTrip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getAllByText("Tokyo Adventure").length).toBeGreaterThanOrEqual(1);
  });

  it("renders dates in MM/DD/YYYY format", () => {
    render(<TripCard trip={baseTrip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText(/Jun 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Jun 10, 2026/)).toBeInTheDocument();
  });

  it("renders dates in DD/MM/YYYY format", () => {
    render(<TripCard trip={baseTrip} {...defaultHandlers} dateFormat="DD/MM/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText(/1 Jun 2026/)).toBeInTheDocument();
    expect(screen.getByText(/10 Jun 2026/)).toBeInTheDocument();
  });

  it("renders the collaborator count", () => {
    render(<TripCard trip={baseTrip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders the day count", () => {
    render(<TripCard trip={baseTrip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText("10 days")).toBeInTheDocument();
  });

  it("renders the persisted dayTotal for dateless trips", () => {
    const trip = { ...baseTrip, startDate: undefined, endDate: undefined, dayTotal: 3 };
    render(<TripCard trip={trip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText("3 days")).toBeInTheDocument();
  });

  it("renders the doc count", () => {
    render(<TripCard trip={baseTrip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText("3 docs")).toBeInTheDocument();
  });

  it("always renders the trip options trigger", () => {
    render(<TripCard trip={baseTrip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: /trip options/i })).toBeInTheDocument();
  });

  it("does not render 'Open →' text", () => {
    render(<TripCard trip={baseTrip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.queryByText(/open/i)).not.toBeInTheDocument();
  });

  it("calls onEditTrip with the trip when Edit trip is clicked", async () => {
    const user = userEvent.setup();
    const onEditTrip = vi.fn();
    render(<TripCard trip={baseTrip} onEditTrip={onEditTrip} onDeleteTrip={vi.fn()} dateFormat="MM/DD/YYYY" />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /edit trip/i }));
    expect(onEditTrip).toHaveBeenCalledOnce();
    expect(onEditTrip).toHaveBeenCalledWith(baseTrip);
  });

  it("calls onDeleteTrip with the trip when Delete trip is clicked", async () => {
    const user = userEvent.setup();
    const onDeleteTrip = vi.fn();

    render(<TripCard trip={baseTrip} onEditTrip={vi.fn()} onDeleteTrip={onDeleteTrip} dateFormat="MM/DD/YYYY" />, {
      wrapper: Wrapper,
    });

    const deleteButton = screen.getByRole("button", { name: /delete trip/i });
    expect(deleteButton).toHaveAttribute("data-variant", "destructive");
    await user.click(deleteButton);

    expect(onDeleteTrip).toHaveBeenCalledOnce();
    expect(onDeleteTrip).toHaveBeenCalledWith(baseTrip);
  });

  it("links to the trip detail page", () => {
    render(<TripCard trip={baseTrip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `/trips/${baseTrip.id}`);
  });

  it("renders without collaborators", () => {
    const trip = { ...baseTrip, collaborators: undefined };
    render(<TripCard trip={trip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getAllByText("Tokyo Adventure").length).toBeGreaterThanOrEqual(1);
  });

  it("does not render avatar initials when collaborators is empty array", () => {
    const trip = { ...baseTrip, collaborators: [] };
    render(<TripCard trip={trip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.queryByText("AS")).not.toBeInTheDocument();
    expect(screen.queryByText("BJ")).not.toBeInTheDocument();
  });

  it("renders without docs field", () => {
    const trip = { ...baseTrip, docs: undefined };
    render(<TripCard trip={trip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getAllByText("Tokyo Adventure").length).toBeGreaterThanOrEqual(1);
  });

  it("renders trip starting today (inDays=0)", () => {
    const trip = { ...baseTrip, startDate: "2026-05-13", endDate: "2026-05-20" };
    render(<TripCard trip={trip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getAllByText("Tokyo Adventure").length).toBeGreaterThanOrEqual(1);
  });

  it("renders unscheduled badge when startDate is null", () => {
    const trip = { ...baseTrip, startDate: undefined, endDate: undefined };
    render(<TripCard trip={trip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText("unscheduled")).toBeInTheDocument();
  });

  it("renders past badge instead of a negative countdown for past trips", () => {
    const trip = { ...baseTrip, startDate: "2026-04-01", endDate: "2026-04-05" };
    render(<TripCard trip={trip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText("past")).toBeInTheDocument();
    expect(screen.queryByText(/in -/i)).not.toBeInTheDocument();
  });

  it("renders No dates when startDate is null", () => {
    const trip = { ...baseTrip, startDate: undefined, endDate: undefined };
    render(<TripCard trip={trip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText("No dates")).toBeInTheDocument();
  });

  it("renders 'X / Y packed' when trip has packingProgress", () => {
    const trip = { ...baseTrip, packingProgress: { checked: 3, total: 5 } };
    render(<TripCard trip={trip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText("3 / 5 packed")).toBeInTheDocument();
  });

  it("renders '0 / 5 packed' when nothing is checked yet", () => {
    const trip = { ...baseTrip, packingProgress: { checked: 0, total: 5 } };
    render(<TripCard trip={trip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.getByText("0 / 5 packed")).toBeInTheDocument();
  });

  it("does not render packing count when packingProgress is undefined", () => {
    render(<TripCard trip={baseTrip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.queryByText(/packed/)).not.toBeInTheDocument();
  });

  it("does not render packing count when packingProgress.total is 0", () => {
    const trip = { ...baseTrip, packingProgress: { checked: 0, total: 0 } };
    render(<TripCard trip={trip} {...defaultHandlers} dateFormat="MM/DD/YYYY" />, { wrapper: Wrapper });
    expect(screen.queryByText(/packed/)).not.toBeInTheDocument();
  });
});
