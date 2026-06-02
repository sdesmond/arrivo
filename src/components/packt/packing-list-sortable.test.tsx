import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closestCenter, pointerWithin, rectIntersection } from "@dnd-kit/core";
import { PackingListSortable, collisionDetection } from "./packing-list-sortable";
import type { PackingItem } from "@/data/types";

const dndContextState = vi.hoisted(() => ({
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
    vi.clearAllMocks();
  });

  it("groups items by labelId and renders ungrouped items last under a heading", () => {
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
    expect(screen.getByText("Ungrouped")).toBeInTheDocument();
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

    expect(screen.getByText("Ungrouped")).toBeInTheDocument();
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

    const input = screen.getByPlaceholderText('Add item under "Documents"…');
    await user.type(input, "Visa");
    await user.keyboard("{Enter}");
    expect(onAddItem).toHaveBeenCalledWith("Visa", false, "label-1", undefined, "label-1");
  });

  it("ungrouped add form passes a null labelId and inserts before the first label when empty", async () => {
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
    expect(onAddItem).toHaveBeenCalledWith("Travel adapter", false, undefined, "label-1", null);
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

    expect(screen.getByPlaceholderText('Add item under "Documents"…')).toBeDisabled();
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
