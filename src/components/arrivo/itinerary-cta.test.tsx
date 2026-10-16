import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItineraryCta } from "./itinerary-cta";

describe("ItineraryCta", () => {
  it("shows the zero-reservations copy when reservationCount is 0", () => {
    render(<ItineraryCta reservationCount={0} onActivate={vi.fn()} />);

    expect(
      screen.getByRole("button", {
        name: "Add reservations for hotels, rentals, and more — opens the Reservations tab",
      })
    ).toBeInTheDocument();
  });

  it("shows the add-another copy when reservationCount is 1 or more", () => {
    render(<ItineraryCta reservationCount={1} onActivate={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Add another reservation — opens the Reservations tab" })
    ).toBeInTheDocument();
  });

  it("renders a single button with the full copy as its accessible name", () => {
    render(<ItineraryCta reservationCount={3} onActivate={vi.fn()} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("delegates to onActivate when clicked", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<ItineraryCta reservationCount={0} onActivate={onActivate} />);

    await user.click(screen.getByRole("button"));

    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
