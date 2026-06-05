"use client";

import { useMemo, useRef, useState, type ReactElement } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { PackingItem } from "@/data/types";
import { PackingRow, SortablePackingRow } from "./packing-list-row";
import { ContextualAddForm } from "./packing-contextual-add-form";
import { DroppablePackingSection } from "./droppable-packing-section";
import {
  collisionDetection,
  computeReorder,
  containerDomId,
  groupPackingItems,
  flatten,
  resolveContainerKey,
  sameOrder,
  UNGROUPED_KEY,
} from "./packing-sort-utils";

export interface PackingListSortableProps {
  items: PackingItem[];
  pendingItemIds: Set<string>;
  collapsedLabels?: Set<string>;
  onToggleCollapse?: (labelId: string) => void;
  onRemoveItem: (item: PackingItem) => Promise<void>;
  onToggleItem?: (item: PackingItem) => Promise<void>;
  onOptimisticReorder: (reorderedItems: PackingItem[] | null) => void;
  onReorderItems: (ordered: { id: string; labelId: string | null; position: number }[], onError?: () => void) => void;
  onEditItem?: (id: string, name: string) => void;
  onAddItem?: (
    name: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null
  ) => Promise<void>;
  onAnnounceMove?: (message: string) => void;
  isAdding?: boolean;
}

export function PackingListSortable({
  items,
  pendingItemIds,
  collapsedLabels,
  onToggleCollapse,
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
  // When localItems is set (drag in progress), preserve array order rather than re-sorting by
  // position — flatten() now preserves original DB positions, so position-based sorting would
  // undo the intended preview order.
  const { sections, ungroupedItems } = useMemo(
    () => groupPackingItems(workingItems, localItems !== null),
    [workingItems, localItems]
  );
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
  const expandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOverIdRef = useRef<string | null>(null);

  function clearExpandTimeout(): void {
    if (expandTimeoutRef.current !== null) {
      clearTimeout(expandTimeoutRef.current);
      expandTimeoutRef.current = null;
    }
  }

  function handleDragStart({ active }: DragStartEvent): void {
    setActiveId(String(active.id));
    lastOverIdRef.current = null;
  }

  function handleDragCancel(): void {
    clearExpandTimeout();
    lastOverIdRef.current = null;
    setActiveId(null);
    setLocalItems(null);
  }

  function handleDragOver({ active, over }: DragOverEvent): void {
    if (!over) {
      clearExpandTimeout();
      lastOverIdRef.current = null;
      return;
    }
    const overId = String(over.id);
    if (overId === lastOverIdRef.current) return;
    lastOverIdRef.current = overId;

    const base = localItems ?? items;
    const grouped = groupPackingItems(base);
    const overKey = resolveContainerKey(grouped, overId);

    clearExpandTimeout();
    if (collapsedLabels && onToggleCollapse && overKey && overKey !== UNGROUPED_KEY && collapsedLabels.has(overKey)) {
      expandTimeoutRef.current = setTimeout(() => {
        onToggleCollapse(overKey);
        expandTimeoutRef.current = null;
      }, 700);
    }

    const activeKey = resolveContainerKey(grouped, String(active.id));
    if (!activeKey || !overKey || activeKey === overKey) return;
    const moved = computeReorder(base, String(active.id), overId);
    if (moved) setLocalItems(moved);
  }

  function handleDragEnd({ active, over }: DragEndEvent): void {
    clearExpandTimeout();
    lastOverIdRef.current = null;
    setActiveId(null);
    const working = localItems ?? items;
    setLocalItems(null);
    if (!over) return;

    // AC7: provide feedback when a label drag is attempted (labels are non-draggable)
    const draggedItem = working.find((item) => item.id === String(active.id));
    if (draggedItem?.isLabel) {
      onAnnounceMove?.("Labels cannot be reordered.");
      return;
    }
    // `working` already reflects the live cross-container preview from
    // handleDragOver. Apply any final within-container move implied by `over`,
    // falling back to the preview itself when `over` resolves to the slot the
    // item already occupies (e.g. dropping over the container as the last item).
    const moved = computeReorder(working, String(active.id), String(over.id)) ?? working;
    // The no-op decision must compare against the original props order, not the
    // live preview — otherwise a cross-container drop whose final slot matches
    // the preview is discarded and the item snaps back.
    // Bug #4: filter out items with undefined id before invoking callbacks to prevent
    // server-server mismatches and silent data corruption.
    const movedWithIds = moved.filter((item): item is PackingItem & { id: string } => item.id !== undefined);
    if (movedWithIds.length === 0) return;

    // Bug #1: compare `movedWithIds` directly (not via groupPackingItems+flatten) because
    // flatten now preserves original position values; re-grouping would re-sort by
    // position and produce the original order, making every reorder look like a no-op.
    if (sameOrder(flatten(groupPackingItems(items)), movedWithIds)) return;
    const optimisticItems = movedWithIds.map((item, index) => ({ ...item, position: index }));
    onOptimisticReorder(optimisticItems);

    const movedActive = movedWithIds.find((item) => item.id === String(active.id));
    if (movedActive && onAnnounceMove) {
      const destination = movedActive.labelId
        ? (movedWithIds.find((item) => item.id === movedActive.labelId)?.name ?? "a section")
        : "Ungrouped";
      onAnnounceMove(`Moved ${movedActive.name} to ${destination}.`);
    }

    // Give the optimistic items the same final positions sent to the server so
    // position-based grouping keeps the dropped order while revalidation runs.
    onReorderItems(
      optimisticItems.map((item) => ({ id: item.id, labelId: item.labelId ?? null, position: item.position })),
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
            sortableIds={section.items.map((item) => item.id!)}
            collapsed={collapsedLabels?.has(section.label.id!)}
            header={
              <PackingRow
                item={section.label}
                isLabel
                isComplete={completeLabelIds.has(section.label.id!)}
                collapsed={collapsedLabels?.has(section.label.id!)}
                onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(section.label.id!) : undefined}
                onRemove={() => onRemoveItem(section.label)}
                onEdit={
                  section.label.id && onEditItem ? (name) => onEditItem(section.label.id as string, name) : undefined
                }
              />
            }
          >
            {section.items.length > 0 || onAddItem ? (
              <div className="ml-3 flex flex-col gap-2 border-l pl-3" style={{ borderColor: "var(--line)" }}>
                {section.items.map((item) => (
                  <SortablePackingRow
                    key={item.id}
                    id={item.id!}
                    item={item}
                    isActiveDragSource={activeId === item.id}
                    isPending={item.id ? pendingItemIds.has(item.id) : false}
                    onRemove={() => onRemoveItem(item)}
                    onToggle={onToggleItem ? () => void onToggleItem(item) : undefined}
                    onEdit={item.id && onEditItem ? (name) => onEditItem(item.id as string, name) : undefined}
                  />
                ))}
                {onAddItem ? (
                  <ContextualAddForm
                    placeholder={`add to ${section.label.name}`}
                    afterItemId={section.items.at(-1)?.id ?? section.label.id}
                    labelId={section.label.id}
                    isAdding={isAdding}
                    onAddItem={onAddItem}
                  />
                ) : null}
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
                isActiveDragSource={activeId === item.id}
                isPending={item.id ? pendingItemIds.has(item.id) : false}
                onRemove={() => onRemoveItem(item)}
                onToggle={onToggleItem ? () => void onToggleItem(item) : undefined}
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
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <PackingRow item={activeItem} isLabel={activeItem.isLabel} onRemove={() => {}} onToggle={undefined} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
