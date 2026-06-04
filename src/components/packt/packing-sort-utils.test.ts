import { describe, expect, it } from "vitest";
import type { PackingItem } from "@/data/types";
import {
  arrayMove,
  computeReorder,
  containerKeyOfItem,
  flatten,
  groupPackingItems,
  sameOrder,
  UNGROUPED_KEY,
} from "./packing-sort-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function item(id: string, position: number | undefined, labelId?: string | null, isLabel?: boolean): PackingItem {
  return { id, name: id, done: false, position, labelId: labelId ?? null, isLabel: isLabel ?? false };
}

function label(id: string | undefined, position: number | undefined): PackingItem {
  return { id, name: `Label-${id ?? "undef"}`, done: false, position, labelId: null, isLabel: true };
}

// ---------------------------------------------------------------------------
// byPosition / groupPackingItems (Bug #2, #5)
// ---------------------------------------------------------------------------

describe("groupPackingItems", () => {
  it("returns empty sections and ungrouped items for an empty list", () => {
    expect(groupPackingItems([])).toEqual({ sections: [], ungroupedItems: [] });
  });

  it("sorts labels and section items by position", () => {
    const items: PackingItem[] = [item("c", 20, null), item("a", 0, null), item("b", 10, null)];
    const { ungroupedItems } = groupPackingItems(items);
    expect(ungroupedItems.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("Bug #2: filters undefined label ids from labelIds Set so items are not falsely matched as grouped", () => {
    // If label.id is undefined, building Set without filtering adds "undefined" (the string).
    // An item with labelId === undefined would then be treated as grouped — wrong.
    const undefLabel = label(undefined, 0);
    const orphan = item("orphan", 1, undefined as unknown as string); // labelId matches the "undefined" string bug
    const items: PackingItem[] = [undefLabel, orphan];

    const { sections, ungroupedItems } = groupPackingItems(items);
    // The undefined-id label still becomes a section entry
    expect(sections).toHaveLength(1);
    // The item whose labelId is undefined must NOT land inside the section
    expect(ungroupedItems.map((i) => i.id)).toContain("orphan");
    expect(sections[0].items.map((i) => i.id)).not.toContain("orphan");
  });

  it("Bug #5: produces deterministic (stable) order when all positions are undefined", () => {
    const items: PackingItem[] = [
      { id: "x", name: "x", done: false, position: undefined, labelId: null, isLabel: false },
      { id: "y", name: "y", done: false, position: undefined, labelId: null, isLabel: false },
      { id: "z", name: "z", done: false, position: undefined, labelId: null, isLabel: false },
    ];
    // Should not throw and should return all three items
    const { ungroupedItems } = groupPackingItems(items);
    expect(ungroupedItems).toHaveLength(3);
    // All must be present (stable — no NaN-induced drops)
    expect(ungroupedItems.map((i) => i.id).sort()).toEqual(["x", "y", "z"]);
  });

  it("keeps all items ungrouped when there are no labels", () => {
    const items: PackingItem[] = [
      { id: "passport", name: "Passport", done: false, position: 1, labelId: null, isLabel: false },
      { id: "adapter", name: "Adapter", done: false, position: 0, labelId: null, isLabel: false },
    ];

    const { sections, ungroupedItems } = groupPackingItems(items);

    expect(sections).toEqual([]);
    expect(ungroupedItems.map((packingItem) => packingItem.id)).toEqual(["adapter", "passport"]);
  });

  it("keeps a single-item section grouped without duplicating it in Ungrouped", () => {
    const items: PackingItem[] = [label("documents", 0), item("passport", 1, "documents")];

    const { sections, ungroupedItems } = groupPackingItems(items);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.items.map((packingItem) => packingItem.id)).toEqual(["passport"]);
    expect(ungroupedItems).toEqual([]);
  });

  it("handles mixed labels and items with undefined properties without dropping valid rows", () => {
    const undefinedLabel = label(undefined, 0);
    const gearLabel = label("gear", 1);
    const items: PackingItem[] = [
      undefinedLabel,
      gearLabel,
      { id: "orphan", name: "Orphan", done: false, position: undefined, labelId: null },
      { id: "tent", name: "Tent", done: false, position: 2, labelId: "gear", isLabel: false },
      { id: "map", name: "Map", done: false, position: 3, labelId: null, isLabel: false },
    ];

    const { sections, ungroupedItems } = groupPackingItems(items);

    expect(sections.map((section) => section.label.name)).toEqual(["Label-undef", "Label-gear"]);
    expect(sections[0]?.items).toEqual([]);
    expect(sections[1]?.items.map((packingItem) => packingItem.id)).toEqual(["tent"]);
    expect(ungroupedItems.map((packingItem) => packingItem.id)).toEqual(["map", "orphan"]);
  });
});

// ---------------------------------------------------------------------------
// containerKeyOfItem (Bug #3)
// ---------------------------------------------------------------------------

describe("containerKeyOfItem", () => {
  it("returns the section label id for items within a section", () => {
    const grouped = groupPackingItems([label("lbl", 0), item("a", 1, "lbl")]);
    expect(containerKeyOfItem(grouped, "a")).toBe("lbl");
    expect(containerKeyOfItem(grouped, "lbl")).toBe("lbl");
  });

  it("returns UNGROUPED_KEY for ungrouped items", () => {
    const grouped = groupPackingItems([item("a", 0, null)]);
    expect(containerKeyOfItem(grouped, "a")).toBe(UNGROUPED_KEY);
  });

  it("Bug #3: returns a non-null synthetic key when section label.id is undefined", () => {
    // Build a grouped structure where a section's label.id is undefined (simulates a degenerate
    // item that arrived without an id) and verify that looking up a child of that section returns
    // a non-null key rather than null, so computeReorder gets a usable value.
    const itemsWithLabel: PackingItem[] = [
      { id: "lbl-undef", name: "Label", done: false, position: 0, labelId: null, isLabel: true },
      { id: "child2", name: "child2", done: false, position: 1, labelId: "lbl-undef", isLabel: false },
    ];
    const grouped = groupPackingItems(itemsWithLabel);
    // Mutate the label id to undefined after grouping to simulate the corrupt-data scenario
    if (grouped.sections[0]) {
      (grouped.sections[0].label as { id: string | undefined }).id = undefined;
    }
    const key = containerKeyOfItem(grouped, "child2");
    expect(key).not.toBeNull();
    expect(typeof key).toBe("string");
  });

  it("returns null when item is not found anywhere", () => {
    const grouped = groupPackingItems([item("a", 0, null)]);
    expect(containerKeyOfItem(grouped, "missing")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// flatten (Bug #1)
// ---------------------------------------------------------------------------

describe("flatten", () => {
  it("Bug #1: preserves original position values instead of renumbering from 0", () => {
    const items: PackingItem[] = [label("lbl", 0), item("a", 10, "lbl"), item("b", 20, "lbl"), item("c", 30, null)];
    const grouped = groupPackingItems(items);
    const result = flatten(grouped);

    expect(result.map((i) => i.position)).toEqual([0, 10, 20, 30]);
  });

  it("preserves positions for sparse non-sequential values [0, 10, 20]", () => {
    const items: PackingItem[] = [item("a", 0, null), item("b", 10, null), item("c", 20, null)];
    const result = flatten(groupPackingItems(items));
    expect(result.map((i) => i.position)).toEqual([0, 10, 20]);
  });

  it("sets labelId correctly: null for ungrouped items, section label id for section items", () => {
    const items: PackingItem[] = [label("lbl", 0), item("a", 1, "lbl"), item("b", 2, null)];
    const result = flatten(groupPackingItems(items));
    expect(result.find((i) => i.id === "a")?.labelId).toBe("lbl");
    expect(result.find((i) => i.id === "b")?.labelId).toBeNull();
    expect(result.find((i) => i.id === "lbl")?.labelId).toBeNull();
  });

  it("produces items in section-then-ungrouped order", () => {
    const items: PackingItem[] = [label("lbl", 0), item("a", 1, "lbl"), item("c", 3, null), item("b", 2, "lbl")];
    const result = flatten(groupPackingItems(items));
    expect(result.map((i) => i.id)).toEqual(["lbl", "a", "b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// sameOrder
// ---------------------------------------------------------------------------

describe("sameOrder", () => {
  it("returns true for identical arrays", () => {
    const arr = [item("a", 0), item("b", 1)];
    expect(sameOrder(arr, arr)).toBe(true);
  });

  it("returns false when item order differs", () => {
    expect(sameOrder([item("a", 0), item("b", 1)], [item("b", 1), item("a", 0)])).toBe(false);
  });

  it("returns false when labelIds differ at same index", () => {
    expect(sameOrder([item("a", 0, "lbl")], [item("a", 0, null)])).toBe(false);
  });

  it("returns false when lengths differ", () => {
    expect(sameOrder([item("a", 0)], [item("a", 0), item("b", 1)])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeReorder (Bugs #3, #6, #7)
// ---------------------------------------------------------------------------

describe("computeReorder", () => {
  const baseItems: PackingItem[] = [label("lbl", 0), item("a", 1, "lbl"), item("b", 2, "lbl"), item("c", 3, null)];

  it("reorders two items within the same section and preserves their original positions", () => {
    const result = computeReorder(baseItems, "a", "b");
    expect(result).not.toBeNull();
    expect(result!.map((i) => i.id)).toEqual(["lbl", "b", "a", "c"]);
    // Positions preserved (not renumbered)
    expect(result!.find((i) => i.id === "b")?.position).toBe(2);
    expect(result!.find((i) => i.id === "a")?.position).toBe(1);
  });

  it("moves an ungrouped item into a section", () => {
    const result = computeReorder(baseItems, "c", "a");
    expect(result).not.toBeNull();
    expect(result!.find((i) => i.id === "c")?.labelId).toBe("lbl");
  });

  it("returns null for same active and over id (no-op)", () => {
    expect(computeReorder(baseItems, "a", "a")).toBeNull();
  });

  it("Bug #7: returns null when active item is a label (labels cannot be reordered)", () => {
    expect(computeReorder(baseItems, "lbl", "c")).toBeNull();
  });

  it("Bug #6: returns null when over item is a label (non-label dragged onto a label header)", () => {
    // Dragging item-c over the section label should be a no-op, not move c into the section
    expect(computeReorder(baseItems, "c", "lbl")).toBeNull();
  });

  it("does NOT return null when over is a container key (not a label item)", () => {
    // container:lbl is a valid drop zone (end of section), not a label item
    const result = computeReorder(baseItems, "c", "container:lbl");
    expect(result).not.toBeNull();
    expect(result!.find((i) => i.id === "c")?.labelId).toBe("lbl");
  });

  it("returns null when the resulting order is identical to the input", () => {
    // Dragging a to the same position
    expect(computeReorder(baseItems, "a", "a")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// arrayMove
// ---------------------------------------------------------------------------

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
