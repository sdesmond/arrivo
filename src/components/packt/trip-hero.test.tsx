import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripHero } from "./trip-hero";

describe("TripHero", () => {
  const props = {
    name: "Tokyo Adventure",
    country: "Japan",
    countryCode: "JP",
    startDate: "2026-05-01",
    endDate: "2026-05-10",
    dayN: 3,
    dayTotal: 10,
    places: 9,
    docs: 5,
    collaborators: 2,
    dateFormat: "MM/DD/YYYY",
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

  it("renders dates in MM/DD/YYYY format", () => {
    render(<TripHero {...props} dateFormat="MM/DD/YYYY" />);
    expect(screen.getByText(/May 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/May 10, 2026/)).toBeInTheDocument();
  });

  it("renders dates in DD/MM/YYYY format", () => {
    render(<TripHero {...props} dateFormat="DD/MM/YYYY" />);
    expect(screen.getByText(/1 May 2026/)).toBeInTheDocument();
    expect(screen.getByText(/10 May 2026/)).toBeInTheDocument();
  });
});
