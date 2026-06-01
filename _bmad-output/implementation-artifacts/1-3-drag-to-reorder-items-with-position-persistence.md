# Story 1.3: Drag-to-Reorder Items with Position Persistence

Status: done

## Story

As a traveler,
I want to drag items into my preferred order and have that order stick,
so that my packing list reflects the sequence I actually pack in.

FRs covered: FR29, FR30, FR31, NFR3, NFR6, NFR9, NFR10, NFR12

## Acceptance Criteria

**AC1 — Drag to new position**
Given the user is on the packing tab with multiple items
When they drag an item to a new position
Then the item moves to that position in the list
And the new position persists after a page reload

**AC2 — Labels cannot be dragged**
Given the packing list contains section labels
Then section labels cannot be dragged — drag handles are absent or inert on labels (Phase 1: items only)

**AC3 — Keyboard reorder**
Given the user focuses an item
When they use keyboard controls (e.g., Space to activate drag, arrow keys to navigate, Space/Enter to drop) to move the item up or down
Then the item moves one position in the indicated direction
And the new position persists after a page reload

**AC4 — 60fps during drag**
Given the user is actively dragging an item
Then the drag animation renders at 60fps with no visible frame drops

**AC5 — Keyboard accessibility**
Given a user who cannot use drag
When they use keyboard reorder on any item
Then all reorder controls are fully keyboard-accessible with a visible focus indicator

## Tasks / Subtasks

- [x] Pre-split — extract `PackingRow` into `packing-list-row.tsx` before adding DnD (Component size gate)
  - [x] Create `src/components/packt/packing-list-row.tsx` (new file)
  - [x] Move `PackingRowProps` interface and `PackingRow` component into it; add `"use client"` as first line
  - [x] Add `SortablePackingRowProps` interface and `SortablePackingRow` component to `packing-list-row.tsx` (see Dev Notes for full spec)
  - [x] In `packing-list-view.tsx`, replace the inline `PackingRow` + `PackingRowProps` with imports from `./packing-list-row`
  - [x] Verify `packing-list-view.tsx` line count stays at or below 250 after split + DnD additions
- [x] Server action — `reorderPackingItems` (AC: 1, 3, NFR6)
  - [x] Add `reorderPackingItems(tripId: string, orderedItemIds: string[]): Promise<void>` to `src/app/(app)/trips/actions.ts`
  - [x] `requireUser()` + `assertTripAccess(tripId, user.id!, "editor")` before any DB write
  - [x] Transaction: `for (let i = 0; i < orderedItemIds.length; i++) { await tx.update(packingItems).set({ position: i }).where(and(eq(packingItems.id, orderedItemIds[i]), eq(packingItems.tripId, tripId))); }`
  - [x] `revalidatePath(`/trips/${tripId}`)` after transaction
- [x] Component — `PackingListView` DnD + drag handle (AC: 1–5)
  - [x] Add `onReorderItems: (orderedItemIds: string[]) => void` to `PackingListViewProps`
  - [x] Add `dragHandle?: ReactElement` to `PackingRowProps` — render before checkbox in the row
  - [x] Add `SortablePackingRow` function component inside the file (calls `useSortable({ id, disabled: isLabel, animateLayoutChanges: () => false })`, renders `<PackingRow dragHandle={...} />`)
  - [x] Add `localItems: PackingItem[] | null` state — null means use `items` prop
  - [x] Reset `localItems` to `null` in the "derive state from props" block when `prevItems !== items`
  - [x] Add `activeId: string | null` state (for `DragOverlay`)
  - [x] Compute `effectiveItems = localItems ?? items`
  - [x] Compute `visualOrder` memoized: flat array of all items in visual DOM order (sections first label+items, then ungrouped items last)
  - [x] Add `sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`
  - [x] Add `handleDragStart`, `handleDragCancel`, `handleDragEnd` functions
  - [x] Wrap the list in `<DndContext id="packing-list" sensors={sensors} collisionDetection={closestCenter} onDragStart={...} onDragCancel={...} onDragEnd={...}>`
  - [x] Inside: `<SortableContext items={visualOrder.map(i => i.id!)} strategy={verticalListSortingStrategy}>`
  - [x] Replace all `<PackingRow ... />` instances with `<SortablePackingRow ... />` (pass `id={item.id!}`)
  - [x] Add `<DragOverlay dropAnimation={null}>{activeId ? <PackingRow ... /> : null}</DragOverlay>` after `</SortableContext>`
  - [x] Import `GripVertical` from `lucide-react`
  - [x] Add dnd-kit imports: `DndContext`, `DragOverlay`, `closestCenter`, `PointerSensor`, `KeyboardSensor`, `useSensor`, `useSensors`, `type DragEndEvent`, `type DragStartEvent` from `@dnd-kit/core`; `SortableContext`, `useSortable`, `sortableKeyboardCoordinates`, `verticalListSortingStrategy`, `arrayMove` from `@dnd-kit/sortable`; `CSS` from `@dnd-kit/utilities`
