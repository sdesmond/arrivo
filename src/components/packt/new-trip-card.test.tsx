// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewTripCard } from "./new-trip-card";

describe("NewTripCard", () => {
  it("renders 'Start a new trip' text", () => {
    render(<NewTripCard />);
    expect(screen.getByText("Start a new trip")).toBeInTheDocument();
  });

  it("renders as a button", () => {
    render(<NewTripCard />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("applies hover styles on mouseenter", () => {
    render(<NewTripCard />);
    const button = screen.getByRole("button");
    fireEvent.mouseEnter(button);
    expect(button.style.borderColor).toBe("var(--accent-brand)");
    expect(button.style.background).toBe("var(--accent-soft)");
  });

  it("restores default styles on mouseleave", () => {
    render(<NewTripCard />);
    const button = screen.getByRole("button");
    fireEvent.mouseEnter(button);
    fireEvent.mouseLeave(button);
    expect(button.style.borderColor).toBe("var(--line-strong)");
    expect(button.style.background).toBe("transparent");
  });
});
