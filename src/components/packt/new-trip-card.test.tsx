// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