- [x] Handler — `handleReorderPackingItems` (AC: 1, 3)
  - [x] Add `handleReorderPackingItems: (orderedItemIds: string[]) => void` to `TripDetailHandlers` interface in `use-trip-detail-handlers.ts`
  - [x] Implement in `useTripDetailHandlers`: `React.startTransition(async () => { try { await reorderPackingItems(trip.id, orderedItemIds); } catch (error) { toast.error(...); router.refresh(); } })`
  - [x] Import `reorderPackingItems` from `../actions`
  - [x] Add to the return object
- [x] Thread prop — `trip-detail-tab-body.tsx` (AC: 1, 3)
  - [x] Add `onReorderPackingItems: (orderedItemIds: string[]) => void` to `TripDetailTabBodyProps`
  - [x] Destructure and pass `onReorderItems={onReorderPackingItems}` to `<PackingListView>`
- [x] Thread prop — `page-client.tsx` (AC: 1, 3)
  - [x] Pass `onReorderPackingItems={handlers.handleReorderPackingItems}` to `<TripDetailTabBody>`
- [x] Unit tests — `packing-list-view.test.tsx` (AC: 1, 2, 5)
  - [x] Add `vi.mock("@dnd-kit/sortable", ...)`, `vi.mock("@dnd-kit/core", ...)`, `vi.mock("@dnd-kit/utilities", ...)` at top of file (before existing imports); mocks must render children transparently so existing tests still pass
  - [x] `renders a drag handle button on item rows`
  - [x] `does not render a drag handle on section label rows`
  - [x] `drag handle button has min-h-11 and min-w-11 classes (touch target)`
  - [x] `useSortable called with disabled: true for label rows` (spy on mock)
  - [x] `useSortable called with animateLayoutChanges that returns false` (spy on mock)
- [x] E2E — `packing-tab.feature` + `packing-tab.steps.ts` (AC: 1, 3)
  - [x] Add `E2E_PACKING_REORDER_ITEMS` constant to `tests/e2e/e2e-seed-data.ts` (3 items at positions 0, 1, 2)
  - [x] Scenario: User keyboard-reorders an item and position persists after reload

## Dev Notes

### Existing State (Brownfield)

Everything from Stories 1.1 and 1.2 is in place. Do NOT modify:
- `addPackingItem`, `togglePackingItem`, `removePackingItem` actions — correct as-is
- `PackingRow` rendering, checkbox interaction, aria-live announcements — leave unchanged
- `groupPackingItems` algorithm — still used for visual grouping; `localItems` replaces `items` as its input during optimistic reorder
- `handleAddPackingItem`, `handleRemovePackingItem`, `handleTogglePackingItem` in `use-trip-detail-handlers.ts` — follow their exact pattern

