import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MiniMapRail } from "./mini-map-rail";

describe("MiniMapRail", () => {
  it("renders without error", () => {
    const { container } = render(<MiniMapRail />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders an SVG for the map", () => {
    const { container } = render(<MiniMapRail />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders the RailPanel header", () => {
    render(<MiniMapRail />);
    expect(screen.getByText(/today's route/i)).toBeInTheDocument();
  });

  it("renders the meta string", () => {
    render(<MiniMapRail />);
    expect(screen.getByText(/stops/i)).toBeInTheDocument();
  });

  it("renders the current location text", () => {
    render(<MiniMapRail />);
    expect(screen.getByText(/Hamarikyu/)).toBeInTheDocument();
  });

  it("renders the Open map button", () => {
    render(<MiniMapRail />);
    expect(screen.getByRole("button", { name: /open map/i })).toBeInTheDocument();
  });

  it("renders the SVG path element", () => {
    const { container } = render(<MiniMapRail />);
    expect(container.querySelector("path")).toBeInTheDocument();
  });

  it("renders the SVG circle pins", () => {
    const { container } = render(<MiniMapRail />);
    expect(container.querySelectorAll("circle")).toHaveLength(5);
  });
});
