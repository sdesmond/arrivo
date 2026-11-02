import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArrivoBrand } from "./arrivo-brand";

describe("ArrivoBrand", () => {
  it("renders the app name next to the logo", () => {
    const { container } = render(<ArrivoBrand />);
    expect(screen.getByRole("img", { name: "Arrivo" })).toHaveAttribute(
      "src",
      expect.stringContaining("arrivo-text.svg")
    );
    expect(container.querySelector("img")).toHaveAttribute("src", expect.stringContaining("arrivo-logo.svg"));
    expect(screen.getAllByRole("img")).toHaveLength(1);
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
    expect(logo).toHaveAttribute("width", "37");
    expect(logo).toHaveAttribute("height", "40");
    const wordmark = screen.getByRole("img", { name: "Arrivo" });
    expect(wordmark).toHaveAttribute("height", "27");
    expect(wordmark).toHaveAttribute("width", "93");
  });

  it("defaults the logo to 24px", () => {
    const { container } = render(<ArrivoBrand />);
    expect(container.querySelector("img")).toHaveAttribute("height", "24");
    expect(container.querySelector("img")).toHaveAttribute("width", "22");
    expect(screen.getByRole("img", { name: "Arrivo" })).toHaveAttribute("height", "16");
  });

  it("merges a custom className", () => {
    const { container } = render(<ArrivoBrand className="mb-6" />);
    expect(container.firstChild).toHaveClass("mb-6");
  });
});
