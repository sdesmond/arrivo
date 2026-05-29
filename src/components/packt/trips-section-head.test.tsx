import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHead } from "./trips-section-head";

describe("SectionHead", () => {
  it("renders title", () => {
    render(<SectionHead title="Upcoming" />);
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
  });

  it("renders count when provided", () => {
    render(<SectionHead title="Upcoming" count="3 TRIPS" />);
    expect(screen.getByText("3 TRIPS")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <SectionHead title="Past">
        <button>Filter</button>
      </SectionHead>
    );
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
  });

  it("does not render count when omitted", () => {
    render(<SectionHead title="Upcoming" />);
    expect(screen.queryByText("3 TRIPS")).not.toBeInTheDocument();
  });
});
