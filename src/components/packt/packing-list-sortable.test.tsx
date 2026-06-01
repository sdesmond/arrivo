import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PackingListSortable } from "./packing-list-sortable";
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

const groupedItems: PackingItem[] = [
  { id: "item-1", name: "Passport", done: false, position: 0 },
  { id: "label-1", name: "Documents", done: false, position: 1, isLabel: true },
  { id: "item-2", name: "Phone charger", done: false, position: 2 },
  { id: "item-3", name: "Socks", done: false, position: 3 },
];

const reorderItems: PackingItem[] = [
  { id: "item-a", name: "Item A", done: false, position: 0 },
  { id: "item-b", name: "Item B", done: false, position: 1 },
  { id: "item-c", name: "Item C", done: false, position: 2 },
];

describe("PackingListSortable", () => {
  beforeEach(() => {
    dndContextState.props = null;
    vi.clearAllMocks();
  });

  it("renders grouped items with an ungrouped section heading", () => {
    render(
      <PackingListSortable
        items={groupedItems}
        pendingItemIds={new Set()}
        onRemoveItem={vi.fn()}
        onToggleItem={vi.fn(async () => undefined)}
        onOptimisticReorder={vi.fn()}
        onReorderItems={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument();
    expect(screen.getByText("Ungrouped")).toBeInTheDocument();
    expect(screen.getByTitle("Reorder Passport")).toBeInTheDocument();
    expect(screen.queryByTitle("Reorder Documents")).not.toBeInTheDocument();
  });

  it("applies an optimistic reorder and persists the reordered ids on drag end", () => {
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
      const props = dndContextState.props as {
        onDragEnd?: (event: { active: { id: string }; over: { id: string } }) => void;
      };
      props.onDragEnd?.({ active: { id: "item-a" }, over: { id: "item-b" } });
    });

    expect(onOptimisticReorder).toHaveBeenCalledWith([
      { id: "item-b", name: "Item B", done: false, position: 0 },
      { id: "item-a", name: "Item A", done: false, position: 1 },
      { id: "item-c", name: "Item C", done: false, position: 2 },
    ]);
    expect(onReorderItems).toHaveBeenCalledWith(["item-b", "item-a", "item-c"], expect.any(Function));
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
      const props = dndContextState.props as {
        onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
      };
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
      const props = dndContextState.props as { onDragStart?: (event: { active: { id: string } }) => void };
      props.onDragStart?.({ active: { id: "item-a" } });
    });

    expect(screen.getAllByText("Item A")).toHaveLength(2);

    act(() => {
      const props = dndContextState.props as { onDragCancel?: () => void };
      props.onDragCancel?.();
    });

    expect(screen.getAllByText("Item A")).toHaveLength(1);
  });
});
