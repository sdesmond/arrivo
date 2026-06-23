import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocsBlock } from "./docs-block";
import type { Document } from "@/data/types";

vi.mock("./event-doc-row", () => ({
  EventDocRow: ({ doc }: { doc: { id: string; name: string } }) => (
    <div data-testid={`event-doc-row-${doc.id}`}>{doc.name}</div>
  ),
}));

const docs: Document[] = [
  { id: "d1", name: "Itinerary.pdf", kind: "pdf", scope: "event" },
  { id: "d2", name: "Hotels.pdf", kind: "pdf", scope: "event" },
];

describe("DocsBlock", () => {
  it("renders doc names", () => {
    render(<DocsBlock docs={docs} onAdd={vi.fn()} />);
    expect(screen.getByText("Itinerary.pdf")).toBeInTheDocument();
    expect(screen.getByText("Hotels.pdf")).toBeInTheDocument();
  });

  it("renders an EventDocRow for each doc", () => {
    render(<DocsBlock docs={docs} onAdd={vi.fn()} />);
    expect(screen.getByTestId("event-doc-row-d1")).toBeInTheDocument();
    expect(screen.getByTestId("event-doc-row-d2")).toBeInTheDocument();
  });

  it("calls onAdd when 'Add doc' is clicked", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<DocsBlock docs={docs} onAdd={onAdd} />);
    await user.click(screen.getByRole("button", { name: /add doc/i }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("renders Add doc button with no border when docs array is empty", () => {
    render(<DocsBlock docs={[]} onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: /add doc/i })).toBeInTheDocument();
  });
});
