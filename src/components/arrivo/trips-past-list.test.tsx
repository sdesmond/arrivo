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
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import { CollaboratorRole, type Trip } from "@/data/types";

const NOW_ISO = "2026-05-13T12:00:00.000Z";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

const pastTrips: Trip[] = [
  {
    id: "t1",
    name: "Lisbon Escape",
    status: "past",
    startDate: "2025-09-01",
    endDate: "2025-09-07",
    accessRole: CollaboratorRole.Manager,
  },
  {
    id: "t2",
    name: "NYC Visit",
    status: "past",
    startDate: "2025-11-01",
    endDate: "2025-11-05",
    accessRole: CollaboratorRole.Manager,
  },
  {
    id: "t3",
    name: "Berlin Trip",
    status: "past",
    startDate: "2025-12-01",
    endDate: "2025-12-05",
    accessRole: CollaboratorRole.Manager,
  },
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

  it("does not render delete button when onDeleteTrip is not provided", () => {
    render(<PastTripsList trips={pastTrips} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /delete trip/i })).not.toBeInTheDocument();
  });

  it.each([CollaboratorRole.Editor, CollaboratorRole.Viewer])(
    "does not render delete button for a %s even when onDeleteTrip is provided (list mode)",
    (accessRole) => {
      const trips = [{ ...pastTrips[0], accessRole }];
      render(<PastTripsList trips={trips} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} onDeleteTrip={vi.fn()} />);
      expect(screen.queryByRole("button", { name: /delete trip/i })).not.toBeInTheDocument();
    }
  );

  it("does not render edit button for a viewer (list mode)", () => {
    const trips = [{ ...pastTrips[0], accessRole: CollaboratorRole.Viewer }];
    render(<PastTripsList trips={trips} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /edit trip/i })).not.toBeInTheDocument();
  });

  it("renders edit button for an editor (list mode)", () => {
    const trips = [{ ...pastTrips[0], accessRole: CollaboratorRole.Editor }];
    render(<PastTripsList trips={trips} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} />);
    expect(screen.getByRole("button", { name: /edit trip/i })).toBeInTheDocument();
  });

  it("does not render delete button for a non-manager in cards mode", () => {
    const trips = [{ ...pastTrips[0], accessRole: CollaboratorRole.Editor }];
    render(
      <PastTripsList
        trips={trips}
        dateFormat="MM/DD/YYYY"
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
        viewMode="cards"
      />,
      { wrapper: Wrapper }
    );
    expect(screen.queryByRole("button", { name: /delete trip/i })).not.toBeInTheDocument();
  });

  it('renders "No dates" when startDate is missing', () => {
    const tripNoDates: Trip = { id: "t4", name: "Mystery Trip", status: "past" };
    render(<PastTripsList trips={[tripNoDates]} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} />);
    expect(screen.getByText("No dates")).toBeInTheDocument();
  });

  it("renders dayTotal for dateless rows", () => {
    const tripNoDates: Trip = { id: "t4", name: "Mystery Trip", status: "past", dayTotal: 3 };
    render(<PastTripsList trips={[tripNoDates]} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} />);
    expect(screen.getByText("3 DAYS")).toBeInTheDocument();
  });

  it("viewMode=list renders row layout with Past badge (default)", () => {
    render(<PastTripsList trips={pastTrips} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} viewMode="list" />);
    expect(screen.getAllByText("Past").length).toBeGreaterThan(0);
  });

  it("viewMode=cards renders TripCard grid with past status copy", () => {
    render(
      <PastTripsList
        trips={pastTrips}
        dateFormat="MM/DD/YYYY"
        onEditTrip={vi.fn()}
        onDeleteTrip={vi.fn()}
        viewMode="cards"
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getAllByText(/past/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/in -/i)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("trip-card-date-range").length).toBeGreaterThan(0);
  });

  it("trip options trigger does not navigate on click", async () => {
    const user = userEvent.setup();
    render(<PastTripsList trips={pastTrips} dateFormat="MM/DD/YYYY" onEditTrip={vi.fn()} />);
    const triggers = screen.getAllByTitle("Trip options");
    expect(triggers.length).toBeGreaterThan(0);
    await user.click(triggers[0]);
  });
});
