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

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  DragOverlay: ({ children }: { children: ReactNode }) => <>{children}</>,
  closestCenter: {},
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSortable: useSortableMock,
  verticalListSortingStrategy: {},
  arrayMove: vi.fn((items: unknown[], from: number, to: number) => {
    const reordered = [...items];
    reordered.splice(to, 0, reordered.splice(from, 1)[0]);
    return reordered;
  }),
  sortableKeyboardCoordinates: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: vi.fn(() => undefined) } },
}));

import { render, screen, waitFor } from "@testing-library/react";
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
      />
    );

    await user.type(screen.getByRole("textbox", { name: "Packing item name" }), "Documents");
    await user.click(screen.getByRole("button", { name: "Add label" }));

    expect(onAddItem).toHaveBeenCalledWith("Documents", true);
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
});
