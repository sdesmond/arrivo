import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LinkedEventBadge } from "./linked-event-badge";

describe("LinkedEventBadge", () => {
  it("renders the text 'Linked'", () => {
    render(<LinkedEventBadge />);

    expect(screen.getByText("Linked")).toBeInTheDocument();
  });

  it("renders with aria-hidden attribute", () => {
    render(<LinkedEventBadge />);

    expect(screen.getByText("Linked")).toHaveAttribute("aria-hidden", "true");
  });

  it("uses the Badge component", () => {
    render(<LinkedEventBadge />);

    expect(screen.getByText("Linked").className).toContain("bg-secondary");
  });
});
