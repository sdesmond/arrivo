import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReservationDocsBlock } from "./reservation-docs-block";
import type { Document } from "@/data/types";

vi.mock("./reservation-doc-row", () => ({
  ReservationDocRow: ({ doc, tripId }: { tripId: string; doc: { id: string; name: string } }) => (
    <div data-trip-id={tripId} data-testid={`reservation-doc-row-${doc.id}`}>
      {doc.name}
    </div>
  ),
}));

const docs: Document[] = [
  { id: "d1", name: "Confirmation.pdf", kind: "pdf", scope: "reservation" },
  { id: "d2", name: "Receipt.pdf", kind: "pdf", scope: "reservation" },
];

describe("ReservationDocsBlock", () => {
  it("renders doc names", () => {
    render(<ReservationDocsBlock tripId="trip-1" docs={docs} onAdd={vi.fn()} />);
    expect(screen.getByText("Confirmation.pdf")).toBeInTheDocument();
    expect(screen.getByText("Receipt.pdf")).toBeInTheDocument();
  });

  it("renders a ReservationDocRow for each doc", () => {
    render(<ReservationDocsBlock tripId="trip-1" docs={docs} onAdd={vi.fn()} />);
    expect(screen.getByTestId("reservation-doc-row-d1")).toBeInTheDocument();
    expect(screen.getByTestId("reservation-doc-row-d2")).toBeInTheDocument();
  });

  it("calls onAdd when 'Add doc' is clicked", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ReservationDocsBlock tripId="trip-1" docs={docs} onAdd={onAdd} />);
    await user.click(screen.getByRole("button", { name: /add doc/i }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("renders Add doc button with no border when docs array is empty", () => {
    render(<ReservationDocsBlock tripId="trip-1" docs={[]} onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: /add doc/i })).toBeInTheDocument();
  });
});

it("passes trip authorization to each document row", () => {
  render(<ReservationDocsBlock tripId="trip-1" docs={docs} onAdd={vi.fn()} />);
  for (const row of screen.getAllByTestId(/doc-row/)) expect(row).toHaveAttribute("data-trip-id", "trip-1");
});
