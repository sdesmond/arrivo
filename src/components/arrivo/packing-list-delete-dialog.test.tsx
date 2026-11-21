import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackingListDeleteDialog } from "./packing-list-delete-dialog";

describe("PackingListDeleteDialog", () => {
  it("renders nothing without a pending delete", () => {
    render(<PackingListDeleteDialog pendingDelete={null} onConfirm={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryByText(/Delete/)).not.toBeInTheDocument();
  });

  it.each([
    [1, "This list contains 1 item."],
    [4, "This list contains 4 items."],
  ])("names the list and its %i item(s)", (itemCount, message) => {
    render(
      <PackingListDeleteDialog
        pendingDelete={{ listId: "list", listName: "Bag", itemCount }}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(/Delete .Bag.\?/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(message.replace(".", "\\.")))).toBeInTheDocument();
  });

  it("confirms the pending list id", async () => {
    const onConfirm = vi.fn();
    render(
      <PackingListDeleteDialog
        pendingDelete={{ listId: "list", listName: "Bag", itemCount: 2 }}
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete List" }));
    expect(onConfirm).toHaveBeenCalledWith("list");
  });

  it("dismisses on Cancel", async () => {
    const onDismiss = vi.fn();
    render(
      <PackingListDeleteDialog
        pendingDelete={{ listId: "list", listName: "Bag", itemCount: 2 }}
        onConfirm={vi.fn()}
        onDismiss={onDismiss}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
