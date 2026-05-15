// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripHero } from "./trip-hero";

describe("TripHero", () => {
  const props = {
    name: "Tokyo Adventure",
    country: "Japan",
    countryCode: "JP",
    startDate: "May 1",
    endDate: "May 10",
    dayN: 3,
    dayTotal: 10,
    places: 9,
    docs: 5,
    collaborators: 2,
  };

  it("renders the trip name", () => {
    render(<TripHero {...props} />);
    expect(screen.getByText("Tokyo Adventure")).toBeInTheDocument();
  });

  it("renders day count info", () => {
    render(<TripHero {...props} />);
    expect(screen.getByText(/10 days/i)).toBeInTheDocument();
  });

  it("renders places count", () => {
    render(<TripHero {...props} />);
    expect(screen.getByText(/9 places/i)).toBeInTheDocument();
  });

  it("renders docs count", () => {
    render(<TripHero {...props} />);
    expect(screen.getByText(/5 docs/i)).toBeInTheDocument();
  });
});
