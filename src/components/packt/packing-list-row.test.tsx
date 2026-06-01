import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackingRow, SortablePackingRow } from "./packing-list-row";

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: vi.fn(() => ({
    attributes: { "aria-roledescription": "sortable" },
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: vi.fn(() => undefined) } },
}));

const itemRow = { id: "item-1", name: "Passport", done: false, position: 0 };
const labelRow = { id: "label-1", name: "Documents", done: false, position: 1, isLabel: true };
const dragHandle = <span title="Reorder Passport">grip</span>;

describe("PackingRow", () => {
  it("renders the item name", () => {
    render(<PackingRow item={itemRow} onRemove={vi.fn()} />);
    expect(screen.getByText("Passport")).toBeInTheDocument();
  });

  it("renders drag handle when provided", () => {
    render(<PackingRow item={itemRow} dragHandle={dragHandle} onRemove={vi.fn()} />);
    expect(screen.getByTitle("Reorder Passport")).toBeInTheDocument();
  });

  it("renders a checkbox for non-label items", () => {
    render(<PackingRow item={itemRow} onRemove={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Pack Passport" })).toBeInTheDocument();
  });

  it("does not render a checkbox for label items", () => {
    render(<PackingRow item={labelRow} isLabel onRemove={vi.fn()} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders section label subtitle for label items", () => {
    render(<PackingRow item={labelRow} isLabel onRemove={vi.fn()} />);
    expect(screen.getByText("Section label")).toBeInTheDocument();
  });

  it("calls onRemove when remove button is clicked", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<PackingRow item={itemRow} onRemove={onRemove} />);
    await user.click(screen.getByRole("button", { name: "Remove Passport" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("calls onToggle when checkbox is clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<PackingRow item={itemRow} onRemove={vi.fn()} onToggle={onToggle} />);
    await user.click(screen.getByRole("checkbox", { name: "Pack Passport" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("disables the toggle button when pending", () => {
    render(<PackingRow item={itemRow} isPending onRemove={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Pack Passport" })).toBeDisabled();
  });

  it("applies data-packing-kind attribute for item and label", () => {
    const { rerender } = render(<PackingRow item={itemRow} onRemove={vi.fn()} />);
    expect(screen.getByText("Passport").closest("[data-packing-kind]")).toHaveAttribute("data-packing-kind", "item");
    rerender(<PackingRow item={labelRow} isLabel onRemove={vi.fn()} />);
    expect(screen.getByText("Documents").closest("[data-packing-kind]")).toHaveAttribute("data-packing-kind", "label");
  });

  it("applies line-through style for done items", () => {
    const doneItem = { ...itemRow, done: true };
    const { rerender } = render(<PackingRow item={doneItem} onRemove={vi.fn()} />);
    expect(screen.getByText("Passport").className).toContain("line-through");
    rerender(<PackingRow item={itemRow} onRemove={vi.fn()} />);
    expect(screen.getByText("Passport").className).not.toContain("line-through");
  });
});

describe("SortablePackingRow", () => {
  it("renders drag handle for non-label items", () => {
    render(<SortablePackingRow id="item-1" item={itemRow} onRemove={vi.fn()} />);
    expect(screen.getByLabelText("Reorder Passport")).toBeInTheDocument();
  });

  it("does not render drag handle for labels", () => {
    render(<SortablePackingRow id="label-1" item={labelRow} isLabel onRemove={vi.fn()} />);
    expect(screen.queryByLabelText("Reorder Documents")).not.toBeInTheDocument();
  });
});
