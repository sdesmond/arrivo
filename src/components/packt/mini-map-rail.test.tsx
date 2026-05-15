// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
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
});
