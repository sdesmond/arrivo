import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextualAddForm } from "./packing-contextual-add-form";

describe("ContextualAddForm", () => {
  it("submits the trimmed name with afterItemId and labelId, then clears the input", async () => {
    const onAddItem = vi.fn();
    const user = userEvent.setup();

    render(
      <ContextualAddForm
        placeholder='Add item under "Documents"…'
        afterItemId="label-1"
        labelId="label-1"
        onAddItem={onAddItem}
      />
    );

    const input = screen.getByPlaceholderText('Add item under "Documents"…');
    await user.type(input, "  Visa  ");
    await user.keyboard("{Enter}");

    expect(onAddItem).toHaveBeenCalledWith("Visa", false, "label-1", undefined, "label-1");
    expect(input).toHaveValue("");
  });

  it("returns focus to the input after a successful add", async () => {
    const onAddItem = vi.fn();
    const user = userEvent.setup();

    render(<ContextualAddForm placeholder="Add item…" labelId={null} onAddItem={onAddItem} />);

    const input = screen.getByPlaceholderText("Add item…");
    await user.type(input, "Passport");
    await user.keyboard("{Enter}");

    expect(document.activeElement).toBe(input);
  });

  it("does not submit a blank value", async () => {
    const onAddItem = vi.fn();
    const user = userEvent.setup();

    render(<ContextualAddForm placeholder="Add item…" labelId={null} onAddItem={onAddItem} />);

    await user.type(screen.getByPlaceholderText("Add item…"), "   ");
    await user.keyboard("{Enter}");

    expect(onAddItem).not.toHaveBeenCalled();
  });

  it("does not submit while an add is already in flight", async () => {
    const onAddItem = vi.fn();
    const user = userEvent.setup();

    render(<ContextualAddForm placeholder="Add item…" labelId={null} isAdding onAddItem={onAddItem} />);

    const input = screen.getByPlaceholderText("Add item…");
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add item here" })).toBeDisabled();

    await user.keyboard("{Enter}");
    expect(onAddItem).not.toHaveBeenCalled();
  });

  it("calls onAddItem with isLabel=true when isLabel prop is true", async () => {
    const onAddItem = vi.fn();
    const user = userEvent.setup();

    render(<ContextualAddForm placeholder="New section…" isLabel onAddItem={onAddItem} />);

    const input = screen.getByPlaceholderText("New section…");
    await user.type(input, "Beach Gear");
    await user.keyboard("{Enter}");

    expect(onAddItem).toHaveBeenCalledWith("Beach Gear", true, undefined, undefined, undefined);
  });

  it("has title 'Add section here' when isLabel=true", () => {
    const onAddItem = vi.fn();
    render(<ContextualAddForm placeholder="New section…" isLabel onAddItem={onAddItem} />);
    expect(screen.getByRole("button", { name: "Add section here" })).toBeInTheDocument();
  });

  it("has title 'Add item here' when isLabel=false", () => {
    const onAddItem = vi.fn();
    render(<ContextualAddForm placeholder="Add item…" onAddItem={onAddItem} />);
    expect(screen.getByRole("button", { name: "Add item here" })).toBeInTheDocument();
  });
});
