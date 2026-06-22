import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackingRow, SortablePackingRow } from "./packing-list-row";

const { mockUseOfflineEntitySyncStatus } = vi.hoisted(() => ({
  mockUseOfflineEntitySyncStatus: vi.fn(() => "synced"),
}));

const useSortableMock = vi.hoisted(() =>
  vi.fn(() => ({
    attributes: { "aria-roledescription": "sortable" },
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }))
);

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: useSortableMock,
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: vi.fn(() => undefined) } },
}));

vi.mock("@/lib/offline/db", () => ({
  useOfflineEntitySyncStatus: mockUseOfflineEntitySyncStatus,
}));

const itemRow = { id: "item-1", name: "Passport", done: false, position: 0 };
const labelRow = { id: "label-1", name: "Documents", done: false, position: 1, isLabel: true };
const dragHandle = <span title="Reorder Passport">grip</span>;

describe("PackingRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOfflineEntitySyncStatus.mockReturnValue("synced");
  });

  it("renders the item name", () => {
    render(<PackingRow item={itemRow} onRemove={vi.fn()} />);
    expect(screen.getByText("Passport")).toBeInTheDocument();
  });

  it("renders drag handle when provided", () => {
    render(<PackingRow item={itemRow} dragHandle={dragHandle} onRemove={vi.fn()} />);
    expect(screen.getByTitle("Reorder Passport")).toBeInTheDocument();
  });

  it("renders pending sync badge when local sync status is pending", () => {
    mockUseOfflineEntitySyncStatus.mockReturnValue("pending");

    render(<PackingRow item={itemRow} onRemove={vi.fn()} />);

    expect(screen.getByLabelText("Sync pending")).toBeInTheDocument();
  });

  it("renders a checkbox for non-label items", () => {
    render(<PackingRow item={itemRow} onRemove={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Pack Passport" })).toBeInTheDocument();
  });

  it("does not render a checkbox for label items", () => {
    render(<PackingRow item={labelRow} isLabel onRemove={vi.fn()} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders item count subtitle for label items without packed progress", () => {
    render(<PackingRow item={labelRow} isLabel itemCount={3} onRemove={vi.fn()} />);
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });

  it("renders singular item count when itemCount is 1 and no packedCount", () => {
    render(<PackingRow item={labelRow} isLabel itemCount={1} onRemove={vi.fn()} />);
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("renders packed progress subtitle when packedCount is provided", () => {
    render(<PackingRow item={labelRow} isLabel itemCount={5} packedCount={2} onRemove={vi.fn()} />);
    expect(screen.getByText("2 of 5 packed")).toBeInTheDocument();
  });

  it("renders 0 of N packed when no items are packed", () => {
    render(<PackingRow item={labelRow} isLabel itemCount={4} packedCount={0} onRemove={vi.fn()} />);
    expect(screen.getByText("0 of 4 packed")).toBeInTheDocument();
  });

  it("renders no subtitle when itemCount is not provided", () => {
    render(<PackingRow item={labelRow} isLabel onRemove={vi.fn()} />);
    expect(screen.queryByText(/items?$|packed$/)).not.toBeInTheDocument();
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
    expect(screen.getByRole("checkbox", { name: "Pack Passport" })).toHaveAttribute("aria-disabled", "true");
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

  it("applies line-through style on label when isComplete is true", () => {
    render(<PackingRow item={labelRow} isLabel isComplete onRemove={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Documents" }).className).toContain("line-through");
  });

  it("does not apply line-through style on label when isComplete is false", () => {
    render(<PackingRow item={labelRow} isLabel isComplete={false} onRemove={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Documents" }).className).not.toContain("line-through");
  });

  it("does not apply line-through style on label when isComplete is undefined", () => {
    render(<PackingRow item={labelRow} isLabel onRemove={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Documents" }).className).not.toContain("line-through");
  });

  it("clicking item name enters edit mode showing an input when onEdit is provided", async () => {
    const user = userEvent.setup();
    render(<PackingRow item={itemRow} onRemove={vi.fn()} onEdit={vi.fn()} />);
    await user.click(screen.getByText("Passport"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Passport");
  });

  it("clicking label name enters edit mode when onEdit is provided", async () => {
    const user = userEvent.setup();
    render(<PackingRow item={labelRow} isLabel onRemove={vi.fn()} onEdit={vi.fn()} />);
    await user.click(screen.getByRole("heading", { name: "Documents" }));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("pressing Enter in edit mode calls onEdit with trimmed new name", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<PackingRow item={itemRow} onRemove={vi.fn()} onEdit={onEdit} />);
    await user.click(screen.getByText("Passport"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Passport (renewed)");
    await user.keyboard("{Enter}");
    expect(onEdit).toHaveBeenCalledWith("Passport (renewed)");
  });

  it("pressing Escape in edit mode cancels and reverts to original name without calling onEdit", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<PackingRow item={itemRow} onRemove={vi.fn()} onEdit={onEdit} />);
    await user.click(screen.getByText("Passport"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Different name");
    await user.keyboard("{Escape}");
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText("Passport")).toBeInTheDocument();
  });

  it("edit mode does not call onEdit when name is unchanged", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<PackingRow item={itemRow} onRemove={vi.fn()} onEdit={onEdit} />);
    await user.click(screen.getByText("Passport"));
    await user.keyboard("{Enter}");
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("edit mode does not call onEdit when name is blank", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<PackingRow item={itemRow} onRemove={vi.fn()} onEdit={onEdit} />);
    await user.click(screen.getByText("Passport"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.keyboard("{Enter}");
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("edit input has maxLength=30", async () => {
    const user = userEvent.setup();
    render(<PackingRow item={itemRow} onRemove={vi.fn()} onEdit={vi.fn()} />);
    await user.click(screen.getByText("Passport"));
    expect(screen.getByRole("textbox")).toHaveAttribute("maxLength", "30");
  });

  it("label in edit mode shows a delete button", async () => {
    const user = userEvent.setup();
    render(<PackingRow item={labelRow} isLabel onRemove={vi.fn()} onEdit={vi.fn()} />);
    await user.click(screen.getByRole("heading", { name: "Documents" }));
    expect(screen.getByRole("button", { name: "Delete label" })).toBeInTheDocument();
  });

  it("clicking delete button in label edit mode calls onRemove", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<PackingRow item={labelRow} isLabel onRemove={onRemove} onEdit={vi.fn()} />);
    await user.click(screen.getByRole("heading", { name: "Documents" }));
    await user.click(screen.getByRole("button", { name: "Delete label" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("remove button is hidden in edit mode", async () => {
    const user = userEvent.setup();
    render(<PackingRow item={itemRow} onRemove={vi.fn()} onEdit={vi.fn()} />);
    await user.click(screen.getByText("Passport"));
    expect(screen.queryByRole("button", { name: "Remove Passport" })).not.toBeInTheDocument();
  });

  it("does not enter edit mode when onEdit is not provided", async () => {
    const user = userEvent.setup();
    render(<PackingRow item={itemRow} onRemove={vi.fn()} />);
    await user.click(screen.getByText("Passport"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  // ── Collapse toggle ──────────────────────────────────────────────────────────

  it("renders collapse toggle button on label rows when onToggleCollapse is provided", () => {
    render(<PackingRow item={labelRow} isLabel onRemove={vi.fn()} onToggleCollapse={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Collapse Documents" })).toBeInTheDocument();
  });

  it("does not render collapse toggle on label rows when onToggleCollapse is absent", () => {
    render(<PackingRow item={labelRow} isLabel onRemove={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Collapse|Expand/ })).not.toBeInTheDocument();
  });

  it("does not render collapse toggle on item rows", () => {
    render(<PackingRow item={itemRow} onRemove={vi.fn()} onToggleCollapse={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Collapse|Expand/ })).not.toBeInTheDocument();
  });

  it("aria-expanded is true when not collapsed", () => {
    render(<PackingRow item={labelRow} isLabel collapsed={false} onRemove={vi.fn()} onToggleCollapse={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Collapse Documents" })).toHaveAttribute("aria-expanded", "true");
  });

  it("aria-expanded is false when collapsed", () => {
    render(<PackingRow item={labelRow} isLabel collapsed onRemove={vi.fn()} onToggleCollapse={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Expand Documents" })).toHaveAttribute("aria-expanded", "false");
  });

  it("calls onToggleCollapse when collapse button is clicked", async () => {
    const onToggleCollapse = vi.fn();
    const user = userEvent.setup();
    render(<PackingRow item={labelRow} isLabel onRemove={vi.fn()} onToggleCollapse={onToggleCollapse} />);
    await user.click(screen.getByRole("button", { name: "Collapse Documents" }));
    expect(onToggleCollapse).toHaveBeenCalledOnce();
  });

  it("calls onToggleCollapse when label row background is clicked", async () => {
    const onToggleCollapse = vi.fn();
    const user = userEvent.setup();
    render(
      <PackingRow
        item={labelRow}
        isLabel
        itemCount={3}
        packedCount={2}
        onRemove={vi.fn()}
        onToggleCollapse={onToggleCollapse}
      />
    );
    await user.click(screen.getByText("2 of 3 packed"));
    expect(onToggleCollapse).toHaveBeenCalledOnce();
  });

  it("does not toggle collapse when label name is clicked (starts edit instead)", async () => {
    const onToggleCollapse = vi.fn();
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <PackingRow item={labelRow} isLabel onRemove={vi.fn()} onToggleCollapse={onToggleCollapse} onEdit={onEdit} />
    );
    await user.click(screen.getByRole("heading", { name: "Documents" }));
    expect(onToggleCollapse).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled(); // only called on Enter/Escape
  });

  it("does not toggle collapse when remove button is clicked", async () => {
    const onToggleCollapse = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<PackingRow item={labelRow} isLabel onRemove={onRemove} onToggleCollapse={onToggleCollapse} />);
    await user.click(screen.getByRole("button", { name: "Remove Documents" }));
    expect(onToggleCollapse).not.toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("chevron rotates based on collapsed state", () => {
    const { container, rerender } = render(
      <PackingRow item={labelRow} isLabel collapsed={false} onRemove={vi.fn()} onToggleCollapse={vi.fn()} />
    );
    const chevron = container.querySelector("[data-packing-collapse-btn] svg");
    const expandedTransform = chevron?.getAttribute("style");
    expect(expandedTransform).toContain("rotate(180deg)");

    rerender(<PackingRow item={labelRow} isLabel collapsed onRemove={vi.fn()} onToggleCollapse={vi.fn()} />);
    const collapsedChevron = container.querySelector("[data-packing-collapse-btn] svg");
    const collapsedTransform = collapsedChevron?.getAttribute("style");
    expect(collapsedTransform).not.toContain("rotate(180deg)");
  });
});

describe("SortablePackingRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOfflineEntitySyncStatus.mockReturnValue("synced");
  });

  it("passes animateLayoutChanges that returns false to useSortable", () => {
    render(<SortablePackingRow id="item-1" item={itemRow} onRemove={vi.fn()} />);
    const calls = useSortableMock.mock.calls as unknown[][];
    const config = calls[0]?.[0] as { animateLayoutChanges?: () => boolean } | undefined;
    expect(config?.animateLayoutChanges?.()).toBe(false);
  });

  it("renders drag handle for non-label items", () => {
    render(<SortablePackingRow id="item-1" item={itemRow} onRemove={vi.fn()} />);
    expect(screen.getByLabelText("Reorder Passport")).toBeInTheDocument();
  });

  it("hides the source row only while the parent marks it as active", () => {
    useSortableMock.mockReturnValueOnce({
      attributes: { "aria-roledescription": "sortable" },
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: true,
    });

    const { container, rerender } = render(
      <SortablePackingRow id="item-1" item={itemRow} isActiveDragSource onRemove={vi.fn()} />
    );

    expect(container.firstElementChild).toHaveStyle({ opacity: "0" });

    rerender(<SortablePackingRow id="item-1" item={itemRow} isActiveDragSource={false} onRemove={vi.fn()} />);

    expect(container.firstElementChild).toHaveStyle({ opacity: "1" });
  });

  it("does not render drag handle for labels", () => {
    render(<SortablePackingRow id="label-1" item={labelRow} isLabel onRemove={vi.fn()} />);
    expect(screen.queryByLabelText("Reorder Documents")).not.toBeInTheDocument();
  });
});
