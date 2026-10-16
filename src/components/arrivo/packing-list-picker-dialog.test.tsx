import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackingListPickerDialog } from "./packing-list-picker-dialog";
import type { TripPackingList, PackingTemplate } from "@/data/types";

const lists: TripPackingList[] = [
  { id: "list-1", tripId: "trip-1", name: "Carry-On", position: 0 },
  { id: "list-2", tripId: "trip-1", name: "Checked Bag", position: 1 },
];

const templates: PackingTemplate[] = [
  { id: "tmpl-1", name: "Beach Weekend" },
  { id: "tmpl-2", name: "City Break" },
];

describe("PackingListPickerDialog", () => {
  it("shows empty state when no sources provided", () => {
    render(<PackingListPickerDialog open onClose={vi.fn()} packingLists={[]} templates={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("No packing lists or templates yet")).toBeInTheDocument();
  });

  it("renders 'Trip Packing Lists' section with list names", () => {
    render(<PackingListPickerDialog open onClose={vi.fn()} packingLists={lists} templates={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("Trip Packing Lists")).toBeInTheDocument();
    expect(screen.getByText("Carry-On")).toBeInTheDocument();
    expect(screen.getByText("Checked Bag")).toBeInTheDocument();
  });

  it("renders 'Templates' section with template names", () => {
    render(
      <PackingListPickerDialog open onClose={vi.fn()} packingLists={[]} templates={templates} onSelect={vi.fn()} />
    );
    expect(screen.getByText("Templates")).toBeInTheDocument();
    expect(screen.getByText("Beach Weekend")).toBeInTheDocument();
    expect(screen.getByText("City Break")).toBeInTheDocument();
  });

  it("clicking a packing list calls onSelect with correct type and id", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<PackingListPickerDialog open onClose={vi.fn()} packingLists={lists} templates={[]} onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "Carry-On" }));
    expect(onSelect).toHaveBeenCalledWith("packing-list", "list-1");
  });

  it("clicking a template calls onSelect with correct type and id", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <PackingListPickerDialog open onClose={vi.fn()} packingLists={[]} templates={templates} onSelect={onSelect} />
    );
    await user.click(screen.getByRole("button", { name: "Beach Weekend" }));
    expect(onSelect).toHaveBeenCalledWith("template", "tmpl-1");
  });

  it("does not render when open is false", () => {
    render(
      <PackingListPickerDialog
        open={false}
        onClose={vi.fn()}
        packingLists={lists}
        templates={templates}
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByText("Carry-On")).not.toBeInTheDocument();
  });
});
