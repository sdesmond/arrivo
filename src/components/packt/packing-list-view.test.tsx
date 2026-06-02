import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackingListView } from "./packing-list-view";
import type { PackingItem } from "@/data/types";

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

describe("PackingListView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty state prompt when there are no items", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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

  it("submits a plain-text item from the form", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn();

    render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={onAddItem}
        onRemoveItem={vi.fn()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Passport");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(onAddItem).toHaveBeenCalledWith("Passport", undefined);
    expect(screen.getByRole("textbox", { name: "Packing item name" })).toHaveValue("");
  });

  it("submits a section label from the form", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn();

    render(
      <PackingListView
        tripId="trip-1"
        items={[]}
        onAddItem={onAddItem}
        onRemoveItem={vi.fn()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Documents");
    await user.click(screen.getByRole("button", { name: "Add label" }));

    expect(onAddItem).toHaveBeenCalledWith("Documents", true);
  });

  it("submits an item from the entry form when the list already has items", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn();

    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={onAddItem}
        onRemoveItem={vi.fn()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Tent");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(onAddItem).toHaveBeenCalledWith("Tent", undefined);
  });

  it("submits a label from the entry form when the list already has items", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn();

    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={onAddItem}
        onRemoveItem={vi.fn()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Camping");
    await user.click(screen.getByRole("button", { name: "Add label" }));
    expect(onAddItem).toHaveBeenCalledWith("Camping", true);
  });

  it("announces a cross-section move via the aria-live region on drag end", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
    const onRemoveItem = vi.fn();

    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    expect(screen.getByRole("textbox", { name: "Packing item name" }).className).toContain("h-11");
    expect(screen.getByRole("button", { name: "Add item" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Add item" }).className).toContain("min-w-11");
    expect(screen.getByRole("button", { name: "Add label" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Add label" }).className).toContain("min-w-11");
    expect(screen.getByRole("button", { name: "Remove Passport" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Remove Passport" }).className).toContain("min-w-11");
  });

  it('renders checkbox button with aria-checked="false" for unchecked item', () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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

  it("checkbox button has min-h-11 and min-w-11 classes", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: "Pack Passport" });
    expect(checkbox.className).toContain("min-h-11");
    expect(checkbox.className).toContain("min-w-11");
  });

  it("renders a drag handle on item rows but not on label rows", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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

  it("drag handle button has min-h-11 and min-w-11 classes", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={[{ id: "item-1", name: "Passport", done: false, position: 0 }]}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const dragHandle = screen.getByTitle("Reorder Passport");
    expect(dragHandle.className).toContain("min-h-11");
    expect(dragHandle.className).toContain("min-w-11");
  });

  it("calls useSortable with disabled:true for section labels", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={groupedItems}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
    expect(labelCalls.length).toBeGreaterThan(0);
  });

  it("calls useSortable with animateLayoutChanges that returns false", () => {
    render(
      <PackingListView
        tripId="trip-1"
        items={[{ id: "item-1", name: "Passport", done: false, position: 0 }]}
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    await user.click(screen.getByRole("heading", { name: "Documents" }));
    expect(screen.getByRole("button", { name: "Delete label" })).toBeInTheDocument();
  });

  it("clicking delete label button in edit mode calls onRemoveItem", async () => {
    const onRemoveItem = vi.fn();
    const user = userEvent.setup();

    render(
      <PackingListView
        tripId="trip-1"
        items={[{ id: "label-1", name: "Documents", done: false, position: 0, isLabel: true }]}
        onAddItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText('Add item under "Documents"…')).toBeInTheDocument();
  });

  it("submitting contextual add form under a section passes afterItemId", async () => {
    const onAddItem = vi.fn();
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
        onRemoveItem={vi.fn()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const contextInput = screen.getByPlaceholderText('Add item under "Documents"…');
    await user.type(contextInput, "Visa");
    await user.keyboard("{Enter}");

    expect(onAddItem).toHaveBeenCalledWith("Visa", false, "label-1", undefined, "label-1");
  });

  it("contextual add form shares the add pending guard after submit", async () => {
    const onAddItem = vi.fn();
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
        onRemoveItem={vi.fn()}
        onToggleItem={createToggleItemHandler()}
        onReorderItems={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const contextInput = screen.getByPlaceholderText('Add item under "Documents"…');
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
        onAddItem={vi.fn()}
        onRemoveItem={vi.fn()}
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
});
