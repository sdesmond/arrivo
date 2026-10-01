import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChecklistItem as ChecklistEntry } from "@/data/types";
import { ChecklistItemRow } from "./checklist-item-row";
import { TripEditAccessProvider } from "./trip-edit-access";

const item: ChecklistEntry = { id: "item-1", checklistId: "cl-1", content: "Sunscreen", isChecked: false };

describe("ChecklistItemRow", () => {
  it("toggles the item from its checkbox", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ChecklistItemRow item={item} onToggle={onToggle} />);
    await user.click(screen.getByRole("button", { name: "Check item" }));
    expect(onToggle).toHaveBeenCalledWith("item-1");
  });

  it("labels a checked item's checkbox Uncheck item", () => {
    render(<ChecklistItemRow item={{ ...item, isChecked: true }} />);
    expect(screen.getByRole("button", { name: "Uncheck item" })).toBeInTheDocument();
  });

  it("saves an edited item on Enter", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ChecklistItemRow item={item} onUpdate={onUpdate} />);
    await user.click(screen.getByRole("button", { name: "Sunscreen" }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "SPF 50{Enter}");
    expect(onUpdate).toHaveBeenCalledWith("item-1", "SPF 50");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("starts editing from the keyboard and discards on Escape", () => {
    const onUpdate = vi.fn();
    render(<ChecklistItemRow item={item} onUpdate={onUpdate} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Sunscreen" }), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not save a blank edit", () => {
    const onUpdate = vi.fn();
    render(<ChecklistItemRow item={item} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: "Sunscreen" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  " } });
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("deletes the item", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<ChecklistItemRow item={item} onDelete={onDelete} />);
    await user.click(screen.getByTitle("Delete item"));
    expect(onDelete).toHaveBeenCalledWith("item-1");
  });

  describe("for a viewer", () => {
    it("shows a disabled checkbox and plain text with no delete", async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      render(
        <TripEditAccessProvider canEdit={false}>
          <ChecklistItemRow item={item} onToggle={onToggle} />
        </TripEditAccessProvider>
      );

      expect(screen.getByRole("button", { name: "Check item" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Sunscreen" })).not.toBeInTheDocument();
      expect(screen.queryByTitle("Delete item")).not.toBeInTheDocument();
      await user.click(screen.getByText("Sunscreen"));
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
  });
});