| Artifact | Location | Status |
|---|---|---|
| `packingItems` table | `src/db/schema.ts:216` | Already has `position: integer` column |
| `addPackingItem` action | `src/app/(app)/trips/actions.ts:455` | Already correct |
| `togglePackingItem` action | `src/app/(app)/trips/actions.ts:473` | Already correct |
| `removePackingItem` action | `src/app/(app)/trips/actions.ts:483` | Already correct |
| `PackingListView` | `src/components/packt/packing-list-view.tsx` | Add DnD to this file |
| `PackingRow` | `src/components/packt/packing-list-view.tsx:130` | Move to `packing-list-row.tsx`; add `dragHandle?: ReactElement` prop |
| `SortablePackingRow` | NEW `src/components/packt/packing-list-row.tsx` | See `SortablePackingRowProps` interface spec in Dev Notes |
| `TripDetailHandlers` | `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts:38` | Add `handleReorderPackingItems` |
| `TripDetailTabBodyProps` | `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Add `onReorderPackingItems` prop |
| `page-client.tsx` | `src/app/(app)/trips/[tripId]/page-client.tsx` | Thread `handleReorderPackingItems` |

### Existing dnd-kit Pattern to Reuse

The event drag-and-drop implementation in `src/components/packt/day-card-dnd.tsx` and `src/components/packt/day-card-sortables.tsx` uses the exact same library version. Key patterns to copy:

**Sensor setup (from `day-card-dnd.tsx:94`):**
```tsx
const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
```
For packing, also add `KeyboardSensor` for FR30:
```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
);
```

**DndContext id**: use `"packing-list"` (must be unique on page; day cards use `"day-{dayNumber}"`)

**SortableContext items**: pass all IDs in visual DOM order — labels and items, because disabled items need to be registered for collision detection to work correctly.

**Sortable wrapper pattern (from `day-card-sortables.tsx:26–39`):**
```tsx
interface SortablePackingRowProps extends PackingRowProps {
  id: string;
}

