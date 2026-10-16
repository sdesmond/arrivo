import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceRowLinkedEvent } from "./place-row-linked-event";
import type { TripEvent } from "@/data/types";

const linkedPlace: TripEvent = {
  id: "linked-1",
  tripId: "trip-1",
  name: "Check-in — Torel Avantgarde",
  startAt: "2030-06-16T15:00:00Z",
  position: new Date("2030-06-16T15:00:00Z").getTime(),
  linkedReservationId: "reservation-1",
  reservationType: "lodging",
};

describe("PlaceRowLinkedEvent", () => {
  it("renders linked event as a button with a ChevronRight icon", () => {
    render(<PlaceRowLinkedEvent place={linkedPlace} linkedAriaLabel="Check-in" linkedMetaLabel="Some meta" />);
    const button = screen.getByRole("button", { name: "Check-in" });
    expect(button.querySelector("svg")).toBeInTheDocument();
  });

  it("calls onLinkedEventTap with the linked reservation id when clicked", async () => {
    const user = userEvent.setup();
    const onLinkedEventTap = vi.fn();
    render(
      <PlaceRowLinkedEvent
        place={linkedPlace}
        onLinkedEventTap={onLinkedEventTap}
        linkedAriaLabel="Check-in"
        linkedMetaLabel="Some meta"
      />
    );
    await user.click(screen.getByRole("button", { name: "Check-in" }));
    expect(onLinkedEventTap).toHaveBeenCalledWith("reservation-1");
  });

  it("renders the linkedAriaLabel on the button", () => {
    render(<PlaceRowLinkedEvent place={linkedPlace} linkedAriaLabel="Custom aria label" linkedMetaLabel="Some meta" />);
    expect(screen.getByRole("button", { name: "Custom aria label" })).toBeInTheDocument();
  });

  it("renders linkedMetaLabel when provided", () => {
    render(
      <PlaceRowLinkedEvent place={linkedPlace} linkedAriaLabel="Check-in" linkedMetaLabel="From lodging reservation" />
    );
    expect(screen.getByText("From lodging reservation")).toBeInTheDocument();
  });

  it("does not render a meta line when linkedMetaLabel is not provided", () => {
    render(<PlaceRowLinkedEvent place={linkedPlace} linkedAriaLabel="Check-in" />);
    expect(screen.getByText(linkedPlace.name)).toBeInTheDocument();
  });
});
