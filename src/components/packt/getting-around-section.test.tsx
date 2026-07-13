import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GettingAroundSection } from "./getting-around-section";
import { TransitMode } from "@/data/types";

describe("GettingAroundSection", () => {
  it("renders a section titled Getting Around with 3 segments", () => {
    render(<GettingAroundSection transitMode={TransitMode.Drive} onTransitModeChange={vi.fn()} />);
    expect(screen.getByText("Getting Around")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Walk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drive" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transit" })).toBeInTheDocument();
  });

  it("pre-selects the segment matching the transitMode prop", () => {
    render(<GettingAroundSection transitMode={TransitMode.Transit} onTransitModeChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Transit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Walk" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Drive" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onTransitModeChange when a different segment is clicked", async () => {
    const user = userEvent.setup();
    const onTransitModeChange = vi.fn();
    render(<GettingAroundSection transitMode={TransitMode.Drive} onTransitModeChange={onTransitModeChange} />);
    await user.click(screen.getByRole("button", { name: "Walk" }));
    expect(onTransitModeChange).toHaveBeenCalledWith(TransitMode.Walk);
  });

  it("does not call onTransitModeChange when clicking the already-selected segment", async () => {
    const user = userEvent.setup();
    const onTransitModeChange = vi.fn();
    render(<GettingAroundSection transitMode={TransitMode.Drive} onTransitModeChange={onTransitModeChange} />);
    await user.click(screen.getByRole("button", { name: "Drive" }));
    expect(onTransitModeChange).not.toHaveBeenCalled();
  });

  it("each segment meets the 44x44px minimum interactive target", () => {
    render(<GettingAroundSection transitMode={TransitMode.Drive} onTransitModeChange={vi.fn()} />);
    for (const name of ["Walk", "Drive", "Transit"]) {
      const segment = screen.getByRole("button", { name });
      expect(segment.className).toMatch(/\bh-11\b/);
      expect(segment.className).toMatch(/\bmin-w-11\b/);
    }
  });

  it("styles the selected segment with accent-soft/accent-ink and unselected with fg-3", () => {
    render(<GettingAroundSection transitMode={TransitMode.Drive} onTransitModeChange={vi.fn()} />);
    const selected = screen.getByRole("button", { name: "Drive" });
    const unselected = screen.getByRole("button", { name: "Walk" });
    expect(selected.className).toMatch(/aria-pressed:bg-accent-soft/);
    expect(selected.className).toMatch(/aria-pressed:text-accent-ink/);
    expect(unselected.className).toMatch(/\btext-fg-3\b/);
  });

  it("disables all segments when disabled is true", () => {
    render(<GettingAroundSection transitMode={TransitMode.Drive} onTransitModeChange={vi.fn()} disabled />);
    for (const name of ["Walk", "Drive", "Transit"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("supports roving arrow-key focus with Home/End jumping to first/last segment", async () => {
    const user = userEvent.setup();
    render(<GettingAroundSection transitMode={TransitMode.Drive} onTransitModeChange={vi.fn()} />);
    const walk = screen.getByRole("button", { name: "Walk" });
    const drive = screen.getByRole("button", { name: "Drive" });
    const transit = screen.getByRole("button", { name: "Transit" });

    await user.tab();
    expect(walk).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(drive).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(transit).toHaveFocus();

    await user.keyboard("{Home}");
    expect(walk).toHaveFocus();

    await user.keyboard("{End}");
    expect(transit).toHaveFocus();
  });
});
