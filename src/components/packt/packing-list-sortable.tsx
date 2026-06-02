"use client";

import { useMemo, useState, type ReactElement } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { PackingItem } from "@/data/types";
import { PackingRow, SortablePackingRow } from "./packing-list-row";
import { ContextualAddForm } from "./packing-contextual-add-form";
import { DroppablePackingSection } from "./droppable-packing-section";

interface PackingSection {
  label: PackingItem;
  items: PackingItem[];
}

interface GroupedPackingItems {
  sections: PackingSection[];
  ungroupedItems: PackingItem[];
}

export interface PackingListSortableProps {
  items: PackingItem[];
  pendingItemIds: Set<string>;
  onRemoveItem: (item: PackingItem) => void;
  onToggleItem: (item: PackingItem) => Promise<void>;
  onOptimisticReorder: (reorderedItems: PackingItem[] | null) => void;
  onReorderItems: (ordered: { id: string; labelId: string | null; position: number }[], onError?: () => void) => void;
  onEditItem?: (id: string, name: string) => void;
  onAddItem?: (
    name: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null
  ) => void;
  onAnnounceMove?: (message: string) => void;
  isAdding?: boolean;
}

const UNGROUPED_KEY = "__ungrouped__";
const CONTAINER_PREFIX = "container:";

function containerDomId(key: string): string {
  return `${CONTAINER_PREFIX}${key}`;
}

function byPosition(first: PackingItem, second: PackingItem): number {
  return (first.position ?? Infinity) - (second.position ?? Infinity);
}

function groupPackingItems(items: PackingItem[]): GroupedPackingItems {
  const labels = items.filter((item) => item.isLabel).sort(byPosition);
  const labelIds = new Set(labels.map((label) => label.id));
  const sections: PackingSection[] = labels.map((label) => ({
    label,
    items: items.filter((item) => !item.isLabel && item.labelId === label.id).sort(byPosition),
  }));
  const ungroupedItems = items
    .filter((item) => !item.isLabel && (item.labelId == null || !labelIds.has(item.labelId)))
    .sort(byPosition);
  return { sections, ungroupedItems };
}

function containerKeyOfItem(grouped: GroupedPackingItems, itemId: string): string | null {
  for (const section of grouped.sections) {
    if (section.label.id === itemId || section.items.some((item) => item.id === itemId)) {
      return section.label.id ?? null;
    }
  }
  if (grouped.ungroupedItems.some((item) => item.id === itemId)) return UNGROUPED_KEY;
  return null;
}

function resolveContainerKey(grouped: GroupedPackingItems, id: string): string | null {
  if (id.startsWith(CONTAINER_PREFIX)) return id.slice(CONTAINER_PREFIX.length);
  return containerKeyOfItem(grouped, id);
}

// Walk sections (label then its items) then ungrouped, assigning a single
// increasing position and an explicit labelId per non-label item.
function flatten(grouped: GroupedPackingItems): PackingItem[] {
  const result: PackingItem[] = [];
  let position = 0;
  for (const section of grouped.sections) {
    result.push({ ...section.label, position: position++, labelId: null });
    for (const item of section.items) {
      result.push({ ...item, position: position++, labelId: section.label.id ?? null });
    }
  }
  for (const item of grouped.ungroupedItems) {
    result.push({ ...item, position: position++, labelId: null });
  }
  return result;
}

function sameOrder(before: PackingItem[], after: PackingItem[]): boolean {
  if (before.length !== after.length) return false;
  return before.every(
    (item, index) => item.id === after[index].id && (item.labelId ?? null) === (after[index].labelId ?? null)
  );
}

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const copy = [...items];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

/**
 * Move `activeId` to the container/position implied by `overId` and return the
 * full re-flattened item list, or null when the drop is a no-op. Pure so it can
 * be unit-tested and reused for both live preview (drag over) and persistence.
 */
