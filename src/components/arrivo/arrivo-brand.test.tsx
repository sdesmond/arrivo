import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArrivoBrand } from "./arrivo-brand";

describe("ArrivoBrand", () => {
  it("renders the app name next to the logo", () => {
    const { container } = render(<ArrivoBrand />);
    expect(screen.getByText("Arrivo")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeInTheDocument();
  });

  it("marks the logo decorative so the name is announced once", () => {
    const { container } = render(<ArrivoBrand />);
    const logo = container.querySelector("img");
    expect(logo).toHaveAttribute("alt", "");
    expect(logo).toHaveAttribute("aria-hidden", "true");
  });

  it("sizes the logo from the size prop", () => {
    const { container } = render(<ArrivoBrand size={40} />);
    const logo = container.querySelector("img");
    expect(logo).toHaveAttribute("width", "40");
    expect(logo).toHaveAttribute("height", "40");
  });

  it("defaults the logo to 24px", () => {
    const { container } = render(<ArrivoBrand />);
    expect(container.querySelector("img")).toHaveAttribute("width", "24");
  });

  it("merges a custom className", () => {
    const { container } = render(<ArrivoBrand className="mb-6" />);
    expect(container.firstChild).toHaveClass("mb-6");
  });
});
