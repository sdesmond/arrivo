import { closestCenter, pointerWithin, rectIntersection, type CollisionDetection } from "@dnd-kit/core";
import type { PackingItem } from "@/data/types";

export interface PackingSection {
  label: PackingItem;
  items: PackingItem[];
}

export interface GroupedPackingItems {
  sections: PackingSection[];
  ungroupedItems: PackingItem[];
}

export const UNGROUPED_KEY = "__ungrouped__";
export const CONTAINER_PREFIX = "container:";

export function containerDomId(key: string): string {
  return `${CONTAINER_PREFIX}${key}`;
}

function byPosition(first: PackingItem, second: PackingItem): number {
  return (first.position ?? Infinity) - (second.position ?? Infinity);
}

export function groupPackingItems(items: PackingItem[]): GroupedPackingItems {
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

export function containerKeyOfItem(grouped: GroupedPackingItems, itemId: string): string | null {
  for (const section of grouped.sections) {
    if (section.label.id === itemId || section.items.some((item) => item.id === itemId)) {
      return section.label.id ?? null;
    }
  }
  if (grouped.ungroupedItems.some((item) => item.id === itemId)) {
    return UNGROUPED_KEY;
  }
  return null;
}

export function resolveContainerKey(grouped: GroupedPackingItems, id: string): string | null {
  if (id.startsWith(CONTAINER_PREFIX)) {
    return id.slice(CONTAINER_PREFIX.length);
  }
  return containerKeyOfItem(grouped, id);
}

export function flatten(grouped: GroupedPackingItems): PackingItem[] {
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

export function sameOrder(before: PackingItem[], after: PackingItem[]): boolean {
  if (before.length !== after.length) {
    return false;
  }

  return before.every(
    (item, index) => item.id === after[index].id && (item.labelId ?? null) === (after[index].labelId ?? null)
  );
}

export function arrayMove<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) {
    return [...items];
  }

  const copy = [...items];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

export function computeReorder(working: PackingItem[], activeId: string, overId: string): PackingItem[] | null {
  if (activeId === overId) {
    return null;
  }

  const grouped = groupPackingItems(working);
  const activeKey = resolveContainerKey(grouped, activeId);
  const overKey = resolveContainerKey(grouped, overId);
  if (!activeKey || !overKey) {
    return null;
  }

  const active = working.find((item) => item.id === activeId);
  if (!active || active.isLabel) {
    return null;
  }

  const containers = new Map<string, PackingItem[]>();
  for (const section of grouped.sections) {
    if (!section.label.id) return null;
    containers.set(section.label.id, [...section.items]);
  }
  containers.set(UNGROUPED_KEY, [...grouped.ungroupedItems]);

  const sourceItems = containers.get(activeKey);
  const targetItems = containers.get(overKey);
  if (!sourceItems || !targetItems) {
    return null;
  }

  const oldIndex = sourceItems.findIndex((item) => item.id === activeId);
  const overIndex = overId.startsWith(CONTAINER_PREFIX) ? -1 : targetItems.findIndex((item) => item.id === overId);
  const newIndex = overIndex === -1 ? targetItems.length : overIndex;

  if (activeKey === overKey) {
    containers.set(activeKey, arrayMove(sourceItems, oldIndex, newIndex));
  } else {
    containers.set(
      activeKey,
      sourceItems.filter((item) => item.id !== activeId)
    );
    targetItems.splice(newIndex, 0, active);
  }

  const after = flatten({
    sections: grouped.sections.map((section) => ({ label: section.label, items: containers.get(section.label.id!)! })),
    ungroupedItems: containers.get(UNGROUPED_KEY)!,
  });

  if (sameOrder(flatten(grouped), after)) {
    return null;
  }

  return after;
}

export const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }

  const rectCollisions = rectIntersection(args);
  if (rectCollisions.length > 0) {
    return rectCollisions;
  }

  return closestCenter(args);
};
