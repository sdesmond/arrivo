// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewTripCard } from "./new-trip-card";

describe("NewTripCard", () => {
  it("renders 'Start a new trip' text", () => {
    render(<NewTripCard onNewTrip={vi.fn()} />);
    expect(screen.getByText("Start a new trip")).toBeInTheDocument();
  });

  it("renders as a button", () => {
    render(<NewTripCard onNewTrip={vi.fn()} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("applies hover styles on mouseenter", () => {
    render(<NewTripCard onNewTrip={vi.fn()} />);
    const button = screen.getByRole("button");
    fireEvent.mouseEnter(button);
    expect(button.style.borderColor).toBe("var(--accent-brand)");
    expect(button.style.background).toBe("var(--accent-soft)");
  });

  it("restores default styles on mouseleave", () => {
    render(<NewTripCard onNewTrip={vi.fn()} />);
    const button = screen.getByRole("button");
    fireEvent.mouseEnter(button);
    fireEvent.mouseLeave(button);
    expect(button.style.borderColor).toBe("var(--line-strong)");
    expect(button.style.background).toBe("transparent");
  });

  it("calls onNewTrip when clicked", async () => {
    const user = userEvent.setup();
    const onNewTrip = vi.fn();
    render(<NewTripCard onNewTrip={onNewTrip} />);
    await user.click(screen.getByRole("button", { name: /start a new trip/i }));
    expect(onNewTrip).toHaveBeenCalledOnce();
  });
});
