import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Icon } from "./icon";

describe("Icon", () => {
  it("renders a named icon", () => {
    const { container } = render(<Icon name="MapPin" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("returns null for unknown icon name", () => {
    const { container } = render(<Icon name={"NonExistentIcon" as "MapPin"} />);
    expect(container.firstChild).toBeNull();
  });

  it("applies custom size", () => {
    const { container } = render(<Icon name="Star" size={24} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("applies default strokeWidth", () => {
    const { container } = render(<Icon name="MapPin" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("stroke-width", "1.5");
  });
});