function SortablePackingRow({ id, ...props }: SortablePackingRowProps): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: props.isLabel,
    animateLayoutChanges: () => false,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  const dragHandle = props.isLabel ? undefined : (
    <span
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${props.item.name}`}
      className="flex min-h-11 min-w-11 items-center justify-center"
      title={`Reorder ${props.item.name}`}
      style={{ cursor: "grab", touchAction: "none" }}
    >
      <GripVertical size={14} strokeWidth={1.5} />
    </span>
  );
  return (
    <div ref={setNodeRef} style={style}>
      <PackingRow {...props} dragHandle={dragHandle} />
    </div>
  );
}
```

**IMPORTANT**: `disabled: props.isLabel` — labels are registered in the context (needed for collision detection) but their sortable activation is disabled, so they can't be dragged. Items dragged OVER a disabled label will snap to the nearest active sortable item.

### PackingRow — Adding `dragHandle` Prop

Current `PackingRowProps` (line 38):
```ts
interface PackingRowProps {
  item: PackingItem;
  isLabel?: boolean;
  isPending?: boolean;
  onRemove: () => void;
  onToggle?: () => void;
}
```

After:
```ts
interface PackingRowProps {
  item: PackingItem;
  isLabel?: boolean;
  isPending?: boolean;
  dragHandle?: ReactElement;  // NEW — rendered before checkbox
  onRemove: () => void;
  onToggle?: () => void;
}
```

In `PackingRow` JSX, render `{dragHandle ? dragHandle : null}` as the FIRST child inside the outer `div` (before the checkbox button). The drag handle `<span>` has `style={{ touchAction: "none" }}` to prevent scroll-during-drag on mobile.

Resulting item row layout: `[drag handle] [checkbox] [name] [remove button]`
Labels get: `[name+subtitle] [remove button]` (no drag handle, no checkbox — as before)

### Visual Order Construction for SortableContext

The `SortableContext` items array MUST match the visual DOM order. Build from `sections` and `ungroupedItems`:

```ts
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
```

Pass `visualOrder.map((i) => i.id!)` to `<SortableContext items={...}>`.

### Drag End Logic — Optimistic Order + Server Persist

```ts
function handleDragEnd({ active, over }: DragEndEvent): void {
  setActiveId(null);
  if (!over || active.id === over.id) return;
  const oldIdx = visualOrder.findIndex((i) => i.id === String(active.id));
  const newIdx = visualOrder.findIndex((i) => i.id === String(over.id));
  if (oldIdx === -1 || newIdx === -1) return;
  const reordered = arrayMove(visualOrder, oldIdx, newIdx);
  // Optimistic: update local positions
  setLocalItems(reordered.map((i, index) => ({ ...i, position: index })));
  // Persist to server
  onReorderItems(reordered.map((i) => i.id!));
}
```

`active.id` and `over.id` are typed as `UniqueIdentifier` (string | number) in dnd-kit — always `String(...)` them before comparison.

`localItems` drives the rendering after drag; when the server revalidation fires and `items` prop changes, the "derive state from props" pattern (already in the component at line 213–217) resets `localItems` to `null`:

```ts
// EXTEND the existing if-block (line 213):
if (prevItems !== items) {
  setPrevItems(items);
  setIsSubmitting(false);
  setPendingItemIds(new Set());
  setLocalItems(null);  // ADD THIS LINE
}
```

### effectiveItems — Single Source of Truth for Rendering

```ts
const effectiveItems = localItems ?? items;
const { sections, ungroupedItems } = useMemo(() => groupPackingItems(effectiveItems), [effectiveItems]);
```

Replace the existing line that destructures `groupPackingItems(items)` — replace `items` with `effectiveItems`.

### DragOverlay

Compute `activeItem` as a variable above the JSX `return`, then reference it in the overlay:
```tsx
// Above the return statement, alongside other derived values:
const activeItem = activeId !== null ? visualOrder.find((i) => i.id === activeId) : undefined;
```

```tsx
// After </SortableContext>:
<DragOverlay dropAnimation={null}>
  {activeItem ? (
    <PackingRow
      item={activeItem}
      isLabel={activeItem.isLabel}
      onRemove={() => {}}
      onToggle={activeItem.isLabel ? undefined : () => {}}
    />
  ) : null}
</DragOverlay>
```

Renders a static copy of the dragged item during drag (opacity: 0 on the original via `isDragging` in `SortablePackingRow`).

### Server Action: `reorderPackingItems`

Add after `removePackingItem` in `src/app/(app)/trips/actions.ts` (after line 491):

```ts
export async function reorderPackingItems(tripId: string, orderedItemIds: string[]): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedItemIds.length; i++) {
      await tx
        .update(packingItems)
        .set({ position: i })
        .where(and(eq(packingItems.id, orderedItemIds[i]), eq(packingItems.tripId, tripId)));
    }
  });
  revalidatePath(`/trips/${tripId}`);
}
```

`and(eq(packingItems.id, ...), eq(packingItems.tripId, tripId))` ensures items that don't belong to this trip are silently ignored (defense in depth after `assertTripAccess`).

Imports: `packingItems` is already imported in this file (line 9). `and` is already imported (line 6). Add `revalidatePath` import if not already present — it IS already imported (line 7).

### Handler in `use-trip-detail-handlers.ts`

Add `reorderPackingItems` to the import at line 16:
```ts
import { addPackingItem, deleteTrip, removePackingItem, reorderPackingItems, togglePackingItem, updateTripMetadata } from "../actions";
```

Add to `TripDetailHandlers` interface (after `handleTogglePackingItem` at line 61):
```ts
handleReorderPackingItems: (orderedItemIds: string[]) => void;
```

Implement (after `handleTogglePackingItem` function):
```ts
function handleReorderPackingItems(orderedItemIds: string[]): void {
  React.startTransition(async () => {
    try {
      await reorderPackingItems(trip.id, orderedItemIds);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reorder packing items. Please try again.");
      router.refresh();
    }
  });
}
```

Add to the return object (alongside `handleTogglePackingItem`):
```ts
handleReorderPackingItems,
```

`router.refresh()` on error resets the client state to the server's authoritative order, which then clears `localItems` via the "derive state from props" pattern.

### Prop Threading

**`trip-detail-tab-body.tsx`:**
```ts
// Add to TripDetailTabBodyProps (after onTogglePackingItem):
onReorderPackingItems: (orderedItemIds: string[]) => void;

// Destructure:
onReorderPackingItems,

// Pass to PackingListView:
<PackingListView
  tripId={tripId}
  items={packingItems}
  onAddItem={onAddPackingItem}
  onRemoveItem={onRemovePackingItem}
  onToggleItem={onTogglePackingItem}
  onReorderItems={onReorderPackingItems}   // NEW
/>
```

**`page-client.tsx`:** pass `onReorderPackingItems={handlers.handleReorderPackingItems}` to `<TripDetailTabBody>`.

### Unit Test Strategy

The existing `packing-list-view.test.tsx` has no dnd-kit mocks. After adding DnD to the component, ALL tests in the file need dnd-kit mocked to avoid JSDOM pointer event failures. Add these `vi.mock` calls at the very top of the file (after any `vi.hoisted` if added, before other imports):

```ts
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: () => null,
  closestCenter: {},
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
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

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSortable: useSortableMock,
  verticalListSortingStrategy: {},
  arrayMove: vi.fn((arr: unknown[], from: number, to: number) => {
    const result = [...arr];
    result.splice(to, 0, result.splice(from, 1)[0]);
    return result;
  }),
  sortableKeyboardCoordinates: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: vi.fn(() => undefined) } },
}));
```

**Note**: `vi.hoisted` is required for `useSortableMock` so the spy can be referenced in tests after the mock is hoisted by Vitest.

**New tests to add** (inside the existing `describe("PackingListView", ...)` block):

```ts
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

  // Items have drag handles; labels do not
  expect(screen.getByTitle("Reorder Passport")).toBeInTheDocument();
  expect(screen.getByTitle("Reorder Phone charger")).toBeInTheDocument();
  expect(screen.getByTitle("Reorder Socks")).toBeInTheDocument();
  expect(screen.queryByTitle("Reorder Documents")).not.toBeInTheDocument();
  expect(screen.queryByTitle("Reorder Clothes")).not.toBeInTheDocument();
});

it("drag handle button meets 44px minimum touch target", () => {
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

  const labelCalls = useSortableMock.mock.calls.filter(
    ([opts]) => (opts as { disabled?: boolean }).disabled === true
  );
  expect(labelCalls.length).toBeGreaterThan(0); // at least one label passed disabled:true
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

  const call = useSortableMock.mock.calls[0][0] as { animateLayoutChanges?: () => boolean };
  expect(call.animateLayoutChanges?.()).toBe(false);
});
```

All existing tests must also pass `onReorderItems={vi.fn()}` to `PackingListView` since it's a new required prop — update every existing render call in the test file.

### E2E Seed Constant

Add to `tests/e2e/e2e-seed-data.ts`:

```ts
export const E2E_PACKING_REORDER_ITEMS = [
  { name: "Item A", isLabel: false, done: false, position: 0 },
  { name: "Item B", isLabel: false, done: false, position: 1 },
  { name: "Item C", isLabel: false, done: false, position: 2 },
];
```

### E2E Scenarios

Add to `tests/e2e/features/packing-tab.feature`:

```gherkin
Scenario: User keyboard-reorders an item and the new position persists after reload
  Given I have pre-seeded packing reorder items for the trip
  When I open the Packing tab
  And I keyboard-move the item "Item A" down one position
  Then the packing list order should be "Item B" then "Item A" then "Item C"
  When I reload the trip page
  Then the packing list order should be "Item B" then "Item A" then "Item C"
```

_(The "labels have no drag handle" assertion is covered by the unit test `does not render a drag handle on section label rows` — no E2E duplicate needed.)_

### E2E Step Definitions

Add to `tests/e2e/steps/packing-tab.steps.ts`:

```ts
import { E2E_PACKING_REORDER_ITEMS } from "../e2e-seed-data";

Given("I have pre-seeded packing reorder items for the trip", async ({ page }) => {
  await withE2EDb(async (db) => {
    const tripId = await getBaseTripId(db);
    if (!tripId) throw new Error("E2E trip not found — cannot seed reorder items");
    await seedPackingItems(db, tripId, E2E_PACKING_REORDER_ITEMS);
  });
  await page.goto(page.url());
  await page.waitForURL(/\/trips/);
});

When(
  "I keyboard-move the item {string} down one position",
  async ({ page }, name: string) => {
    const dragHandle = page.getByTitle(`Reorder ${name}`);
    await dragHandle.focus();
    await page.keyboard.press("Space"); // activate keyboard drag
    await page.keyboard.press("ArrowDown"); // move down one position
    await page.keyboard.press("Space"); // drop
    // Wait for the list to reflect the new order
    await expect(async () => {
      const names = await page.locator("[data-packing-name]").allTextContents();
      const idx = names.map((n) => n.trim()).indexOf(name);
      expect(idx).toBeGreaterThan(0); // item moved down from index 0
    }).toPass({ timeout: 10_000 });
  }
);

Then("no drag handle is visible on label rows", async ({ page }) => {
  const labelRows = page.locator('[data-packing-kind="label"]');
  const count = await labelRows.count();
  expect(count).toBeGreaterThan(0); // at least one label exists
  for (let i = 0; i < count; i++) {
    const label = labelRows.nth(i);
    const labelName = await label.locator("[data-packing-name]").textContent();
    if (labelName) {
      await expect(page.getByTitle(`Reorder ${labelName.trim()}`)).not.toBeVisible();
    }
  }
});
```

Remove the `Then("no drag handle is visible on label rows", ...)` step definition — that behaviour is covered by the unit test layer.

**Note**: `withE2EDb`, `getBaseTripId`, and `seedPackingItems` are already defined at the top of `packing-tab.steps.ts` — do NOT redefine them.

### Architecture Compliance

- Server action: `requireUser()` + `assertTripAccess()` before any DB write — see action spec above
- `revalidatePath()` after mutation — in `reorderPackingItems`
- All domain types in `src/data/types.ts` — `ReorderPackingItemsInput` goes there (though not strictly needed since action takes primitive args)
- Interactive components: `"use client"` already on `packing-list-view.tsx`
- Colors via CSS custom properties only — drag overlay uses existing `PackingRow` which already follows this
- Lucide icons: `strokeWidth={1.5}` on `GripVertical` — enforced in drag handle span
- Touch target: drag handle `<span>` needs `min-h-11 min-w-11` classes (44×44px minimum)

### Performance Note (NFR3 — 60fps)

`animateLayoutChanges: () => false` (already in day-card pattern) disables the layout animation that causes layout thrashing in complex lists. This is critical for the 60fps requirement.

`CSS.Transform.toString(transform)` uses GPU-accelerated CSS transforms (`translate3d`) for the drag movement, which avoids layout reflows and ensures smooth animation.

### What NOT to Do

- Do NOT add inline editing of item text (story 1.4)
- Do NOT add label dragging (Phase 1: items only per AC2)
- Do NOT add cross-section drag restrictions (the flat position model allows items to move anywhere)
- Do NOT add label strikethrough (story 1.4)
- Do NOT add template-related features (Epic 2)
- Do NOT use `window.confirm` for any action
- Do NOT hardcode hex/rgb colors — drag overlay renders existing `PackingRow` which uses CSS variables
- Do NOT add a concurrent modification check to `reorderPackingItems` — Phase 1 is single-user, the simpler approach is correct (defer if multi-user collaboration is added)

### Files to Create

| File | Change |
|---|---|
| `src/components/packt/packing-list-row.tsx` | NEW — `PackingRowProps`, `PackingRow`, `SortablePackingRowProps`, `SortablePackingRow` (extracted from `packing-list-view.tsx` to keep that file under 250 lines) |

### Files to Modify

| File | Change |
|---|---|
| `src/app/(app)/trips/actions.ts` | Add `reorderPackingItems` server action after `removePackingItem` |
| `src/components/packt/packing-list-view.tsx` | Remove `PackingRow`/`PackingRowProps` (now in `packing-list-row.tsx`); add DnD imports, `onReorderItems` prop, `dragHandle` on `PackingRow`, `localItems` state, `visualOrder`, DnD context wrapper |
| `src/components/packt/packing-list-view.test.tsx` | Add dnd-kit mocks at top; add 4 new tests; add `onReorderItems={vi.fn()}` to all existing render calls |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Add `handleReorderPackingItems` + import `reorderPackingItems` |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Add `onReorderPackingItems` prop + pass to `PackingListView` |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Thread `handleReorderPackingItems` |
| `tests/e2e/e2e-seed-data.ts` | Add `E2E_PACKING_REORDER_ITEMS` |
| `tests/e2e/features/packing-tab.feature` | Add 1 keyboard-reorder scenario |
| `tests/e2e/steps/packing-tab.steps.ts` | Add 2 step definitions + import `E2E_PACKING_REORDER_ITEMS` |

### References

- [Epics doc](_bmad-output/implementation-artifacts/epics.md) — Epic 1, Story 1.3 (lines 248–276)
- [Previous story](_bmad-output/implementation-artifacts/1-2-check-items-as-packed-with-session-persistence-and-trip-card-progress.md) — baseline state, existing handler patterns
- [DayCardDnd](<src/components/packt/day-card-dnd.tsx>) — DnD context + sensor setup to mirror
- [DayCardSortables](<src/components/packt/day-card-sortables.tsx>) — `SortablePlaceRow` pattern for `SortablePackingRow`
- [PackingListView](src/components/packt/packing-list-view.tsx) — current component; add DnD here
- [reorderDayItems action](src/app/(app)/trips/[tripId]/actions.ts#L210) — action pattern to follow for `reorderPackingItems`
- [useTripDetailHandlers](src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts) — add handler at lines 247+
- [packing-tab.feature](tests/e2e/features/packing-tab.feature) — add 2 scenarios
- [packing-tab.steps.ts](tests/e2e/steps/packing-tab.steps.ts) — add 3 step definitions

## Dev Agent Record

### Agent Model Used

gpt-5-codex

### Debug Log References

### Completion Notes List

- Extracted the packing row and sortable list helpers so `packing-list-view.tsx` stays at 206 lines after the DnD work.
- Added `reorderPackingItems` plus `handleReorderPackingItems`, then threaded the new callback from `page-client.tsx` through `trip-detail-tab-body.tsx` into `PackingListView`.
- Added sortable mocks and reorder-focused tests in `packing-list-view.test.tsx`, `packing-list-sortable.test.tsx`, `actions.test.ts`, and `use-trip-detail-handlers.test.tsx`.
- Added `E2E_PACKING_REORDER_ITEMS` and the keyboard-reorder persistence scenario to the packing-tab feature coverage.
- Final validation passed with lint, `npx tsc --noEmit`, `npm run test:coverage`, `npm run test:e2e`, and `npm run build`.

### File List

| File | Change |
|---|---|
| `src/components/packt/packing-list-row.tsx` | Added extracted `PackingRow` and `SortablePackingRow` components |
| `src/components/packt/packing-list-sortable.tsx` | Added DnD-specific packing list renderer with keyboard and pointer reorder support |
| `src/components/packt/packing-list-sortable.test.tsx` | Added direct sortable-list coverage for optimistic reorder and overlay behavior |
| `src/components/packt/packing-list-view.tsx` | Wired reorder props, optimistic local state, and extracted sortable rendering |
| `src/components/packt/packing-list-view.test.tsx` | Added dnd-kit mocks and drag-handle accessibility assertions |
| `src/app/(app)/trips/actions.ts` | Added `reorderPackingItems` server action |
| `src/app/(app)/trips/actions.test.ts` | Added reorder action coverage |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Added `handleReorderPackingItems` |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx` | Added handler success and error tests for packing reorder |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Threaded `onReorderPackingItems` into `PackingListView` |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Passed the reorder handler into `TripDetailTabBody` |
| `src/app/(app)/trips/[tripId]/page-client.test.tsx` | Extended handler mocks for the new reorder prop |
| `tests/e2e/e2e-seed-data.ts` | Added deterministic reorder seed data |
| `tests/e2e/features/packing-tab.feature` | Added keyboard reorder persistence scenario |
| `tests/e2e/steps/packing-tab.steps.ts` | Added reorder seed and keyboard move step definitions |

### Review Findings

#### Patch

- [x] [Review][Patch] Add `revalidatePath("/trips")` to `reorderPackingItems` [actions.ts:505]
- [x] [Review][Patch] Add `router.refresh()` on successful reorder in handler [use-trip-detail-handlers.ts:257-262]
- [x] [Review][Patch] Validate `orderedItemIds` is non-empty in `reorderPackingItems` [actions.ts:493-504]
- [x] [Review][Patch] Fix E2E keyboard-move assertion to check exact position [packing-tab.steps.ts:192-194]
- [x] [Review][Patch] Add ARIA `role="button"` to drag handle span [packing-list-row.tsx:102-113]
- [x] [Review][Patch] Add focus restoration after keyboard drag completion [packing-list-row.tsx]
- [x] [Review][Patch] Add colocated `packing-list-row.test.tsx` with row unit tests
- [x] [Review][Patch] Change `dropAnimation={null}` to brief easing animation for AC4 [packing-list-sortable.tsx:172]
- [x] [Review][Patch] Fix fragile `animateLayoutChanges` test for first-render edge case [packing-list-view.test.tsx:435-441]
- [x] [Review][Patch] Add WHERE clause verification assertion to action reorder test [actions.test.ts:845-868]
- [x] [Review][Patch] Add undefined `item.id` guard before passing to sortable [packing-list-sortable.tsx]

#### Deferred

- [x] [Review][Defer] No concurrency protection — concurrent reorders/adds/removes can corrupt positions [actions.ts:496-503] — deferred, pre-existing (Phase 1 is single-user per spec)
- [x] [Review][Defer] Optimistic state uses referential equality — may miss server-triggered re-renders [packing-list-view.tsx:103] — deferred, follows existing spec pattern
- [x] [Review][Defer] No mouse/touch E2E coverage for pointer-drag reorder — deferred, keyboard E2E + unit tests cover reorder paths
