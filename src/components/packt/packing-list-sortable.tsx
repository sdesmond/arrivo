"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent, type ReactElement } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { PackingItem } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PackingRow, SortablePackingRow } from "./packing-list-row";

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
  onReorderItems: (orderedItemIds: string[], onError?: () => void) => void;
  onEditItem?: (id: string, name: string) => void;
  onAddItem?: (name: string, isLabel?: boolean, afterItemId?: string, beforeItemId?: string) => void;
  isAdding?: boolean;
}

function groupPackingItems(items: PackingItem[]): GroupedPackingItems {
  const sortedItems = [...items].sort((first, second) => {
    const firstPosition = first.position ?? Infinity;
    const secondPosition = second.position ?? Infinity;
    return firstPosition - secondPosition;
  });

  const sections: PackingSection[] = [];
  const ungroupedItems: PackingItem[] = [];
  let currentSection: PackingSection | null = null;

  for (const item of sortedItems) {
    if (item.isLabel) {
      currentSection = { label: item, items: [] };
      sections.push(currentSection);
      continue;
    }

    if (currentSection) {
      currentSection.items.push(item);
      continue;
    }

    ungroupedItems.push(item);
  }

  return { sections, ungroupedItems };
}

interface ContextualAddFormProps {
  placeholder: string;
  afterItemId?: string;
  beforeItemId?: string;
  isAdding?: boolean;
  onAddItem: (name: string, isLabel?: boolean, afterItemId?: string, beforeItemId?: string) => void;
}

function ContextualAddForm({
  placeholder,
  afterItemId,
  beforeItemId,
  isAdding,
  onAddItem,
}: ContextualAddFormProps): ReactElement {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isAdding) return;
    onAddItem(trimmed, false, afterItemId, beforeItemId);
    setValue("");
  }

  return (
    <form className="flex items-center gap-2" onSubmit={handleSubmit}>
      <Input
        className="h-9 flex-1 rounded-xl border-0 px-3 text-sm shadow-none"
        disabled={isAdding}
        maxLength={100}
        placeholder={placeholder}
        style={{ background: "var(--surface-2)", color: "var(--fg)" }}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
      />
      <Button
        className="h-9 min-w-9 rounded-xl px-2"
        disabled={isAdding || !value.trim()}
        type="submit"
        variant="outline"
        size="sm"
        title="Add item here"
        aria-label="Add item here"
      >
        <Plus size={14} strokeWidth={1.5} />
      </Button>
    </form>
  );
}

export function PackingListSortable({
  items,
  pendingItemIds,
  onRemoveItem,
  onToggleItem,
  onOptimisticReorder,
  onReorderItems,
  onEditItem,
  onAddItem,
  isAdding,
}: PackingListSortableProps): ReactElement {
  const [activeId, setActiveId] = useState<string | null>(null);
  const { sections, ungroupedItems } = useMemo(() => groupPackingItems(items), [items]);
  const completeLabelIds = useMemo(
    () =>
      new Set(
        sections
          .filter((section) => section.items.length > 0 && section.items.every((item) => item.done))
          .map((section) => section.label.id)
      ),
    [sections]
  );
  const visualOrder = useMemo(() => {
    const result: PackingItem[] = [];
    for (const section of sections) {
      result.push(section.label);
      for (const sectionItem of section.items) {
        result.push(sectionItem);
      }
    }
    for (const item of ungroupedItems) {
      result.push(item);
    }
    return result;
  }, [sections, ungroupedItems]);
  const activeItem = activeId !== null ? visualOrder.find((item) => item.id === activeId) : undefined;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart({ active }: DragStartEvent): void {
    setActiveId(String(active.id));
  }

  function handleDragCancel(): void {
    setActiveId(null);
  }

  function handleDragEnd({ active, over }: DragEndEvent): void {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIdx = visualOrder.findIndex((item) => item.id === String(active.id));
    const newIdx = visualOrder.findIndex((item) => item.id === String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(visualOrder, oldIdx, newIdx).map((item, index) => ({ ...item, position: index }));
    onOptimisticReorder(reordered);
    onReorderItems(
      reordered.map((item) => item.id!),
      () => onOptimisticReorder(null)
    );
  }

  return (
    <DndContext
      id="packing-list"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={visualOrder.filter((item) => item.id != null).map((item) => item.id!)}
        strategy={verticalListSortingStrategy}
      >
        <section className="flex flex-col gap-4" aria-label="Packing list">
          {sections.map((section) => (
            <div key={section.label.id} className="flex flex-col gap-2">
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
                    isAdding={isAdding}
                    onAddItem={onAddItem}
                  />
                </div>
              ) : null}
            </div>
          ))}

          {ungroupedItems.length > 0 || (sections.length > 0 && onAddItem) ? (
            <div className="flex flex-col gap-2">
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
                    isAdding={isAdding}
                    onAddItem={onAddItem}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 200, easing: "ease-out" }}>
        {activeItem ? (
          <PackingRow item={activeItem} isLabel={activeItem.isLabel} onRemove={() => {}} onToggle={undefined} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
