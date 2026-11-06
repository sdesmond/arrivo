import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders children and stays enabled by default", () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button.querySelector("svg")).toBeNull();
  });

  describe("loading", () => {
    it("keeps the label, disables the button, and marks it busy", () => {
      render(<Button loading>Save</Button>);

      const button = screen.getByRole("button", { name: "Save" });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");
    });

    it("overlays a decorative spinner that respects reduced motion", () => {
      render(<Button loading>Save</Button>);

      const spinner = screen.getByRole("button", { name: "Save" }).querySelector("svg");
      expect(spinner).not.toBeNull();
      expect(spinner).toHaveAttribute("aria-hidden", "true");
      expect(spinner).toHaveClass("animate-spin", "motion-reduce:animate-none");
    });

    it("hides the label visually without removing it from the accessible name", () => {
      render(<Button loading>Save</Button>);

      const label = screen.getByText("Save");
      expect(label).toHaveClass("opacity-0");
      expect(label).not.toHaveAttribute("aria-hidden");
    });

    it("does not fire onClick while loading", () => {
      const onClick = vi.fn();
      render(
        <Button loading onClick={onClick}>
          Save
        </Button>
      );

      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(onClick).not.toHaveBeenCalled();
    });

    it("stays disabled when disabled is also set", () => {
      render(
        <Button loading={false} disabled>
          Save
        </Button>
      );

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-busy");
    });

    it("replaces icon-only content with the spinner while keeping the accessible name", () => {
      render(
        <Button loading size="icon" title="Refresh" aria-label="Refresh">
          <svg data-testid="icon" />
        </Button>
      );

      const button = screen.getByRole("button", { name: "Refresh" });
      expect(button).toBeDisabled();
      expect(screen.getByTestId("icon").parentElement).toHaveClass("opacity-0");
    });
  });
});
