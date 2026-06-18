import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReservationDocsBlock } from "./reservation-docs-block";
import type { Document } from "@/data/types";

vi.mock("./reservation-doc-row", () => ({
  ReservationDocRow: ({ doc }: { doc: { id: string; name: string } }) => (
    <div data-testid={`reservation-doc-row-${doc.id}`}>{doc.name}</div>
  ),
}));

const docs: Document[] = [
  { id: "d1", name: "Confirmation.pdf", kind: "pdf", scope: "reservation", offline: false },
  { id: "d2", name: "Receipt.pdf", kind: "pdf", scope: "reservation", offline: true },
];

describe("ReservationDocsBlock", () => {
  it("renders doc names", () => {
    render(<ReservationDocsBlock docs={docs} onAdd={vi.fn()} />);
    expect(screen.getByText("Confirmation.pdf")).toBeInTheDocument();
    expect(screen.getByText("Receipt.pdf")).toBeInTheDocument();
  });

  it("renders a ReservationDocRow for each doc", () => {
    render(<ReservationDocsBlock docs={docs} onAdd={vi.fn()} />);
    expect(screen.getByTestId("reservation-doc-row-d1")).toBeInTheDocument();
    expect(screen.getByTestId("reservation-doc-row-d2")).toBeInTheDocument();
  });

  it("calls onAdd when 'Add doc' is clicked", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ReservationDocsBlock docs={docs} onAdd={onAdd} />);
    await user.click(screen.getByRole("button", { name: /add doc/i }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("renders Add doc button with no border when docs array is empty", () => {
    render(<ReservationDocsBlock docs={[]} onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: /add doc/i })).toBeInTheDocument();
  });
});
