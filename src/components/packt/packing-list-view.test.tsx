import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const dndContextState = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));

vi.mock("@dnd-kit/core", () => ({
  DndContext: (props: { children: ReactNode }) => {
    dndContextState.props = props;
    return <>{props.children}</>;
  },
  DragOverlay: ({ children }: { children: ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(() => []),
  pointerWithin: vi.fn(() => []),
  rectIntersection: vi.fn(() => []),
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn() })),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSortable: useSortableMock,
  verticalListSortingStrategy: {},
  sortableKeyboardCoordinates: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: vi.fn(() => undefined) } },
}));

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackingListView } from "./packing-list-view";
import type { PackingItem, PackingTemplate } from "@/data/types";

vi.mock("./template-pull-dialog", () => ({
  TemplatePullDialog: ({
    open,
    templates,
    onOpenChange,
    onPull,
  }: {
    open: boolean;
    templates: PackingTemplate[];
    onOpenChange: (v: boolean) => void;
    onPull: (ids: string[]) => Promise<unknown>;
  }) =>
    open ? (
      <div role="dialog" aria-label="Pull from templates">
        {templates.map((template) => (
          <span key={template.id}>{template.name}</span>
        ))}
        <button onClick={() => void onPull(["t1"])}>Trigger pull</button>
        <button onClick={() => onOpenChange(false)}>Close dialog</button>
      </div>
    ) : null,
}));

vi.mock("./save-as-template-dialog", () => ({
  SaveAsTemplateDialog: ({
    open,
    onClose,
    onSave,
  }: {
    open: boolean;
    onClose: () => void;
    onSave: (name: string) => Promise<string | undefined>;
    itemCount: number;
  }) =>
    open ? (
      <div role="dialog" aria-label="Save as template">
        <button onClick={() => void onSave("Test Template")}>Trigger save</button>
        <button onClick={onClose}>Close save dialog</button>
      </div>
    ) : null,
}));

const groupedItems: PackingItem[] = [
  { id: "ungrouped-1", name: "Passport", done: false, position: 0, labelId: null },
  { id: "label-1", name: "Documents", done: false, position: 1, isLabel: true, labelId: null },
  { id: "item-1", name: "Phone charger", done: false, position: 2, labelId: "label-1" },
  { id: "label-2", name: "Clothes", done: false, position: 3, isLabel: true, labelId: null },
  { id: "item-2", name: "Socks", done: false, position: 4, labelId: "label-2" },
];

function createToggleItemHandler() {
  return vi.fn(async () => undefined);
}

function createAddItemHandler() {
  return vi.fn(async () => undefined as void);
}

function createRemoveItemHandler() {
  return vi.fn(async () => undefined as void);
}

function expectMinimumTouchTarget(element: HTMLElement, options?: { requireMinWidth?: boolean }): void {
  const styles = window.getComputedStyle(element);
  expect(styles.minHeight).toBe("44px");
  if (options?.requireMinWidth !== false) {
    expect(styles.minWidth).toBe("44px");
  }
}

