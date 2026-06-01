import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackingListView } from "./packing-list-view";
import type { PackingItem } from "@/data/types";

const groupedItems: PackingItem[] = [
  { id: "ungrouped-1", name: "Passport", done: false, position: 0 },
  { id: "label-1", name: "Documents", done: false, position: 1, isLabel: true },
  { id: "item-1", name: "Phone charger", done: false, position: 2 },
  { id: "label-2", name: "Clothes", done: false, position: 3, isLabel: true },
  { id: "item-2", name: "Socks", done: false, position: 4 },
];

describe("PackingListView", () => {
  it("renders the empty state prompt when there are no items", () => {
    render(<PackingListView tripId="trip-1" items={[]} onAddItem={vi.fn()} onRemoveItem={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Your packing list is empty" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Packing item name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add label" })).toBeInTheDocument();
  });

  it("renders section labels distinctly and keeps ungrouped items below labeled sections", () => {
    const { container } = render(
      <PackingListView tripId="trip-1" items={groupedItems} onAddItem={vi.fn()} onRemoveItem={vi.fn()} />
    );

    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clothes" })).toBeInTheDocument();
    expect(screen.getByText("Ungrouped")).toBeInTheDocument();

    const rowNames = Array.from(container.querySelectorAll("[data-packing-kind]")).map((row) =>
      row.querySelector("[data-packing-name]")?.textContent?.trim()
    );

    expect(rowNames).toEqual(["Documents", "Phone charger", "Clothes", "Socks", "Passport"]);
    expect(container.querySelectorAll('[data-packing-kind="label"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-packing-kind="item"]')).toHaveLength(3);
  });

  it("submits a plain-text item from the form", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn();

    render(<PackingListView tripId="trip-1" items={[]} onAddItem={onAddItem} onRemoveItem={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Passport");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(onAddItem).toHaveBeenCalledWith("Passport", undefined);
    expect(screen.getByRole("textbox", { name: "Packing item name" })).toHaveValue("");
  });

  it("submits a section label from the form", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn();

    render(<PackingListView tripId="trip-1" items={[]} onAddItem={onAddItem} onRemoveItem={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Documents");
    await user.click(screen.getByRole("button", { name: "Add label" }));

    expect(onAddItem).toHaveBeenCalledWith("Documents", true);
  });

  it("removes an item when the remove button is clicked", async () => {
    const user = userEvent.setup();
    const onRemoveItem = vi.fn();

    render(<PackingListView tripId="trip-1" items={groupedItems} onAddItem={vi.fn()} onRemoveItem={onRemoveItem} />);

    await user.click(screen.getByRole("button", { name: "Remove Passport" }));

    expect(onRemoveItem).toHaveBeenCalledWith("ungrouped-1");
  });

  it("applies 44px minimum touch-target sizing to interactive controls", () => {
    render(<PackingListView tripId="trip-1" items={groupedItems} onAddItem={vi.fn()} onRemoveItem={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: "Packing item name" }).className).toContain("h-11");
    expect(screen.getByRole("button", { name: "Add item" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Add item" }).className).toContain("min-w-11");
    expect(screen.getByRole("button", { name: "Add label" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Add label" }).className).toContain("min-w-11");
    expect(screen.getByRole("button", { name: "Remove Passport" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Remove Passport" }).className).toContain("min-w-11");
  });
});