function computeReorder(working: PackingItem[], activeId: string, overId: string): PackingItem[] | null {
  if (activeId === overId) return null;
  const grouped = groupPackingItems(working);
  const activeKey = resolveContainerKey(grouped, activeId);
  const overKey = resolveContainerKey(grouped, overId);
  if (!activeKey || !overKey) return null;

  const active = working.find((item) => item.id === activeId);
  if (!active || active.isLabel) return null;

  // Mutable per-container item arrays keyed by container key.
  const containers = new Map<string, PackingItem[]>();
  for (const section of grouped.sections) containers.set(section.label.id!, [...section.items]);
  containers.set(UNGROUPED_KEY, [...grouped.ungroupedItems]);

  const sourceArr = containers.get(activeKey);
  const targetArr = containers.get(overKey);
  if (!sourceArr || !targetArr) return null;

  const oldIndex = sourceArr.findIndex((item) => item.id === activeId);
  const overIndex = overId.startsWith(CONTAINER_PREFIX) ? -1 : targetArr.findIndex((item) => item.id === overId);
  const newIndex = overIndex === -1 ? targetArr.length : overIndex;

  if (activeKey === overKey) {
    containers.set(activeKey, arrayMove(sourceArr, oldIndex, newIndex));
  } else {
    sourceArr.splice(oldIndex, 1);
    targetArr.splice(newIndex, 0, active);
  }

  const after = flatten({
    sections: grouped.sections.map((section) => ({ label: section.label, items: containers.get(section.label.id!)! })),
    ungroupedItems: containers.get(UNGROUPED_KEY)!,
  });
  if (sameOrder(flatten(grouped), after)) return null;
  return after;
}

export const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  const rectCollisions = rectIntersection(args);
  if (rectCollisions.length > 0) return rectCollisions;
  return closestCenter(args);
};

