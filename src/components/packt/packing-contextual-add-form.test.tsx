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
});