describe("PackingListView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the empty state prompt when there are no items", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Your packing list is empty" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Packing item name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add label" })).toBeInTheDocument();
  });

  it("renders section labels distinctly and keeps ungrouped items below labeled sections", () => {
    const { container } = render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
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

  it("announces a cross-section move via the aria-live region on drag end", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    act(() => {
      (
        dndContextState.props as {
          onDragEnd?: (event: { active: { id: string }; over: { id: string } }) => void;
        }
      ).onDragEnd?.({ active: { id: "item-1" }, over: { id: "container:__ungrouped__" } });
    });

    expect(screen.getByText("Moved Phone charger to Ungrouped.")).toBeInTheDocument();
  });

  it("removes an item when the remove button is clicked", async () => {
    const user = userEvent.setup();
    const onRemoveItem = createRemoveItemHandler();

    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={onRemoveItem}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remove Passport" }));

    expect(onRemoveItem).toHaveBeenCalledWith("ungrouped-1");
  });

  it("applies 44px minimum touch-target sizing to interactive controls", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    expectMinimumTouchTarget(screen.getByRole("textbox", { name: "Packing item name" }), { requireMinWidth: false });
    expectMinimumTouchTarget(screen.getByRole("button", { name: "Add item" }));
    expectMinimumTouchTarget(screen.getByRole("button", { name: "Add label" }));
    expectMinimumTouchTarget(screen.getByRole("button", { name: "Remove Passport" }));
  });

  it('renders checkbox button with aria-checked="false" for unchecked item', () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: "Pack Passport" });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toHaveAttribute("aria-checked", "false");
  });

  it('renders checkbox button with aria-checked="true" for checked item', () => {
    const checkedItems: PackingItem[] = [{ id: "item-1", name: "Sunscreen", done: true, position: 0 }];
    render(
      <PackingListView
        tripId="trip-1"
        items={checkedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: "Pack Sunscreen" });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toHaveAttribute("aria-checked", "true");
  });

  it("calls onToggleItem with the item's id when checkbox is clicked", async () => {
    const user = userEvent.setup();
    const onToggleItem = createToggleItemHandler();

    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={onToggleItem}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "Pack Passport" }));

    await waitFor(() => expect(onToggleItem).toHaveBeenCalledWith("ungrouped-1"));
  });

  it("does not render a checkbox button for section labels", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    expect(screen.queryByRole("checkbox", { name: "Pack Documents" })).not.toBeInTheDocument();
  });

  it("announces toggle via aria-live region", async () => {
    const user = userEvent.setup();
    const onToggleItem = createToggleItemHandler();
    const { container } = render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={onToggleItem}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "Pack Passport" }));

    await waitFor(() => {
      const liveRegion = container.querySelector("[aria-live=polite]");
      expect(liveRegion).toHaveTextContent("Passport checked.");
    });
  });

  it("announces uncheck via aria-live region", async () => {
    const user = userEvent.setup();
    const onToggleItem = createToggleItemHandler();
    const checkedItems: PackingItem[] = [{ id: "item-1", name: "Sunscreen", done: true, position: 0 }];
    const { container } = render(
      <PackingListView
        tripId="trip-1"
        items={checkedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={onToggleItem}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "Pack Sunscreen" }));

    await waitFor(() => {
      const liveRegion = container.querySelector("[aria-live=polite]");
      expect(liveRegion).toHaveTextContent("Sunscreen unchecked.");
    });
  });

  it("waits for toggle persistence before announcing success", async () => {
    const user = userEvent.setup();
    let resolveToggle: (() => void) | undefined;
    const onToggleItem = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveToggle = resolve;
        })
    );
    const { container } = render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={onToggleItem}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "Pack Passport" }));

    const liveRegion = container.querySelector("[aria-live=polite]");
    expect(liveRegion).not.toHaveTextContent("Passport checked.");

    resolveToggle?.();

    await waitFor(() => expect(liveRegion).toHaveTextContent("Passport checked."));
  });

  it("announces toggle failures without reporting a packed-state change", async () => {
    const user = userEvent.setup();
    const onToggleItem = vi.fn(async () => {
      throw new Error("nope");
    });
    const { container } = render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={onToggleItem}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "Pack Passport" }));

    await waitFor(() => {
      const liveRegion = container.querySelector("[aria-live=polite]");
      expect(liveRegion).toHaveTextContent("Failed to update Passport.");
    });
  });

  it("checkbox button preserves the minimum touch-target size", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: "Pack Passport" });
    const touchTarget = checkbox.closest("[data-packing-toggle]") as HTMLElement;
    expectMinimumTouchTarget(touchTarget);
  });

  it("renders a drag handle on item rows but not on label rows", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    expect(screen.getByTitle("Reorder Passport")).toBeInTheDocument();
    expect(screen.getByTitle("Reorder Phone charger")).toBeInTheDocument();
    expect(screen.getByTitle("Reorder Socks")).toBeInTheDocument();
    expect(screen.queryByTitle("Reorder Documents")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Reorder Clothes")).not.toBeInTheDocument();
  });

  it("drag handle button preserves the minimum touch-target size", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={[{ id: "item-1", name: "Passport", done: false, position: 0 }]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const dragHandle = screen.getByTitle("Reorder Passport");
    expectMinimumTouchTarget(dragHandle);
  });

  it("does not call useSortable for section labels (labels render as plain PackingRow)", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const sortableCalls = useSortableMock.mock.calls as unknown[][];
    const labelCalls = sortableCalls.filter((call) => {
      const options = call[0] as { disabled?: boolean } | undefined;
      return options?.disabled === true;
    });
    // Labels are now rendered as plain PackingRow, so useSortable is never
    // called with disabled:true — labels are fully outside dnd-kit's awareness.
    expect(labelCalls.length).toBe(0);
  });

  it("calls useSortable with animateLayoutChanges that returns false", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={[{ id: "item-1", name: "Passport", done: false, position: 0 }]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const sortableCalls = useSortableMock.mock.calls as unknown[][];
    const itemCall = sortableCalls.find((call) => {
      const options = call[0] as { disabled?: boolean } | undefined;
      return options?.disabled !== true;
    });
    expect(itemCall).toBeDefined();
    const config = itemCall?.[0] as { animateLayoutChanges?: () => boolean } | undefined;
    expect(config?.animateLayoutChanges?.()).toBe(false);
  });

  // ── Story 1.4 — Label strikethrough ──────────────────────────────────────────

  it("renders strikethrough on label when all items beneath it are checked", () => {
    const allDoneItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-1", name: "Passport", done: true, position: 1, labelId: "label-1" },
      { id: "item-2", name: "Visa", done: true, position: 2, labelId: "label-1" },
    ];

    render(
      <PackingListView
        tripId="trip-1"
        items={allDoneItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Documents" }).className).toContain("line-through");
  });

  it("removes strikethrough from label when any item beneath it is unchecked", () => {
    const partialDoneItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-1", name: "Passport", done: true, position: 1, labelId: "label-1" },
      { id: "item-2", name: "Visa", done: false, position: 2, labelId: "label-1" },
    ];

    render(
      <PackingListView
        tripId="trip-1"
        items={partialDoneItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Documents" }).className).not.toContain("line-through");
  });

  it("does not render strikethrough on label with no items", () => {
    const emptySection: PackingItem[] = [{ id: "label-1", name: "Documents", done: false, position: 0, isLabel: true }];

    render(
      <PackingListView
        tripId="trip-1"
        items={emptySection}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Documents" }).className).not.toContain("line-through");
  });

  // ── Story 1.4 — Inline editing ───────────────────────────────────────────────

  it("clicking item name enters edit mode with pre-filled input", async () => {
    const user = userEvent.setup();

    render(
      <PackingListView
        tripId="trip-1"
        items={[{ id: "item-1", name: "Passport", done: false, position: 0 }]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.click(screen.getByText("Passport"));
    expect(screen.getByDisplayValue("Passport")).toBeInTheDocument();
  });

  it("pressing Enter in edit mode calls onEditItem with new name", async () => {
    const onEditItem = vi.fn();
    const user = userEvent.setup();

    render(
      <PackingListView
        tripId="trip-1"
        items={[{ id: "item-1", name: "Passport", done: false, position: 0 }]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={onEditItem}
      />
    );

    await user.click(screen.getByText("Passport"));
    const input = screen
      .getAllByRole("textbox")
      .find((el) => el !== screen.queryByRole("textbox", { name: "Packing item name" }));
    await user.clear(input!);
    await user.type(input!, "Passport (renewed)");
    await user.keyboard("{Enter}");

    expect(onEditItem).toHaveBeenCalledWith("item-1", "Passport (renewed)");
  });

  it("pressing Escape in edit mode cancels and reverts name without calling onEditItem", async () => {
    const onEditItem = vi.fn();
    const user = userEvent.setup();

    render(
      <PackingListView
        tripId="trip-1"
        items={[{ id: "item-1", name: "Passport", done: false, position: 0 }]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={onEditItem}
      />
    );

    await user.click(screen.getByText("Passport"));
    const inputs = screen.getAllByRole("textbox");
    const editInput = inputs.find((el) => (el as HTMLInputElement).value === "Passport");
    await user.clear(editInput!);
    await user.type(editInput!, "Something else");
    await user.keyboard("{Escape}");

    expect(onEditItem).not.toHaveBeenCalled();
    expect(screen.getByText("Passport")).toBeInTheDocument();
  });

  it("label in edit mode shows delete button", async () => {
    const user = userEvent.setup();

    render(
      <PackingListView
        tripId="trip-1"
        items={[{ id: "label-1", name: "Documents", done: false, position: 0, isLabel: true }]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.click(screen.getByRole("heading", { name: "Documents" }));
    expect(screen.getByRole("button", { name: "Delete label" })).toBeInTheDocument();
  });

  it("clicking delete label button in edit mode calls onRemoveItem", async () => {
    const onRemoveItem = createRemoveItemHandler();
    const user = userEvent.setup();

    render(
      <PackingListView
        tripId="trip-1"
        items={[{ id: "label-1", name: "Documents", done: false, position: 0, isLabel: true }]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={onRemoveItem}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.click(screen.getByRole("heading", { name: "Documents" }));
    await user.click(screen.getByRole("button", { name: "Delete label" }));
    expect(onRemoveItem).toHaveBeenCalledWith("label-1");
  });

  // ── Story 1.4 — Contextual add ───────────────────────────────────────────────

  it("contextual add form appears after section items", () => {
    const sectionItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-1", name: "Passport", done: false, position: 1, labelId: "label-1" },
    ];

    render(
      <PackingListView
        tripId="trip-1"
        items={sectionItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText("add to Documents")).toBeInTheDocument();
  });

  it("submitting contextual add form under a section passes afterItemId", async () => {
    const onAddItem = createAddItemHandler();
    const user = userEvent.setup();
    const sectionItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-1", name: "Passport", done: false, position: 1, labelId: "label-1" },
    ];

    render(
      <PackingListView
        tripId="trip-1"
        items={sectionItems}
        onAddItem={onAddItem}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const contextInput = screen.getByPlaceholderText("add to Documents");
    await user.type(contextInput, "Visa");
    await user.keyboard("{Enter}");

    expect(onAddItem).toHaveBeenCalledWith("Visa", false, "label-1", undefined, "label-1");
  });

  it("contextual add form shares the add pending guard after submit", async () => {
    const onAddItem = createAddItemHandler();
    const user = userEvent.setup();
    const sectionItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-1", name: "Passport", done: false, position: 1, labelId: "label-1" },
    ];

    render(
      <PackingListView
        tripId="trip-1"
        items={sectionItems}
        onAddItem={onAddItem}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const contextInput = screen.getByPlaceholderText("add to Documents");
    await user.type(contextInput, "Visa");
    await user.keyboard("{Enter}");

    const contextualForm = contextInput.closest("form");
    expect(contextualForm).not.toBeNull();
    expect(onAddItem).toHaveBeenCalledWith("Visa", false, "label-1", undefined, "label-1");
    expect(contextInput).toBeDisabled();
    expect(within(contextualForm!).getByRole("button", { name: "Add item here" })).toBeDisabled();
  });

  it("contextual add form appears in ungrouped area", () => {
    const ungroupedItems: PackingItem[] = [
      { id: "item-1", name: "Passport", done: false, position: 0 },
      { id: "item-2", name: "Sunscreen", done: false, position: 1 },
    ];

    render(
      <PackingListView
        tripId="trip-1"
        items={ungroupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText("Add item…")).toBeInTheDocument();
  });

  it("inline edit input has maxLength=100", async () => {
    const user = userEvent.setup();

    render(
      <PackingListView
        tripId="trip-1"
        items={[{ id: "item-1", name: "Passport", done: false, position: 0 }]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.click(screen.getByText("Passport"));
    const inputs = screen.getAllByRole("textbox");
    const editInput = inputs.find((el) => (el as HTMLInputElement).value === "Passport");
    expect(editInput).toHaveAttribute("maxLength", "100");
  });

  // ── Story 2.3 — Pull from template ───────────────────────────────────────────

  it("shows 'Pull from a template' button in empty state when onPullTemplates is provided", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
        templates={[]}
        onPullTemplates={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Pull from a template" })).toBeInTheDocument();
  });

  it("does not show pull button in empty state when onPullTemplates is absent", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Pull from a template" })).not.toBeInTheDocument();
  });

  it("shows 'Pull templates' button in populated state when onPullTemplates is provided", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
        templates={[]}
        onPullTemplates={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Pull templates" })).toBeInTheDocument();
  });

  it("opens the pull dialog when the empty-state pull button is clicked", async () => {
    const user = userEvent.setup();

    render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
        templates={[{ id: "t1", name: "Beach Weekend" }]}
        onPullTemplates={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Pull from a template" }));

    expect(screen.getByRole("dialog", { name: "Pull from templates" })).toBeInTheDocument();
  });

  it("opens the pull dialog when the populated-state pull button is clicked", async () => {
    const user = userEvent.setup();

    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
        templates={[{ id: "t1", name: "Beach Weekend" }]}
        onPullTemplates={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Pull templates" }));

    expect(screen.getByRole("dialog", { name: "Pull from templates" })).toBeInTheDocument();
  });

  it("shows result notice after successful pull and hides the dialog", async () => {
    const user = userEvent.setup();
    const onPullTemplates = vi.fn().mockResolvedValue({ added: 3, skipped: 1 });

    render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
        templates={[{ id: "t1", name: "Beach Weekend" }]}
        onPullTemplates={onPullTemplates}
      />
    );

    await user.click(screen.getByRole("button", { name: "Pull from a template" }));
    await user.click(screen.getByRole("button", { name: "Trigger pull" }));

    await waitFor(() => expect(screen.getByText(/3 item\(s\) added, 1 duplicate\(s\) skipped/)).toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: "Pull from templates" })).not.toBeInTheDocument();
  });

  it("shows no result notice when pull returns undefined", async () => {
    const user = userEvent.setup();
    const onPullTemplates = vi.fn().mockResolvedValue(undefined);

    render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
        templates={[{ id: "t1", name: "Beach Weekend" }]}
        onPullTemplates={onPullTemplates}
      />
    );

    await user.click(screen.getByRole("button", { name: "Pull from a template" }));
    await user.click(screen.getByRole("button", { name: "Trigger pull" }));

    await waitFor(() => expect(onPullTemplates).toHaveBeenCalledWith(["t1"]));
    expect(screen.queryByText(/item\(s\) added/)).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Pull from templates" })).toBeInTheDocument();
  });

  it("auto-dismisses the result notice after four seconds", async () => {
    const onPullTemplates = vi.fn().mockResolvedValue({ added: 3, skipped: 1 });

    render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
        templates={[{ id: "t1", name: "Beach Weekend" }]}
        onPullTemplates={onPullTemplates}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Pull from a template" }));
    fireEvent.click(await screen.findByRole("button", { name: "Trigger pull" }));

    await waitFor(() => expect(screen.getByText(/3 item\(s\) added, 1 duplicate\(s\) skipped/)).toBeInTheDocument());
    await waitFor(
      () => expect(screen.queryByText(/3 item\(s\) added, 1 duplicate\(s\) skipped/)).not.toBeInTheDocument(),
      { timeout: 4500 }
    );
  }, 7000);

  // ── Story 3.3 — AC #1: Announcement rollback on failure ──────────────────────

  it("rolls back the add form state when onAddItem rejects", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn(async () => {
      throw new Error("Server error");
    });
    const { container } = render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={onAddItem}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
      />
    );

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Passport");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => {
      const liveRegion = container.querySelector("[aria-live=polite]");
      expect(liveRegion).toHaveTextContent("Failed to add item.");
    });

    expect(screen.getByRole("textbox", { name: "Packing item name" })).toHaveValue("Passport");
    expect(screen.queryByText("Passport")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item" })).not.toBeDisabled();
  });

  it("keeps the item rendered when onRemoveItem rejects", async () => {
    const user = userEvent.setup();
    const onRemoveItem = vi.fn(async () => {
      throw new Error("Remove failed");
    });
    const { container } = render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={onRemoveItem}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remove Passport" }));

    await waitFor(() => {
      const liveRegion = container.querySelector("[aria-live=polite]");
      expect(liveRegion).toHaveTextContent("Failed to remove item.");
    });

    expect(screen.getByText("Passport")).toBeInTheDocument();
  });

  // ── Story 3.3 — AC #2: Deferred announcement on success ──────────────────────

  it("waits for add persistence before announcing success", async () => {
    const user = userEvent.setup();
    let resolveAdd: (() => void) | undefined;
    const onAddItem = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAdd = resolve;
        })
    );
    const { container } = render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={onAddItem}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
      />
    );

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Passport");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    const liveRegion = container.querySelector("[aria-live=polite]");
    expect(liveRegion).not.toHaveTextContent("Passport added.");

    expect(resolveAdd).toBeDefined();
    resolveAdd!();

    await waitFor(() => expect(liveRegion).toHaveTextContent("Passport added."));
  });

  it("waits for contextual add persistence before announcing success", async () => {
    const user = userEvent.setup();
    let resolveAdd: (() => void) | undefined;
    const onAddItem = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAdd = resolve;
        })
    );
    const sectionItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-1", name: "Passport", done: false, position: 1, labelId: "label-1" },
    ];
    const { container } = render(
      <PackingListView
        tripId="trip-1"
        items={sectionItems}
        onAddItem={onAddItem}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const contextInput = screen.getByPlaceholderText("add to Documents");
    await user.type(contextInput, "Visa");
    await user.keyboard("{Enter}");

    const liveRegion = container.querySelector("[aria-live=polite]");
    expect(liveRegion).not.toHaveTextContent("Visa added.");

    resolveAdd!();

    await waitFor(() => expect(liveRegion).toHaveTextContent("Item Visa added."));
  });

  it("waits for populated entry-form item persistence before announcing success", async () => {
    const user = userEvent.setup();
    let resolveAdd: (() => void) | undefined;
    const onAddItem = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAdd = resolve;
        })
    );
    const { container } = render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={onAddItem}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Tent");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    const liveRegion = container.querySelector("[aria-live=polite]");
    expect(liveRegion).not.toHaveTextContent("Item Tent added.");

    resolveAdd!();

    await waitFor(() => expect(liveRegion).toHaveTextContent("Item Tent added."));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Packing item name" })).toHaveValue(""));
  });

  it("waits for populated entry-form label persistence before announcing success", async () => {
    const user = userEvent.setup();
    let resolveAdd: (() => void) | undefined;
    const onAddItem = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAdd = resolve;
        })
    );
    const { container } = render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={onAddItem}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Camping");
    await user.click(screen.getByRole("button", { name: "Add label" }));

    const liveRegion = container.querySelector("[aria-live=polite]");
    expect(liveRegion).not.toHaveTextContent("Section Camping added.");

    resolveAdd!();

    await waitFor(() => expect(liveRegion).toHaveTextContent("Section Camping added."));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Packing item name" })).toHaveValue(""));
  });

  // ── Story 3.3 — AC #3: Server-triggered re-render detection ──────────────────

  it("resets isSubmitting when items prop changes by content (ID-based detection)", async () => {
    const user = userEvent.setup();
    let resolveAdd: (() => void) | undefined;
    const onAddItem = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAdd = resolve;
        })
    );

    const { rerender } = render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={onAddItem}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
      />
    );

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Passport");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(screen.getByRole("button", { name: "Add item" })).toBeDisabled();

    rerender(
      <PackingListView
        tripId="trip-1"
        items={[{ id: "new-item", name: "Passport", done: false, position: 0 }]}
        onAddItem={onAddItem}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Add item" })).not.toBeDisabled());
    resolveAdd!();
  });

  // ── Story 3.3 — AC #4: Concurrent mutation protection ────────────────────────

  it("keeps a same-section optimistic reorder visible before server props refresh", () => {
    const sameSectionItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-1", name: "Passport", done: false, position: 1, labelId: "label-1" },
      { id: "item-2", name: "Phone charger", done: false, position: 2, labelId: "label-1" },
    ];
    const { container } = render(
      <PackingListView
        tripId="trip-1"
        items={sameSectionItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    act(() => {
      (
        dndContextState.props as { onDragEnd?: (event: { active: { id: string }; over: { id: string } }) => void }
      ).onDragEnd?.({ active: { id: "item-1" }, over: { id: "item-2" } });
    });

    expect(
      Array.from(container.querySelectorAll("[data-packing-name]")).map((node) => node.textContent?.trim())
    ).toEqual(["Documents", "Phone charger", "Passport"]);
  });

  it("stale optimistic rollback is ignored when a newer reorder has started", () => {
    // Uses cross-section drags so labelId changes are reflected in the DOM
    // (position-based sorting would mask within-section reorders).
    const capturedErrors: Array<() => void> = [];
    const onReorderItems = vi.fn(
      (_ordered: { id: string; labelId: string | null; position: number }[], onError?: () => void) => {
        if (onError) capturedErrors.push(onError);
      }
    );

    const { container } = render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={onReorderItems}
        onEditItem={vi.fn()}
      />
    );

    const getRowNames = () =>
      Array.from(container.querySelectorAll("[data-packing-name]")).map((el) => el.textContent?.trim());

    const originalOrder = ["Documents", "Phone charger", "Clothes", "Socks", "Passport"];
    expect(getRowNames()).toEqual(originalOrder);

    // First drag: move Phone charger (item-1) from Documents → Ungrouped
    act(() => {
      (
        dndContextState.props as { onDragEnd?: (ev: { active: { id: string }; over: { id: string } }) => void }
      ).onDragEnd?.({ active: { id: "item-1" }, over: { id: "container:__ungrouped__" } });
    });

    // Second drag: move Socks (item-2) from Clothes → Ungrouped (newer mutation, seq=2)
    act(() => {
      (
        dndContextState.props as { onDragEnd?: (ev: { active: { id: string }; over: { id: string } }) => void }
      ).onDragEnd?.({ active: { id: "item-2" }, over: { id: "container:__ungrouped__" } });
    });

    expect(capturedErrors).toHaveLength(2);

    // After drag2, both items are in Ungrouped (visible: sections are empty)
    const optimisticOrder = getRowNames();
    expect(optimisticOrder).not.toEqual(originalOrder);

    // Fire the first (stale) error callback — seq=1 ≠ current seq=2 → ignored
    act(() => capturedErrors[0]?.());

    // Items should still be in the optimistic (drag2) state, not reverted
    expect(getRowNames()).toEqual(optimisticOrder);

    // Fire the second (valid) error callback — seq=2 === current seq=2 → fires rollback
    act(() => capturedErrors[1]?.());

    // After valid rollback localItems=null → effectiveItems = original prop order
    expect(getRowNames()).toEqual(originalOrder);
  });

  it("mutation sequence increments on each optimistic reorder", () => {
    let reorderCallCount = 0;
    const onReorderItems = vi.fn(() => {
      reorderCallCount += 1;
    });

    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={onReorderItems}
        onEditItem={vi.fn()}
      />
    );

    // Two distinct cross-section drags → two onReorderItems calls
    act(() => {
      (
        dndContextState.props as { onDragEnd?: (ev: { active: { id: string }; over: { id: string } }) => void }
      ).onDragEnd?.({ active: { id: "item-1" }, over: { id: "container:__ungrouped__" } });
    });

    act(() => {
      (
        dndContextState.props as { onDragEnd?: (ev: { active: { id: string }; over: { id: string } }) => void }
      ).onDragEnd?.({ active: { id: "item-2" }, over: { id: "container:__ungrouped__" } });
    });

    expect(reorderCallCount).toBe(2);
  });
});

// ── Story 2.4 — Save as template ─────────────────────────────────────────────

describe("PackingListView save-as-template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'Save as template' button in populated state when onSaveAsTemplate is provided", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
        onSaveAsTemplate={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Save as template" })).toBeInTheDocument();
  });

  it("does not show 'Save as template' button in populated state when onSaveAsTemplate is absent", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Save as template" })).not.toBeInTheDocument();
  });

  it("does not show 'Save as template' button in empty state", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
        onSaveAsTemplate={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Save as template" })).not.toBeInTheDocument();
  });

  it("clicking 'Save as template' button opens the save dialog", async () => {
    const user = userEvent.setup();

    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
        onSaveAsTemplate={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Save as template" }));

    expect(screen.getByRole("dialog", { name: "Save as template" })).toBeInTheDocument();
  });

  it("closes the save dialog when the close action is triggered", async () => {
    const user = userEvent.setup();

    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={createAddItemHandler()}
        onRemoveItem={createRemoveItemHandler()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
        onSaveAsTemplate={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Save as template" }));
    await user.click(screen.getByRole("button", { name: "Close save dialog" }));

    expect(screen.queryByRole("dialog", { name: "Save as template" })).not.toBeInTheDocument();
  });
});
