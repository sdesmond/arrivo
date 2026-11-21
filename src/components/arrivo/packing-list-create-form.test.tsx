import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackingListCreateForm } from "./packing-list-create-form";

function renderForm(overrides: Partial<React.ComponentProps<typeof PackingListCreateForm>> = {}) {
  const props = {
    hasLists: true,
    onCreateList: vi.fn(async () => "new-list"),
    onCreated: vi.fn(),
    ...overrides,
  };
  render(<PackingListCreateForm {...props} />);
  return props;
}

describe("PackingListCreateForm", () => {
  it("shows the empty state with a 44px New List button when there are no lists", () => {
    renderForm({ hasLists: false });
    expect(screen.getByText("No packing lists yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New List" })).toHaveClass("h-11");
  });

  it("gives the form controls 44px targets", async () => {
    renderForm();
    const newList = screen.getByRole("button", { name: "New List" });
    expect(newList).toHaveClass("h-11");
    await userEvent.click(newList);
    expect(screen.getByRole("textbox", { name: "Packing list name" })).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: "Create" })).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("h-11");
  });

  it("creates a trimmed list, closes the form and reports the new id", async () => {
    const props = renderForm();
    await userEvent.click(screen.getByRole("button", { name: "New List" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Packing list name" }), "  Carry-On  {Enter}");
    expect(props.onCreateList).toHaveBeenCalledWith("Carry-On");
    expect(props.onCreated).toHaveBeenCalledWith("new-list", "Carry-On");
    expect(screen.queryByRole("textbox", { name: "Packing list name" })).not.toBeInTheDocument();
  });

  it("keeps the typed name and the open form when the create fails", async () => {
    const props = renderForm({ onCreateList: vi.fn(async () => undefined) });
    await userEvent.click(screen.getByRole("button", { name: "New List" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Packing list name" }), "Carry-On");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(props.onCreateList).toHaveBeenCalledWith("Carry-On");
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Packing list name" })).toHaveValue("Carry-On");
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  });

  it("does not submit a blank name", async () => {
    const props = renderForm();
    await userEvent.click(screen.getByRole("button", { name: "New List" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Packing list name" }), "   {Enter}");
    expect(props.onCreateList).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it.each([
    ["Escape", async () => userEvent.keyboard("{Escape}")],
    ["Cancel", async () => userEvent.click(screen.getByRole("button", { name: "Cancel" }))],
  ])("closes and clears the form on %s", async (_label, dismiss) => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "New List" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Packing list name" }), "Draft");
    await dismiss();
    expect(screen.queryByRole("textbox", { name: "Packing list name" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "New List" }));
    expect(screen.getByRole("textbox", { name: "Packing list name" })).toHaveValue("");
  });
});
