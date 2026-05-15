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
  useTheme: () => ({ resolvedTheme: "light" }),
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

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

describe("TripCard", () => {
  it("renders the trip name", () => {
    render(<TripCard trip={baseTrip} />, { wrapper: Wrapper });
    // TripCover also renders the name, so use getAllByText and check at least one matches
    expect(screen.getAllByText("Tokyo Adventure").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the date range", () => {
    render(<TripCard trip={baseTrip} />, { wrapper: Wrapper });
    expect(screen.getByText(/2026-06-01/)).toBeInTheDocument();
    expect(screen.getByText(/2026-06-10/)).toBeInTheDocument();
  });

  it("renders the collaborator count", () => {
    render(<TripCard trip={baseTrip} />, { wrapper: Wrapper });
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders the doc count", () => {
    render(<TripCard trip={baseTrip} />, { wrapper: Wrapper });
    expect(screen.getByText("3 docs")).toBeInTheDocument();
  });

  it("renders edit button when onEditTrip is provided", () => {
    render(<TripCard trip={baseTrip} onEditTrip={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: /edit trip/i })).toBeInTheDocument();
  });

  it("does not render edit button when onEditTrip is absent", () => {
    render(<TripCard trip={baseTrip} />, { wrapper: Wrapper });
    expect(screen.queryByRole("button", { name: /edit trip/i })).not.toBeInTheDocument();
  });

  it("calls onEditTrip with the trip when edit button is clicked", async () => {
    const user = userEvent.setup();
    const onEditTrip = vi.fn();
    render(<TripCard trip={baseTrip} onEditTrip={onEditTrip} />, { wrapper: Wrapper });
    await user.click(screen.getByRole("button", { name: /edit trip/i }));
    expect(onEditTrip).toHaveBeenCalledOnce();
    expect(onEditTrip).toHaveBeenCalledWith(baseTrip);
  });

  it("links to the trip detail page", () => {
    render(<TripCard trip={baseTrip} />, { wrapper: Wrapper });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `/trips/${baseTrip.id}`);
  });

  it("renders without collaborators", () => {
    const trip = { ...baseTrip, collaborators: undefined };
    render(<TripCard trip={trip} />, { wrapper: Wrapper });
    expect(screen.getAllByText("Tokyo Adventure").length).toBeGreaterThanOrEqual(1);
  });

  it("renders without docs field", () => {
    const trip = { ...baseTrip, docs: undefined };
    render(<TripCard trip={trip} />, { wrapper: Wrapper });
    expect(screen.getAllByText("Tokyo Adventure").length).toBeGreaterThanOrEqual(1);
  });

  it("renders trip starting today (inDays=0)", () => {
    const trip = { ...baseTrip, startDate: "2026-05-13", endDate: "2026-05-20" };
    render(<TripCard trip={trip} />, { wrapper: Wrapper });
    expect(screen.getAllByText("Tokyo Adventure").length).toBeGreaterThanOrEqual(1);
  });
});
