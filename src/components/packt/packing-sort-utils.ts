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
  const posA = first.position ?? Infinity;
  const posB = second.position ?? Infinity;
  // Bug #5: Infinity - Infinity = NaN causes unstable sort; use 0 (stable) as tiebreaker
  if (posA === Infinity && posB === Infinity) return 0;
  return posA - posB;
}

// preserveOrder=true skips byPosition sorting so that drag-preview state (localItems) is
// displayed in array order rather than being re-sorted back to the original DB order.
export function groupPackingItems(items: PackingItem[], preserveOrder = false): GroupedPackingItems {
  const labels = items.filter((item) => item.isLabel);
  if (!preserveOrder) labels.sort(byPosition);
  // Bug #2: filter out undefined ids before building the Set to prevent "undefined" string collisions
  const labelIds = new Set(labels.map((label) => label.id).filter((id): id is string => id !== undefined));
  const sections: PackingSection[] = labels.map((label) => {
    // Only match items whose labelId is non-null to prevent duplication when
    // label.id is undefined (items with undefined labelId would match via
    // undefined === undefined and also pass the ungrouped filter below).
    const sectionItems = items.filter((item) => !item.isLabel && item.labelId != null && item.labelId === label.id);
    if (!preserveOrder) sectionItems.sort(byPosition);
    return { label, items: sectionItems };
  });
  const ungroupedItems = items.filter((item) => !item.isLabel && (item.labelId == null || !labelIds.has(item.labelId)));
  if (!preserveOrder) ungroupedItems.sort(byPosition);
  return { sections, ungroupedItems };
}

export function containerKeyOfItem(grouped: GroupedPackingItems, itemId: string): string | null {
  for (const [index, section] of grouped.sections.entries()) {
    if (section.label.id === itemId || section.items.some((item) => item.id === itemId)) {
      // Bug #3: label.id may be undefined; return a synthetic key rather than null so the caller
      // gets a non-null result (computeReorder will still bail when it can't find the container)
      // Include index to prevent key collision when multiple sections share a name.
      return section.label.id ?? `section:${index}:${section.label.name ?? "unknown"}`;
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

  for (const section of grouped.sections) {
    // Bug #1: preserve each item's original position value rather than assigning sequential 0,1,2…
    // Callers that need ordered positions for persistence use array index, not item.position.
    result.push({ ...section.label, labelId: null });
    for (const item of section.items) {
      result.push({ ...item, labelId: section.label.id ?? null });
    }
  }

  for (const item of grouped.ungroupedItems) {
    result.push({ ...item, labelId: null });
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

  // Bug #6: dropping a non-label item onto a label header should not move it into the section;
  // treat it as a no-op so the item stays at its current (valid, non-section) position
  const overIsLabel =
    !overId.startsWith(CONTAINER_PREFIX) && (working.find((item) => item.id === overId)?.isLabel ?? false);
  if (overIsLabel) {
    return null;
  }

  const grouped = groupPackingItems(working);
  const activeKey = resolveContainerKey(grouped, activeId);
  const overKey = resolveContainerKey(grouped, overId);
  if (!activeKey || !overKey) {
    return null;
  }

  const active = working.find((item) => item.id === activeId);
  // Bug #7: labels cannot be reordered; this path is guarded upstream (labels have no drag handle)
  // but the explicit check keeps computeReorder safe for programmatic callers
  if (!active || active.isLabel) {
    return null;
  }

  const containers = new Map<string, PackingItem[]>();
  for (const section of grouped.sections) {
    if (!section.label.id) continue;
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