export function PackingListSortable({
  items,
  pendingItemIds,
  onRemoveItem,
  onToggleItem,
  onOptimisticReorder,
  onReorderItems,
  onEditItem,
  onAddItem,
  onAnnounceMove,
  isAdding,
}: PackingListSortableProps): ReactElement {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState<PackingItem[] | null>(null);
  const workingItems = localItems ?? items;
  const { sections, ungroupedItems } = useMemo(() => groupPackingItems(workingItems), [workingItems]);
  const completeLabelIds = useMemo(
    () =>
      new Set(
        sections
          .filter((section) => section.items.length > 0 && section.items.every((item) => item.done))
          .map((section) => section.label.id)
      ),
    [sections]
  );
  const activeItem = activeId !== null ? workingItems.find((item) => item.id === activeId) : undefined;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart({ active }: DragStartEvent): void {
    setActiveId(String(active.id));
  }

  function handleDragCancel(): void {
    setActiveId(null);
    setLocalItems(null);
  }

  function handleDragOver({ active, over }: DragOverEvent): void {
    if (!over) return;
    const base = localItems ?? items;
    const grouped = groupPackingItems(base);
    const activeKey = resolveContainerKey(grouped, String(active.id));
    const overKey = resolveContainerKey(grouped, String(over.id));
    if (!activeKey || !overKey || activeKey === overKey) return;
    const moved = computeReorder(base, String(active.id), String(over.id));
    if (moved) setLocalItems(moved);
  }

  function handleDragEnd({ active, over }: DragEndEvent): void {
    setActiveId(null);
    const working = localItems ?? items;
    setLocalItems(null);
    if (!over) return;
    // `working` already reflects the live cross-container preview from
    // handleDragOver. Apply any final within-container move implied by `over`,
    // falling back to the preview itself when `over` resolves to the slot the
    // item already occupies (e.g. dropping over the container as the last item).
    const moved = computeReorder(working, String(active.id), String(over.id)) ?? working;
    // The no-op decision must compare against the original props order, not the
    // live preview — otherwise a cross-container drop whose final slot matches
    // the preview is discarded and the item snaps back.
    if (sameOrder(flatten(groupPackingItems(items)), flatten(groupPackingItems(moved)))) return;
    onOptimisticReorder(moved);

    const movedActive = moved.find((item) => item.id === String(active.id));
    if (movedActive && onAnnounceMove) {
      const destination = movedActive.labelId
        ? (moved.find((item) => item.id === movedActive.labelId)?.name ?? "a section")
        : "Ungrouped";
      onAnnounceMove(`Moved ${movedActive.name} to ${destination}.`);
    }

    onReorderItems(
      moved.map((item) => ({ id: item.id!, labelId: item.labelId ?? null, position: item.position! })),
      () => onOptimisticReorder(null)
    );
  }

  const showUngrouped = ungroupedItems.length > 0 || sections.length > 0;

  return (
    <DndContext
      id="packing-list"
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <section className="flex flex-col gap-4" aria-label="Packing list">
        {sections.map((section) => (
          <DroppablePackingSection
            key={section.label.id}
            containerId={containerDomId(section.label.id!)}
            sortableIds={[section.label.id!, ...section.items.map((item) => item.id!)]}
          >
            <SortablePackingRow
              id={section.label.id!}
              item={section.label}
              isLabel
              isComplete={completeLabelIds.has(section.label.id!)}
              onRemove={() => onRemoveItem(section.label)}
              onEdit={
                section.label.id && onEditItem ? (name) => onEditItem(section.label.id as string, name) : undefined
              }
            />
            {section.items.length > 0 ? (
              <div className="ml-3 flex flex-col gap-2 border-l pl-3" style={{ borderColor: "var(--line)" }}>
                {section.items.map((item) => (
                  <SortablePackingRow
                    key={item.id}
                    id={item.id!}
                    item={item}
                    isPending={item.id ? pendingItemIds.has(item.id) : false}
                    onRemove={() => onRemoveItem(item)}
                    onToggle={() => void onToggleItem(item)}
                    onEdit={item.id && onEditItem ? (name) => onEditItem(item.id as string, name) : undefined}
                  />
                ))}
              </div>
            ) : null}
            {onAddItem ? (
              <div className="ml-3 mt-1">
                <ContextualAddForm
                  placeholder={`Add item under "${section.label.name}"…`}
                  afterItemId={section.label.id}
                  labelId={section.label.id}
                  isAdding={isAdding}
                  onAddItem={onAddItem}
                />
              </div>
            ) : null}
          </DroppablePackingSection>
        ))}

        {showUngrouped ? (
          <DroppablePackingSection
            containerId={containerDomId(UNGROUPED_KEY)}
            sortableIds={ungroupedItems.map((item) => item.id!)}
          >
            {sections.length > 0 ? (
              <h3 style={{ color: "var(--fg-2)", fontSize: "calc(13px * var(--font-scale))", fontWeight: 600 }}>
                Ungrouped
              </h3>
            ) : null}
            {ungroupedItems.map((item) => (
              <SortablePackingRow
                key={item.id}
                id={item.id!}
                item={item}
                isPending={item.id ? pendingItemIds.has(item.id) : false}
                onRemove={() => onRemoveItem(item)}
                onToggle={() => void onToggleItem(item)}
                onEdit={item.id && onEditItem ? (name) => onEditItem(item.id as string, name) : undefined}
              />
            ))}
            {onAddItem ? (
              <div className="mt-1">
                <ContextualAddForm
                  placeholder="Add item…"
                  afterItemId={ungroupedItems.length > 0 ? ungroupedItems[ungroupedItems.length - 1].id : undefined}
                  beforeItemId={ungroupedItems.length === 0 ? sections[0]?.label.id : undefined}
                  labelId={null}
                  isAdding={isAdding}
                  onAddItem={onAddItem}
                />
              </div>
            ) : null}
          </DroppablePackingSection>
        ) : null}
      </section>
      <DragOverlay dropAnimation={{ duration: 200, easing: "ease-out" }}>
        {activeItem ? (
          <PackingRow item={activeItem} isLabel={activeItem.isLabel} onRemove={() => {}} onToggle={undefined} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
