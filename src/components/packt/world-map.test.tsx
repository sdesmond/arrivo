import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WorldMap } from "./world-map";

describe("WorldMap", () => {
  it("renders an SVG", () => {
    const { container } = render(<WorldMap />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders with no pins without error", () => {
    const { container } = render(<WorldMap pins={[]} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders with 2 pins without error", () => {
    const pins = [
      { x: 500, y: 250, label: "Paris" },
      { x: 800, y: 200, label: "Tokyo" },
    ];
    const { container } = render(<WorldMap pins={pins} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders with size=sm", () => {
    const { container } = render(<WorldMap size="sm" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders with size=lg", () => {
    const { container } = render(<WorldMap size="lg" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
