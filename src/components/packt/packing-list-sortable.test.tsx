import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closestCenter, pointerWithin, rectIntersection } from "@dnd-kit/core";
import { PackingListSortable } from "./packing-list-sortable";
import { arrayMove, collisionDetection } from "./packing-sort-utils";
import type { PackingItem } from "@/data/types";

const dndContextState = vi.hoisted(() => ({
  props: null as null | Record<string, unknown>,
}));

const dragOverlayState = vi.hoisted(() => ({
  props: null as null | Record<string, unknown>,
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

vi.mock("@dnd-kit/core", () => ({
  DndContext: (props: { children: ReactNode }) => {
    dndContextState.props = props;
    return <>{props.children}</>;
  },
  DragOverlay: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => {
    dragOverlayState.props = props;
    return <>{children}</>;
  },
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

// Documents [Item A, Item B] + ungrouped [Item C].
const reorderItems: PackingItem[] = [
  { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
  { id: "item-a", name: "Item A", done: false, position: 1, labelId: "label-1" },
  { id: "item-b", name: "Item B", done: false, position: 2, labelId: "label-1" },
  { id: "item-c", name: "Item C", done: false, position: 3, labelId: null },
];

function namesInOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-packing-name]")).map((node) => node.textContent ?? "");
}

function getDndProps<T>(): T {
  return dndContextState.props as T;
}

describe("PackingListSortable", () => {
  beforeEach(() => {
    dndContextState.props = null;
    dragOverlayState.props = null;
    vi.clearAllMocks();
  });

  it("passes dropAnimation={null} to DragOverlay", () => {
    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(dragOverlayState.props).toBeDefined();
    expect(dragOverlayState.props?.dropAnimation).toBeNull();
  });

  it("groups items by labelId and renders ungrouped items last without a heading", () => {
    const { container } = render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument();
    expect(screen.queryByText("Ungrouped")).not.toBeInTheDocument();
    expect(screen.getByTitle("Reorder Item A")).toBeInTheDocument();
    expect(screen.queryByTitle("Reorder Documents")).not.toBeInTheDocument();
    expect(namesInOrder(container)).toEqual(["Documents", "Item A", "Item B", "Item C"]);
  });

  it("treats items whose labelId points at a missing label as ungrouped", () => {
    const orphanItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-a", name: "Item A", done: false, position: 1, labelId: "label-1" },
      { id: "item-orphan", name: "Orphan", done: false, position: 2, labelId: "deleted-label" },
    ];

    render(
      <PackingListSortable
        items={orphanItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(screen.queryByText("Ungrouped")).not.toBeInTheDocument();
    expect(screen.getByText("Orphan")).toBeInTheDocument();
  });

  it("reorders within a section and persists position + labelId on drag end", () => {
    const onOptimisticReorder = vi.fn();
    const onReorderItems = vi.fn();

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={onOptimisticReorder}
        onReorderItems={onReorderItems}
      />
    );

    act(() => {
      getDndProps<{ onDragEnd?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragEnd?.({
        active: { id: "item-a" },
        over: { id: "item-b" },
      });
    });

    expect(onOptimisticReorder).toHaveBeenCalledWith([
      expect.objectContaining({ id: "label-1", position: 0, labelId: null }),
      expect.objectContaining({ id: "item-b", position: 1, labelId: "label-1" }),
      expect.objectContaining({ id: "item-a", position: 2, labelId: "label-1" }),
      expect.objectContaining({ id: "item-c", position: 3, labelId: null }),
    ]);
    expect(onReorderItems).toHaveBeenCalledWith(
      [
        { id: "label-1", labelId: null, position: 0 },
        { id: "item-b", labelId: "label-1", position: 1 },
        { id: "item-a", labelId: "label-1", position: 2 },
        { id: "item-c", labelId: null, position: 3 },
      ],
      expect.any(Function)
    );
  });

  it("moves an item into a section and reassigns its labelId, announcing the move", () => {
    const onReorderItems = vi.fn();
    const onAnnounceMove = vi.fn();

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={onReorderItems}
        onAnnounceMove={onAnnounceMove}
      />
    );

    act(() => {
      getDndProps<{ onDragEnd?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragEnd?.({
        active: { id: "item-c" },
        over: { id: "item-a" },
      });
    });

    expect(onReorderItems).toHaveBeenCalledWith(
      [
        { id: "label-1", labelId: null, position: 0 },
        { id: "item-c", labelId: "label-1", position: 1 },
        { id: "item-a", labelId: "label-1", position: 2 },
        { id: "item-b", labelId: "label-1", position: 3 },
      ],
      expect.any(Function)
    );
    expect(onAnnounceMove).toHaveBeenCalledWith("Moved Item C to Documents.");
  });

  it("moves an item into the empty ungrouped container when dropped on it", () => {
    const onReorderItems = vi.fn();
    const onAnnounceMove = vi.fn();
    const sectionOnly: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-1", name: "Passport", done: false, position: 1, labelId: "label-1" },
    ];

    render(
      <PackingListSortable
        items={sectionOnly}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={onReorderItems}
        onAnnounceMove={onAnnounceMove}
      />
    );

    act(() => {
      getDndProps<{ onDragEnd?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragEnd?.({
        active: { id: "item-1" },
        over: { id: "container:__ungrouped__" },
      });
    });

    expect(onReorderItems).toHaveBeenCalledWith(
      [
        { id: "label-1", labelId: null, position: 0 },
        { id: "item-1", labelId: null, position: 1 },
      ],
      expect.any(Function)
    );
    expect(onAnnounceMove).toHaveBeenCalledWith("Moved Passport to Ungrouped.");
  });

  it("persists a cross-container drop landed as the last item over the destination container", () => {
    const onOptimisticReorder = vi.fn();
    const onReorderItems = vi.fn();
    const onAnnounceMove = vi.fn();

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={onOptimisticReorder}
        onReorderItems={onReorderItems}
        onAnnounceMove={onAnnounceMove}
      />
    );

    // Live preview reparents Item C to the end of the Documents section…
    act(() => {
      getDndProps<{ onDragOver?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragOver?.({
        active: { id: "item-c" },
        over: { id: "container:label-1" },
      });
    });

    // …then the drop resolves to the container itself (empty area below the last
    // item). The final slot matches the preview, so the move only persists if the
    // no-op check compares against the original order rather than the preview.
    act(() => {
      getDndProps<{ onDragEnd?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragEnd?.({
        active: { id: "item-c" },
        over: { id: "container:label-1" },
      });
    });

    expect(onReorderItems).toHaveBeenCalledWith(
      [
        { id: "label-1", labelId: null, position: 0 },
        { id: "item-a", labelId: "label-1", position: 1 },
        { id: "item-b", labelId: "label-1", position: 2 },
        { id: "item-c", labelId: "label-1", position: 3 },
      ],
      expect.any(Function)
    );
    expect(onAnnounceMove).toHaveBeenCalledWith("Moved Item C to Documents.");
  });

  it("previews a cross-container move during drag over", () => {
    const { container } = render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(namesInOrder(container)).toEqual(["Documents", "Item A", "Item B", "Item C"]);

    act(() => {
      getDndProps<{ onDragOver?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragOver?.({
        active: { id: "item-c" },
        over: { id: "item-a" },
      });
    });

    expect(namesInOrder(container)).toEqual(["Documents", "Item C", "Item A", "Item B"]);
  });

  it("ignores drag over within the same container and with no destination", () => {
    const { container } = render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    act(() => {
      const props = getDndProps<{
        onDragOver?: (event: { active: { id: string }; over: { id: string } | null }) => void;
      }>();
      props.onDragOver?.({ active: { id: "item-a" }, over: { id: "item-b" } });
      props.onDragOver?.({ active: { id: "item-a" }, over: null });
    });

    expect(namesInOrder(container)).toEqual(["Documents", "Item A", "Item B", "Item C"]);
  });

  it("ignores drag-end events without a valid destination", () => {
    const onOptimisticReorder = vi.fn();
    const onReorderItems = vi.fn();

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={onOptimisticReorder}
        onReorderItems={onReorderItems}
      />
    );

    act(() => {
      const props = getDndProps<{
        onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
      }>();
      props.onDragEnd?.({ active: { id: "item-a" }, over: null });
      props.onDragEnd?.({ active: { id: "item-a" }, over: { id: "item-a" } });
    });

    expect(onOptimisticReorder).not.toHaveBeenCalled();
    expect(onReorderItems).not.toHaveBeenCalled();
  });

  it("shows and clears the drag overlay across drag start and cancel", () => {
    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    act(() => {
      getDndProps<{ onDragStart?: (event: { active: { id: string } }) => void }>().onDragStart?.({
        active: { id: "item-a" },
      });
    });

    expect(screen.getAllByText("Item A")).toHaveLength(2);

    act(() => {
      getDndProps<{ onDragCancel?: () => void }>().onDragCancel?.();
    });

    expect(screen.getAllByText("Item A")).toHaveLength(1);
  });

  it("applies line-through to section label when all items beneath it are checked", () => {
    const allDoneItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-1", name: "Passport", done: true, position: 1, labelId: "label-1" },
      { id: "item-2", name: "Visa", done: true, position: 2, labelId: "label-1" },
    ];

    render(
      <PackingListSortable
        items={allDoneItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Documents" }).className).toContain("line-through");
  });

  it("does not apply line-through to label when any item beneath it is unchecked", () => {
    const partialDoneItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-1", name: "Passport", done: true, position: 1, labelId: "label-1" },
      { id: "item-2", name: "Visa", done: false, position: 2, labelId: "label-1" },
    ];

    render(
      <PackingListSortable
        items={partialDoneItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Documents" }).className).not.toContain("line-through");
  });

  it("does not apply line-through to label with no items", () => {
    const emptySection: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
    ];

    render(
      <PackingListSortable
        items={emptySection}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Documents" }).className).not.toContain("line-through");
  });

  it("contextual add form for a section passes the section labelId on submit", async () => {
    const onAddItem = vi.fn();
    const user = userEvent.setup();
    const sectionItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-1", name: "Passport", done: false, position: 1, labelId: "label-1" },
    ];

    render(
      <PackingListSortable
        items={sectionItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
        onAddItem={onAddItem}
      />
    );

    const input = screen.getByPlaceholderText("add to Documents");
    await user.type(input, "Visa");
    await user.keyboard("{Enter}");
    expect(onAddItem).toHaveBeenCalledWith("Visa", false, "item-1", undefined, "label-1");
  });

  it("ungrouped add form passes a null labelId without a beforeItemId anchor when empty", async () => {
    const onAddItem = vi.fn();
    const user = userEvent.setup();
    const sectionItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-1", name: "Passport", done: false, position: 1, labelId: "label-1" },
    ];

    render(
      <PackingListSortable
        items={sectionItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
        onAddItem={onAddItem}
      />
    );

    const input = screen.getByPlaceholderText("Add item…");
    await user.type(input, "Travel adapter");
    await user.keyboard("{Enter}");
    expect(onAddItem).toHaveBeenCalledWith("Travel adapter", false, undefined, undefined, null);
  });

  it("ungrouped add form passes the last ungrouped item id as afterItemId", async () => {
    const onAddItem = vi.fn();
    const user = userEvent.setup();
    const ungroupedItems: PackingItem[] = [
      { id: "item-1", name: "Passport", done: false, position: 0, labelId: null },
      { id: "item-2", name: "Sunscreen", done: false, position: 1, labelId: null },
    ];

    render(
      <PackingListSortable
        items={ungroupedItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
        onAddItem={onAddItem}
      />
    );

    const input = screen.getByPlaceholderText("Add item…");
    await user.type(input, "Visa");
    await user.keyboard("{Enter}");
    expect(onAddItem).toHaveBeenCalledWith("Visa", false, "item-2", undefined, null);
  });

  it("renders the Add item ContextualAddForm when items is empty and onAddItem is provided", () => {
    const onAddItem = vi.fn();

    render(
      <PackingListSortable
        items={[]}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
        onAddItem={onAddItem}
      />
    );

    expect(screen.getByPlaceholderText("Add item…")).toBeInTheDocument();
    expect(screen.queryByText("Ungrouped")).not.toBeInTheDocument();
  });

  it("disables contextual add forms while an add is already in flight", () => {
    const sectionItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-1", name: "Passport", done: false, position: 1, labelId: "label-1" },
    ];

    render(
      <PackingListSortable
        items={sectionItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
        onAddItem={vi.fn()}
        isAdding
      />
    );

    expect(screen.getByPlaceholderText("add to Documents")).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Add item here" })[0]).toBeDisabled();
  });

  it("invokes the rollback callback passed to onReorderItems", () => {
    const onOptimisticReorder = vi.fn();
    const onReorderItems = vi.fn();

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={onOptimisticReorder}
        onReorderItems={onReorderItems}
      />
    );

    act(() => {
      getDndProps<{ onDragEnd?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragEnd?.({
        active: { id: "item-a" },
        over: { id: "item-b" },
      });
    });

    const rollback = onReorderItems.mock.calls[0][1] as () => void;
    onOptimisticReorder.mockClear();
    rollback();
    expect(onOptimisticReorder).toHaveBeenCalledWith(null);
  });

  it("Bug #4: filters items with undefined id from the onReorderItems payload", () => {
    const onReorderItems = vi.fn();
    // Include a valid ungrouped item as the drop target so computeReorder succeeds
    const itemsWithUndefinedId: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: undefined, name: "Ghost", done: false, position: 1, labelId: "label-1" } as unknown as PackingItem,
      { id: "item-a", name: "Item A", done: false, position: 2, labelId: "label-1" },
      { id: "item-b", name: "Item B", done: false, position: 3, labelId: null },
    ];

    render(
      <PackingListSortable
        items={itemsWithUndefinedId}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={onReorderItems}
      />
    );

    act(() => {
      getDndProps<{ onDragEnd?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragEnd?.({
        active: { id: "item-a" },
        over: { id: "item-b" },
      });
    });

    // reorderItems must have been called (non-label drop onto non-label succeeds)
    expect(onReorderItems).toHaveBeenCalled();
    const payload = onReorderItems.mock.calls[0][0] as { id: string }[];
    // Every entry must have a defined id
    expect(payload.every((entry) => entry.id !== undefined)).toBe(true);
    // The ghost item (undefined id) must not appear in the payload
    expect(payload.find((entry) => entry.id === undefined)).toBeUndefined();
  });

  it("Bug #6: treats drop on a section label as a no-op (item stays at current position)", () => {
    const onOptimisticReorder = vi.fn();
    const onReorderItems = vi.fn();

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={onOptimisticReorder}
        onReorderItems={onReorderItems}
      />
    );

    // Drag item-c (ungrouped) and drop it directly onto label-1 (the section label)
    act(() => {
      getDndProps<{ onDragEnd?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragEnd?.({
        active: { id: "item-c" },
        over: { id: "label-1" },
      });
    });

    // Should be a no-op — item-c must not be moved into the section
    expect(onOptimisticReorder).not.toHaveBeenCalled();
    expect(onReorderItems).not.toHaveBeenCalled();
  });

  it("Bug #7: section labels have no drag handle (non-draggable)", () => {
    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    // Labels must not have a reorder handle; items must
    expect(screen.queryByTitle("Reorder Documents")).not.toBeInTheDocument();
    expect(screen.getByTitle("Reorder Item A")).toBeInTheDocument();
    expect(screen.getByTitle("Reorder Item B")).toBeInTheDocument();

    // Labels must render as plain PackingRow (not SortablePackingRow) — the
    // label row sits inside the droppable (outer container) but not in the
    // nested SortableContext.
    const labelRow = document.querySelector('[data-packing-kind="label"]');
    expect(labelRow?.parentElement).toHaveAttribute("data-packing-container");
    expect(labelRow?.closest("[data-packing-dropzone]")).not.toBeNull();
  });

  it("includes the section header inside the drop zone so drag-hover auto-expand can detect collisions on collapsed sections", () => {
    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    const labelRow = document.querySelector('[data-packing-kind="label"]');
    const dropZone = document.querySelector('[data-packing-dropzone="container:label-1"]');
    expect(dropZone).not.toBeNull();
    expect(dropZone?.contains(labelRow)).toBe(true);
  });

  // ── Collapse toggle ──────────────────────────────────────────────────────────

  it("renders collapse toggle button on label rows", () => {
    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        collapsedLabels={new Set()}
        onToggleCollapse={vi.fn()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Collapse Documents" })).toBeInTheDocument();
  });

  it("hides section items when its label is in collapsedLabels", () => {
    const collapsed = new Set(["label-1"]);
    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        collapsedLabels={collapsed}
        onToggleCollapse={vi.fn()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.queryByText("Item A")).not.toBeInTheDocument();
    expect(screen.queryByText("Item B")).not.toBeInTheDocument();
    // Ungrouped items should still be visible
    expect(screen.getByText("Item C")).toBeInTheDocument();
    expect(screen.queryByText("Ungrouped")).not.toBeInTheDocument();
  });

  it("shows section items when its label is not in collapsedLabels", () => {
    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        collapsedLabels={new Set()}
        onToggleCollapse={vi.fn()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(screen.getByText("Item A")).toBeInTheDocument();
    expect(screen.getByText("Item B")).toBeInTheDocument();
  });

  it("calls onToggleCollapse with label id when collapse button is clicked", async () => {
    const onToggleCollapse = vi.fn();
    const user = userEvent.setup();

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        collapsedLabels={new Set()}
        onToggleCollapse={onToggleCollapse}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Collapse Documents" }));
    expect(onToggleCollapse).toHaveBeenCalledWith("label-1");
  });

  it("collapse state is independent per section", () => {
    const multiSectionItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-a", name: "Passport", done: false, position: 1, labelId: "label-1" },
      { id: "label-2", name: "Clothes", done: false, position: 2, isLabel: true, labelId: null },
      { id: "item-b", name: "Socks", done: false, position: 3, labelId: "label-2" },
    ];
    const collapsed = new Set(["label-1"]);

    render(
      <PackingListSortable
        items={multiSectionItems}
        pendingItemIds={new Set()}
        collapsedLabels={collapsed}
        onToggleCollapse={vi.fn()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    // Documents section is collapsed
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.queryByText("Passport")).not.toBeInTheDocument();

    // Clothes section is expanded
    expect(screen.getByText("Clothes")).toBeInTheDocument();
    expect(screen.getByText("Socks")).toBeInTheDocument();
  });

  it("auto-expands collapsed section when dragging over it after 700ms", () => {
    vi.useFakeTimers();
    const onToggleCollapse = vi.fn();
    const collapsed = new Set(["label-1"]);

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        collapsedLabels={collapsed}
        onToggleCollapse={onToggleCollapse}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    act(() => {
      getDndProps<{ onDragOver?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragOver?.({
        active: { id: "item-c" },
        over: { id: "label-1" },
      });
    });

    expect(onToggleCollapse).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(onToggleCollapse).toHaveBeenCalledWith("label-1");
    vi.useRealTimers();
  });

  it("does not auto-expand when dragging over an already expanded section", () => {
    vi.useFakeTimers();
    const onToggleCollapse = vi.fn();

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        collapsedLabels={new Set()}
        onToggleCollapse={onToggleCollapse}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    act(() => {
      getDndProps<{ onDragOver?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragOver?.({
        active: { id: "item-c" },
        over: { id: "label-1" },
      });
    });

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(onToggleCollapse).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not auto-expand when dragging an item over its own collapsed section", () => {
    vi.useFakeTimers();
    const onToggleCollapse = vi.fn();
    const collapsed = new Set(["label-1"]);

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        collapsedLabels={collapsed}
        onToggleCollapse={onToggleCollapse}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    act(() => {
      getDndProps<{ onDragOver?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragOver?.({
        active: { id: "item-a" },
        over: { id: "label-1" },
      });
    });

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(onToggleCollapse).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not move an item into a collapsed section during drag", () => {
    const onOptimisticReorder = vi.fn();
    const collapsed = new Set(["label-1"]);

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        collapsedLabels={collapsed}
        onToggleCollapse={vi.fn()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={onOptimisticReorder}
        onReorderItems={vi.fn()}
      />
    );

    act(() => {
      getDndProps<{ onDragOver?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragOver?.({
        active: { id: "item-c" },
        over: { id: "label-1" },
      });
    });

    // No optimistic reorder into a collapsed section
    expect(onOptimisticReorder).not.toHaveBeenCalled();
  });

  it("clears expand timeout when drag ends before timer fires", () => {
    vi.useFakeTimers();
    const onToggleCollapse = vi.fn();
    const collapsed = new Set(["label-1"]);

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        collapsedLabels={collapsed}
        onToggleCollapse={onToggleCollapse}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    act(() => {
      getDndProps<{ onDragOver?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragOver?.({
        active: { id: "item-c" },
        over: { id: "label-1" },
      });
    });

    act(() => {
      getDndProps<{ onDragEnd?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragEnd?.({
        active: { id: "item-c" },
        over: { id: "item-a" },
      });
    });

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(onToggleCollapse).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("resets expand timeout when dragging over a different section", () => {
    vi.useFakeTimers();
    const onToggleCollapse = vi.fn();
    const collapsed = new Set(["label-1", "label-2"]);
    const multiSectionItems: PackingItem[] = [
      { id: "label-1", name: "Documents", done: false, position: 0, isLabel: true, labelId: null },
      { id: "item-a", name: "Passport", done: false, position: 1, labelId: "label-1" },
      { id: "label-2", name: "Clothes", done: false, position: 2, isLabel: true, labelId: null },
      { id: "item-b", name: "Socks", done: false, position: 3, labelId: "label-2" },
      { id: "item-c", name: "Shoes", done: false, position: 4, labelId: null },
    ];

    render(
      <PackingListSortable
        items={multiSectionItems}
        pendingItemIds={new Set()}
        collapsedLabels={collapsed}
        onToggleCollapse={onToggleCollapse}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    act(() => {
      getDndProps<{ onDragOver?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragOver?.({
        active: { id: "item-c" },
        over: { id: "label-2" },
      });
    });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    act(() => {
      getDndProps<{ onDragOver?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragOver?.({
        active: { id: "item-c" },
        over: { id: "label-1" },
      });
    });

    act(() => {
      vi.advanceTimersByTime(699);
    });

    expect(onToggleCollapse).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    expect(onToggleCollapse).toHaveBeenCalledWith("label-1");
    vi.useRealTimers();
  });

  it("never announces label reordering during normal item moves", () => {
    const onAnnounceMove = vi.fn();

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
        onAnnounceMove={onAnnounceMove}
      />
    );

    act(() => {
      getDndProps<{ onDragEnd?: (event: { active: { id: string }; over: { id: string } }) => void }>().onDragEnd?.({
        active: { id: "item-c" },
        over: { id: "item-a" },
      });
    });

    expect(onAnnounceMove).toHaveBeenCalledWith("Moved Item C to Documents.");
    expect(onAnnounceMove).not.toHaveBeenCalledWith("Labels cannot be reordered.");
  });

  it("edits a section label, removes and toggles a section item", async () => {
    const onEditItem = vi.fn();
    const onRemoveItem = vi.fn();
    const onToggleItem = vi.fn(async () => undefined);
    const user = userEvent.setup();

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={onRemoveItem}
        onToggleItem={onToggleItem}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
        onEditItem={onEditItem}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remove Item A" }));
    expect(onRemoveItem).toHaveBeenCalledWith(expect.objectContaining({ id: "item-a" }));

    await user.click(screen.getByRole("checkbox", { name: "Pack Item B" }));
    expect(onToggleItem).toHaveBeenCalledWith(expect.objectContaining({ id: "item-b" }));

    await user.click(screen.getByRole("heading", { name: "Documents" }));
    const labelInput = screen.getByRole("textbox");
    await user.clear(labelInput);
    await user.type(labelInput, "Travel docs");
    await user.keyboard("{Enter}");
    expect(onEditItem).toHaveBeenCalledWith("label-1", "Travel docs");
  });

  it("renders without checkboxes when onToggleItem is omitted", () => {
    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("calls onEditItem with item id and new name when item inline edit commits", async () => {
    const onEditItem = vi.fn();
    const user = userEvent.setup();

    render(
      <PackingListSortable
        items={reorderItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
        onEditItem={onEditItem}
      />
    );

    await user.click(screen.getByText("Item A"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Item A (edited)");
    await user.keyboard("{Enter}");

    expect(onEditItem).toHaveBeenCalledWith("item-a", "Item A (edited)");
  });
});

describe("collisionDetection", () => {
  const args = {} as Parameters<typeof collisionDetection>[0];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers pointer-within collisions", () => {
    vi.mocked(pointerWithin).mockReturnValueOnce([{ id: "a" }]);
    expect(collisionDetection(args)).toEqual([{ id: "a" }]);
    expect(rectIntersection).not.toHaveBeenCalled();
  });

  it("falls back to rect intersection when there is no pointer collision", () => {
    vi.mocked(pointerWithin).mockReturnValueOnce([]);
    vi.mocked(rectIntersection).mockReturnValueOnce([{ id: "b" }]);
    expect(collisionDetection(args)).toEqual([{ id: "b" }]);
    expect(closestCenter).not.toHaveBeenCalled();
  });

  it("falls back to closest center when nothing else collides", () => {
    vi.mocked(pointerWithin).mockReturnValueOnce([]);
    vi.mocked(rectIntersection).mockReturnValueOnce([]);
    vi.mocked(closestCenter).mockReturnValueOnce([{ id: "c" }]);
    expect(collisionDetection(args)).toEqual([{ id: "c" }]);
  });
});

describe("arrayMove", () => {
  it("moves an item from one index to another", () => {
    expect(arrayMove(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(arrayMove(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("returns an unchanged copy when the source index is out of bounds", () => {
    const input = ["a", "b", "c"];
    const result = arrayMove(input, -1, 1);
    expect(result).toEqual(["a", "b", "c"]);
    expect(result).not.toBe(input);
    expect(arrayMove(input, 5, 0)).toEqual(["a", "b", "c"]);
  });
});
