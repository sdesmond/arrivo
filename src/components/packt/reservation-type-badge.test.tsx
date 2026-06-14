import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReservationType } from "@/data/types";
import { RESERVATION_TYPE_META, ReservationTypeBadge } from "./reservation-type-badge";

describe("RESERVATION_TYPE_META", () => {
  it.each([
    [ReservationType.Flight, "Flight"],
    [ReservationType.Train, "Train"],
    [ReservationType.Bus, "Bus"],
    [ReservationType.Ferry, "Ferry"],
    [ReservationType.RentalCar, "Rental Car"],
    [ReservationType.Lodging, "Lodging"],
    [ReservationType.Cruise, "Cruise"],
    [ReservationType.Other, "Other"],
  ])("has a label and icon for %s", (type, label) => {
    const meta = RESERVATION_TYPE_META[type];
    expect(meta.label).toBe(label);
    expect(meta.icon).toBeDefined();
  });

  it("uses a distinct icon for cruise from ferry", () => {
    expect(RESERVATION_TYPE_META.cruise.icon).not.toBe(RESERVATION_TYPE_META.ferry.icon);
  });
});

describe("ReservationTypeBadge", () => {
  it("renders the label for the given type", () => {
    render(<ReservationTypeBadge type={ReservationType.Lodging} />);
    expect(screen.getByText("Lodging")).toBeInTheDocument();
  });
});
