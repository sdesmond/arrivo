// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DayCardHeader } from "./day-card-header";

const baseProps = {
  dateDisplay: "Wed, May 13",
  isToday: false,
  stopsCount: 2,
  subtitle: "Exploring the city",
  open: true,
  onToggle: vi.fn(),
  dayNumber: 1,
  onUpdateDay: vi.fn(),
};

describe("DayCardHeader", () => {
  it("renders the date display string", () => {
    render(<DayCardHeader {...baseProps} />);
    expect(screen.getByText("Wed, May 13")).toBeInTheDocument();
  });

  it("renders the stops count", () => {
    render(<DayCardHeader {...baseProps} stopsCount={3} />);
    expect(screen.getByText("3 stops")).toBeInTheDocument();
  });

  it("renders Active badge when isToday is true", () => {
    render(<DayCardHeader {...baseProps} isToday={true} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("does not render Active badge when isToday is false", () => {
    render(<DayCardHeader {...baseProps} isToday={false} />);
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("toggle button calls onToggle when clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<DayCardHeader {...baseProps} onToggle={onToggle} />);
    await user.click(screen.getByRole("button", { name: /Wed, May 13/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("toggle button has aria-expanded reflecting open state", () => {
    render(<DayCardHeader {...baseProps} open={true} />);
    expect(screen.getByRole("button", { name: /Wed, May 13/i })).toHaveAttribute("aria-expanded", "true");
  });

  it("clicking subtitle display activates the editor input", async () => {
    const user = userEvent.setup();
    render(<DayCardHeader {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /exploring the city/i }));
    expect(screen.getByDisplayValue("Exploring the city")).toBeInTheDocument();
  });

  it("blur saves new value via onUpdateDay", async () => {
    const user = userEvent.setup();
    const onUpdateDay = vi.fn();
    render(<DayCardHeader {...baseProps} onUpdateDay={onUpdateDay} />);
    await user.click(screen.getByRole("button", { name: /exploring the city/i }));
    const input = screen.getByDisplayValue("Exploring the city");
    await user.clear(input);
    await user.type(input, "Changed subtitle");
    fireEvent.blur(input);
    expect(onUpdateDay).toHaveBeenCalledWith(1, { subtitle: "Changed subtitle" });
  });

  it("Enter key saves the subtitle", async () => {
    const user = userEvent.setup();
    const onUpdateDay = vi.fn();
    render(<DayCardHeader {...baseProps} onUpdateDay={onUpdateDay} />);
    await user.click(screen.getByRole("button", { name: /exploring the city/i }));
    const input = screen.getByDisplayValue("Exploring the city");
    await user.clear(input);
    await user.type(input, "New note{Enter}");
    expect(onUpdateDay).toHaveBeenCalledWith(1, { subtitle: "New note" });
  });

  it("Escape cancels the edit without calling onUpdateDay", async () => {
    const user = userEvent.setup();
    const onUpdateDay = vi.fn();
    render(<DayCardHeader {...baseProps} onUpdateDay={onUpdateDay} />);
    await user.click(screen.getByRole("button", { name: /exploring the city/i }));
    await user.keyboard("{Escape}");
    expect(onUpdateDay).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /exploring the city/i })).toBeInTheDocument();
  });

  it("renders placeholder text when subtitle is undefined", () => {
    render(<DayCardHeader {...baseProps} subtitle={undefined} />);
    expect(screen.getByText("Add a note")).toBeInTheDocument();
  });

  it("renders an accessible removal control only when supplied", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const { rerender } = render(<DayCardHeader {...baseProps} />);
    expect(screen.queryByRole("button", { name: "Remove day" })).not.toBeInTheDocument();

    rerender(<DayCardHeader {...baseProps} onRemove={onRemove} removeDisabled={false} />);
    await user.click(screen.getByRole("button", { name: "Remove day" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("disables the removal control while a removal is pending", () => {
    render(<DayCardHeader {...baseProps} onRemove={vi.fn()} removeDisabled={true} />);
    expect(screen.getByRole("button", { name: "Remove day" })).toBeDisabled();
  });
});
