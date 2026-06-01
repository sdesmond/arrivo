# Story 1.4: Inline Editing, Label Strikethrough & Contextual Add

Status: done

## Story

As a traveler,
I want to edit items and labels inline and add new items under a specific section,
so that I can refine my list without leaving the packing view.

FRs covered: FR23, FR24, FR25, FR32, FR33, FR34, NFR6, NFR8, NFR10, NFR12

## Acceptance Criteria

**AC1 — Label strikethrough when all items checked**
Given a section label has all items beneath it checked
When the list renders
Then the section label displays a strikethrough visual state (client-side derived, no server call)
And if any item beneath it is unchecked, the strikethrough is immediately removed

**AC2 — No strikethrough for empty sections**
Given a section label has no items beneath it
Then it does not display a strikethrough state

**AC3 — Contextual add under a section**
Given the packing list has section labels
When the user uses an "add item under [section]" affordance
Then the new item is inserted directly beneath that section label

**AC4 — Add item to ungrouped area**
Given the user adds an item to the ungrouped area
Then the new item appears at the bottom of the list, below all sections

**AC5 — Inline edit item text**
Given the user activates inline editing on an item
When they change the text and confirm
Then the item displays the updated text and the change persists after a page reload

**AC6 — Inline rename section label**
Given the user taps or clicks a section label to rename it
When they enter a new name and confirm
Then the label displays the new name and the change persists after a page reload

**AC7 — Delete label via inline edit controls**
Given a section label's inline edit controls are open
When the user activates the delete control
Then the label is removed from the list
And items that were beneath that label remain in the list as ungrouped items

## Tasks / Subtasks

- [x] Types — add `UpdatePackingItemInput` to `src/data/types.ts` (AC: 5, 6, 7)
  - [x] `UpdatePackingItemInput { name?: string; afterItemId?: string }`
- [x] Types — add optional `isComplete?: boolean` to `PackingItem` (AC: 1, 2)
- [x] Server action — `updatePackingItem` (AC: 5, 6)
  - [x] `updatePackingItem(itemId: string, input: UpdatePackingItemInput)` — updates name
  - [x] `requireUser()` + `assertTripAccess()` first
  - [x] `revalidatePath(`/trips/${tripId}`)` + `revalidatePath("/trips")`
- [x] Server action — extend `addPackingItem` with `afterItemId` support (AC: 3, 4)
  - [x] Add optional `afterItemId?: string` to `AddPackingItemInput`
  - [x] When `afterItemId` is set, insert at `targetPos + 1` and increment all later positions
  - [x] When not set, keep existing append-at-end behavior
- [x] String utils or validation — enforce empty-string guard (AC: 5, 6)
  - [x] `trim()` + preserve minimum 1-char name requirement
- [x] Component — `PackingRow` inline editing (AC: 5, 6, 7)
  - [x] Add `onEdit: (id: string, name: string) => void` to `PackingRowProps`
  - [x] Add `onEditStart: () => void` / `onEditCancel: () => void` or internal edit state
  - [x] Click/tap name → replace `<p>`/`<h3>` with `<input>` pre-filled with current name
  - [x] Enter or blur → call `onEdit(item.id!, newName)` then revert to display
  - [x] Escape → cancel edit, revert to original name
  - [x] For labels in edit mode: show delete button alongside input (AC: 7)
  - [x] Tabbing from edit input to delete button, Enter to confirm deletion
  - [x] Apply `maxLength={100}` on input
- [x] Component — `PackingRow` label strikethrough (AC: 1, 2)
  - [x] Add `isComplete?: boolean` prop to `PackingRowProps`
  - [x] When `isLabel && isComplete`, apply `line-through` + dimmed color (`var(--fg-3)`) to label text
  - [x] When `isLabel && !isComplete`, render normally
  - [x] When `isLabel` and no items beneath, `isComplete` is false
- [x] Component — `PackingListSortable` label strikethrough derivation (AC: 1, 2)
  - [x] After `groupPackingItems`, compute `completeLabelIds`: set of section label IDs where `items.length > 0 && items.every(i => i.done)`
  - [x] Pass `isComplete={completeLabelIds.has(label.id)}` to each section label's `PackingRow`/`SortablePackingRow`
- [x] Component — `PackingListView` contextual add affordances (AC: 3, 4)
  - [x] Add "Add item" button/inline form below each section (after section's items)
  - [x] Add "Add item" button/inline form at end of ungrouped area
  - [x] Each affordance passes `afterItemId` to `onAddItem`
  - [x] Each contextual add uses the same `PackingEntryForm` pattern (or a mini version)
- [x] Component — `PackingListSortable` contextual add rendering (AC: 3, 4)
  - [x] After each section's items, render `PackingEntryForm` with `afterItemId={section.label.id}`
  - [x] After ungrouped items, render `PackingEntryForm` with `afterItemId={ungroupedItems[last]?.id ?? null}`
  - [x] The existing bottom form remains as a catch-all (appends at end without `afterItemId`)
- [x] Props threading — `PackingListViewProps` change (AC: 3, 5, 6)
  - [x] Add `onEditItem: (id: string, name: string) => void` to `PackingListViewProps`
- [x] Handler — `handleUpdatePackingItem` in `use-trip-detail-handlers.ts` (AC: 5, 6)
  - [x] Add `handleUpdatePackingItem: (id: string, name: string) => void` to `TripDetailHandlers`
  - [x] Import `updatePackingItem` from `../actions`
  - [x] Wrap in `React.startTransition(async () => { ... })` with toast.error on failure
- [x] Handler — update `handleAddPackingItem` to accept `afterItemId` (AC: 3, 4)
  - [x] Change signature to `(name: string, isLabel?: boolean, afterItemId?: string) => void`
  - [x] Pass `afterItemId` in the call to `addPackingItem`
- [x] Props threading — `use-trip-detail-handlers.ts` → `page-client.tsx` → `trip-detail-tab-body.tsx` → `PackingListView` (AC: 3, 5, 6)
  - [x] Thread `handleUpdatePackingItem` and updated `handleAddPackingItem`
- [x] Unit tests — `packing-list-view.test.tsx` (AC: 1–7)
  - [x] Label shows strikethrough when all items under it are checked
  - [x] Label does not show strikethrough when an item under it is unchecked
  - [x] Label with no items does not show strikethrough
  - [x] Clicking item name enters edit mode with pre-filled input
  - [x] Enter/blur in edit mode calls onEditItem with new name
  - [x] Escape in edit mode cancels and reverts name
  - [x] Label in edit mode shows delete button
  - [x] Clicking delete button in label edit mode calls onRemoveItem
  - [x] "Add item" inline form appears under each section
  - [x] Submitting contextual add form passes `afterItemId`
  - [x] "Add item" inline form appears in ungrouped area
  - [x] Inline edit input has maxLength=100
- [x] Unit tests — `packing-list-sortable.test.tsx` (AC: 1, 2)
  - [x] Computes completeLabelIds correctly when all section items checked
  - [x] completeLabelIds excludes sections with no items
  - [x] completeLabelIds is empty when no items checked
- [x] Unit tests — `actions.test.ts` (AC: 5, 6)
  - [x] `updatePackingItem` updates name in DB
  - [x] `updatePackingItem` calls `requireUser()` + `assertTripAccess()`
  - [x] `updatePackingItem` revalidates paths
  - [x] `addPackingItem` with `afterItemId` inserts at correct position
  - [x] `addPackingItem` with `afterItemId` shifts subsequent positions
- [x] Unit tests — `use-trip-detail-handlers.test.tsx` (AC: 5, 6)
  - [x] `handleUpdatePackingItem` calls server action
  - [x] `handleUpdatePackingItem` shows toast on error
- [x] E2E — `packing-tab.feature` (AC: 1, 3, 5, 6, 7)
  - [x] Seed constant with items under section + some checked
  - [x] Scenario: Section label shows strikethrough when all items checked
  - [x] Scenario: User adds item under a section label and it appears there
  - [x] Scenario: User inline-edits an item's text and it persists after reload
  - [x] Scenario: User renames a section label and it persists after reload
  - [x] Scenario: User deletes a section label via inline edit and items become ungrouped

### Review Findings (First Pass)

- [x] [Review][Patch] No real ungrouped add path when sections exist, so AC4 is still broken [src/components/packt/packing-list-sortable.tsx:232]
- [x] [Review][Patch] Packing item mutations still skip server-side trim / empty-name validation required by the story [src/app/(app)/trips/actions.ts:456]
- [x] [Review][Patch] Contextual add forms can double-submit because they bypass the existing pending-state guard [src/components/packt/packing-list-sortable.tsx:83]

### Review Findings (Second Pass)

- [ ] [Review][Patch] `isSubmitting` never reset after contextual add — forms permanently disabled after one use [packing-list-view.tsx:handleContextualAdd]
- [ ] [Review][Patch] `updatePackingItem` fetches item before auth check — unauthenticated user can probe item ID existence [src/app/(app)/trips/actions.ts]
- [ ] [Review][Patch] `addPackingItem` position race with `afterItemId` — concurrent writes at READ COMMITTED level can produce colliding positions [src/app/(app)/trips/actions.ts]
- [ ] [Review][Patch] `PackingItem.isComplete` on canonical type but it's a rendering-only prop — would leak if serialized; keep only as `PackingRowProps.isComplete` [src/data/types.ts:394]
- [ ] [Review][Patch] `updatePackingItem` silently no-ops on missing item — no error toast, user sees edit mode close without update [src/app/(app)/trips/actions.ts]
- [ ] [Review][Patch] Non-null assertion on `item.id!` in callbacks — if an item lacks an ID, `undefined` propagates to server action [src/components/packt/packing-list-sortable.tsx]
- [ ] [Review][Patch] E2E inline-edit locator `input[maxlength="100"]` first() is overly broad — matches all add-form inputs, not just the edit input [tests/e2e/steps/packing-tab.steps.ts]

## Dev Notes

### Existing State (Brownfield)

Everything from Stories 1.1–1.3 is in place. Files you'll modify:

| Artifact | Location | Status |
|---|---|---|
| `addPackingItem` action | `src/app/(app)/trips/actions.ts:455` | Add `afterItemId` support |
| `PackingItem` type | `src/data/types.ts:387` | Add optional `isComplete?: boolean` |
| `AddPackingItemInput` | `src/data/types.ts:562` | Add optional `afterItemId?: string` |
| `PackingRow` | `src/components/packt/packing-list-row.tsx:24` | Add inline edit + label strikethrough |
| `PackingRowProps` | `src/components/packt/packing-list-row.tsx:11` | Add `onEdit`, `isComplete` |
| `PackingListSortable` | `src/components/packt/packing-list-sortable.tsx:72` | Compute `completeLabelIds`; render contextual add forms |
| `PackingListView` | `src/components/packt/packing-list-view.tsx:84` | Pass `onEditItem` through |
| `PackingListViewProps` | `src/components/packt/packing-list-view.tsx:11` | Add `onEditItem` |
| `TripDetailHandlers` | `use-trip-detail-handlers.ts:66` | Add `handleUpdatePackingItem` |
| `TripDetailTabBodyProps` | `trip-detail-tab-body.tsx` | Thread `onEditPackingItem` |
| `page-client.tsx` | `page-client.tsx` | Thread `handleUpdatePackingItem` |

### What NOT to do

- Do NOT add drag-to-reorder section labels (Phase 1: items only — confirmed in 1.3)
- Do NOT add cross-section drag restrictions (items can move anywhere in flat position model)
- Do NOT add template-related features (Epic 2 — deferred)
- Do NOT add optimistic UI for inline edit updates (accept server round-trip; pattern from 1.2 toggle)
- Do NOT use `window.confirm` for any action (project convention — confirmed in 1.1 review)
- Do NOT modify `PackingRail` (sidebar, remains read-only)
- Do NOT modify `togglePackingItem`, `removePackingItem`, `reorderPackingItems` actions — they're correct as-is
- Do NOT add keyboard shortcut for save (Enter), cancel (Escape) — these are default input behavior
- Do NOT add native `<form>` around inline edit — single input, controlled component
- Do NOT hardcode hex/rgb colors — all colors via CSS custom properties
- Do NOT add ARIA live announcements for inline edit — the edit itself is a direct interaction, no need for announcement

### Label Strikethrough — Client-Side Derivation

The strikethrough is computed entirely on the client — no server call. Implementation in `packing-list-sortable.tsx`:

```ts
// After sections are computed via groupPackingItems:
const completeLabelIds = useMemo(() => {
  return new Set(
    sections
      .filter((s) => s.items.length > 0 && s.items.every((i) => i.done))
      .map((s) => s.label.id)
  );
}, [sections]);
```

Pass `isComplete={completeLabelIds.has(section.label.id)}` to each section label's `SortablePackingRow` / `PackingRow`. The label should remain non-interactive for toggling — strikethrough is purely visual.

In `PackingRow` (`packing-list-row.tsx`), when `isLabel && isComplete`:
```tsx
<h3
  className={cn(
    "font-semibold",
    isComplete ? "text-fg-3 line-through" : "text-fg"
  )}
  data-packing-name={item.name}
>
  {item.name}
</h3>
```

When `isLabel && !isComplete`, render normally (existing behavior).
When `isLabel && items.length === 0`, `isComplete` is false.

### Contextual Add — Server Action Changes

Extend `addPackingItem` to accept optional `afterItemId`:

```ts
export async function addPackingItem(tripId: string, input: AddPackingItemInput) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  if (input.afterItemId) {
    // Insert after the specified item
    const [targetItem] = await db
      .select()
      .from(packingItems)
      .where(and(eq(packingItems.id, input.afterItemId), eq(packingItems.tripId, tripId)));
    if (!targetItem) throw new Error("Target item not found");

    await db.transaction(async (tx) => {
      // Shift items after the target position up by 1
      await tx
        .update(packingItems)
        .set({ position: sql`${packingItems.position} + 1` })
        .where(and(eq(packingItems.tripId, tripId), gt(packingItems.position, targetItem.position)));

      // Insert new item at targetPos + 1
      await tx.insert(packingItems).values({
        tripId,
        name: input.name,
        done: false,
        isLabel: input.isLabel ?? false,
        position: targetItem.position + 1,
      });
    });
  } else {
    // Existing append-at-end behavior
    const [{ maxPos }] = await db
      .select({ maxPos: max(packingItems.position) })
      .from(packingItems)
      .where(eq(packingItems.tripId, tripId));
    await db.insert(packingItems).values({
      tripId,
      name: input.name,
      done: false,
      isLabel: input.isLabel ?? false,
      position: (maxPos ?? -1) + 1,
    });
  }

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
}
```

Import `gt` (`greater than`) from `drizzle-orm`. Use `sql` tag from `drizzle-orm` for the position increment.

### Types Changes — `src/data/types.ts`

```ts
// Add to PackingItem interface (line 387):
export interface PackingItem {
  id?: string;
  name: string;
  done: boolean;
  tripId?: string;
  position?: number;
  isLabel?: boolean;
  isComplete?: boolean; // NEW: client-side derived for label strikethrough
}

// Add new input type (after AddPackingItemInput at line 562):
export interface UpdatePackingItemInput {
  name?: string;
}

// Extend AddPackingItemInput:
export interface AddPackingItemInput {
  name: string;
  isLabel?: boolean;
  afterItemId?: string; // NEW
}
```

### Inline Editing — UI Implementation

Inline editing replaces the text display with an input on click/tap. Architecture:

1. **Edit state is local to the row** — each `PackingRow` manages its own `isEditing` state
2. Click/tap on the name area (`.p` for items, `h3` for labels) sets `isEditing = true`
3. On edit activation, store original name in a ref (for Escape cancel)
4. Render `<input>` instead of `<p>`/`<h3>`:
   ```tsx
   <input
     autoFocus
     defaultValue={item.name}
     maxLength={100}
     onKeyDown={(e) => {
       if (e.key === "Enter") commitEdit(e.currentTarget.value);
       if (e.key === "Escape") cancelEdit();
     }}
     onBlur={(e) => commitEdit(e.target.value)}
     className="..."
   />
   ```
5. `commitEdit(newName)`:
   - Strip whitespace: `trim()`
   - If empty string, revert (don't allow empty names)
   - If unchanged from original, exit edit mode, no server call
   - Otherwise call `onEdit(item.id!, newName)` then exit edit mode
6. `cancelEdit()`: reset to original name, exit edit mode

For labels specifically (AC7): when in edit mode, show a delete button alongside the input and Save/Cancel controls:
```tsx
<Button
  variant="ghost"
  size="icon"
  onClick={() => onRemove()}
  title="Delete label"
  aria-label="Delete label"
>
  <Trash2 size={14} strokeWidth={1.5} />
</Button>
```

### Contextual Add Affordances

Add small "+" forms after each section and in the ungrouped area. Each form is a simplified `PackingEntryForm` with just an item text input and submit button — no label toggle.

In `packing-list-sortable.tsx`:

```tsx
// After section items (before next section or before ungrouped):
{showAddItem && (
  <div className="ml-3 mt-2">
    <PackingEntryForm
      placeholder="Add item under {section.label.name}..."
      onSubmit={(name) => onAddItem(name, false, section.label.id)}
    />
  </div>
)}

// After ungrouped items:
{showAddItem && (
  <div className="mt-2">
    <PackingEntryForm
      placeholder="Add item..."
      onSubmit={(name) => onAddItem(name, false, ungroupedItems.length > 0 ? ungroupedItems[ungroupedItems.length - 1].id : undefined)}
    />
  </div>
)}
```

The existing bottom-form in `PackingListView` stays as a general "add without context" entry point. Use a local `handleSubmitEntry` wrapper:

```tsx
function handleAddItem(name: string, isLabel?: boolean, afterItemId?: string): void {
  onAddItem(name, isLabel, afterItemId);
}
```

`PackingListViewProps` changes:
```ts
export interface PackingListViewProps {
  tripId: string;
  items: PackingItem[];
  onAddItem: (name: string, isLabel?: boolean, afterItemId?: string) => void;
  onRemoveItem: (id: string) => void;
  onToggleItem: (id: string) => Promise<void>;
  onReorderItems: (orderedItemIds: string[], onError?: () => void) => void;
  onEditItem: (id: string, name: string) => void; // NEW
}
```

### Label Strikethrough — Where to Compute

The add affordance and strikethrough both live in `packing-list-sortable.tsx` since `packing-list-sortable.tsx` already owns the `groupPackingItems` call and section rendering. The `PackingRow` receives:

- `isComplete?: boolean` — for label strikethrough
- `onEdit?: (name: string) => void` — for inline editing

### Server action: `updatePackingItem`

Add after `reorderPackingItems` in `src/app/(app)/trips/actions.ts`:

```ts
export async function updatePackingItem(itemId: string, input: UpdatePackingItemInput): Promise<void> {
  const user = await requireUser();
  const [item] = await db.select().from(packingItems).where(eq(packingItems.id, itemId));
  if (!item) return;
  await assertTripAccess(item.tripId, user.id!, "editor");
  await db.update(packingItems).set({ name: input.name }).where(eq(packingItems.id, itemId));
  revalidatePath(`/trips/${item.tripId}`);
  revalidatePath("/trips");
}
```

### Props Threading — `use-trip-detail-handlers.ts`

```ts
// Add to TripDetailHandlers interface (after handleReorderPackingItems):
handleUpdatePackingItem: (id: string, name: string) => void;

// Update handleAddPackingItem signature:
handleAddPackingItem: (name: string, isLabel?: boolean, afterItemId?: string) => void;
```

```ts
function handleUpdatePackingItem(id: string, name: string): void {
  React.startTransition(async () => {
    try {
      await updatePackingItem(id, { name });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update packing item. Please try again.");
    }
  });
}
```

### Rewrite Admonitions

Be careful that the `addPackingItem` action's position-shifting SQL works correctly in a transaction. Test with:
1. Single item at position 0, insert after it → new item at pos 1, existing item stays at pos 0
2. Multiple items, insert in middle → items after the target shift by 1
3. Empty list with `afterItemId` → should it work? Only if the target was already deleted, throw

### Testing — Unit Tests

**`packing-list-view.test.tsx`** — add these to the existing describe block:

- `renders strikethrough on label when all items beneath it are checked` — pass items array where a section has all items `done: true`; assert label has `line-through` class
- `removes strikethrough from label when an item beneath it is unchecked` — render with all checked, then update items prop to have one unchecked; assert no `line-through`
- `does not render strikethrough on label with no items` — create section with label but zero items
- `clicking item name enters edit mode` — render single item, click name, assert `<input>` appears
- `Enter key in edit mode calls onEditItem` — click name, type new name, press Enter, assert `onEditItem` called with new name
- `Escape key in edit mode reverts to original name` — click name, type new name, press Escape, assert original name displayed, no server call
- `label in edit mode shows delete button` — render section label, click to enter edit mode, assert delete button visible
- `contextual add form appears after section items` — verify `PackingEntryForm` rendered after section
- `contextual add form appears in ungrouped area` — verify form rendered at bottom when ungrouped items exist

**`actions.test.ts`**:
- `updatePackingItem updates name in DB` — seed item, call action, assert name changed
- `updatePackingItem enforces auth` — assert `requireUser` called
- `addPackingItem with afterItemId inserts at correct position` — seed items, insert after specific ID, assert position
- `addPackingItem with afterItemId shifts subsequent positions` — verify items after target bumped by 1

**`packing-list-sortable.test.tsx`**:
- `computes completeLabelIds when section fully checked` — mock `groupPackingItems` return, assert correct set
- `completeLabelIds excludes empty sections`

### Testing — E2E

Add to `tests/e2e/features/packing-tab.feature`:

```gherkin
Scenario: Section label shows strikethrough when all items beneath it are checked
  Given I have pre-seeded packing items with label and items for strikethrough
  When I open the Packing tab
  Then the section label "Documents" should not have strikethrough
  When I check the packing item "Passport"
  And I check the packing item "Visa"
  Then the section label "Documents" should have strikethrough

Scenario: User adds item under a section label
  Given I have pre-seeded a section label for contextual add
  When I open the Packing tab
  And I add an item "Travel adapter" under the section "Documents"
  Then the packing list order should have "Travel adapter" under "Documents"

Scenario: User inline-edits item text and it persists after reload
  Given I have pre-seeded packing items for inline editing
  When I open the Packing tab
  And I rename the item "Passport" to "Passport (renewed)"
  Then the packing item "Passport (renewed)" should be visible
  When I reload the trip page
  Then the packing item "Passport (renewed)" should be visible

Scenario: User renames a section label and it persists after reload
  Given I have pre-seeded a section label for renaming
  When I open the Packing tab
  And I rename the section label "Documents" to "Travel documents"
  Then the section label "Travel documents" should be visible
  When I reload the trip page
  Then the section label "Travel documents" should be visible

Scenario: User deletes section label via inline edit and items become ungrouped
  Given I have pre-seeded a section label with items beneath it
  When I open the Packing tab
  And I delete the section label "Documents" via inline edit controls
  Then the section label "Documents" should not be visible
  And the packing item "Passport" should be visible (now ungrouped)
```

### Files to Create

None — all changes are additions to existing files.

### Files to Modify

| File | Change |
|---|---|
| `src/data/types.ts` | Add `isComplete` to `PackingItem`; add `UpdatePackingItemInput`; add `afterItemId` to `AddPackingItemInput` |
| `src/app/(app)/trips/actions.ts` | Add `updatePackingItem` action; extend `addPackingItem` with `afterItemId` support |
| `src/app/(app)/trips/actions.test.ts` | Add `updatePackingItem` tests; add `addPackingItem` with `afterItemId` tests |
| `src/components/packt/packing-list-view.tsx` | Add `onEditItem` prop; update `handleSubmitEntry` signature for `afterItemId` |
| `src/components/packt/packing-list-view.test.tsx` | Add inline edit + contextual add + strikethrough tests |
| `src/components/packt/packing-list-row.tsx` | Add inline editing UI; add `isComplete` prop rendering; add `onEdit` prop |
| `src/components/packt/packing-list-row.test.tsx` | Add inline edit + strikethrough tests |
| `src/components/packt/packing-list-sortable.tsx` | Compute `completeLabelIds` for label strikethrough; render contextual add forms per section/ungrouped |
| `src/components/packt/packing-list-sortable.test.tsx` | Add `completeLabelIds` derivation tests |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Add `handleUpdatePackingItem`; update `handleAddPackingItem` signature |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx` | Add `handleUpdatePackingItem` handler test |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Thread `onEditPackingItem` and updated `onAddPackingItem` |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Thread `handleUpdatePackingItem` |
| `tests/e2e/e2e-seed-data.ts` | Add seed constants for strikethrough, contextual add, inline edit scenarios |
| `tests/e2e/features/packing-tab.feature` | Add 5 scenarios |
| `tests/e2e/steps/packing-tab.steps.ts` | Add step definitions for 5 new scenarios |

### References

- [Epics doc](_bmad-output/implementation-artifacts/epics.md) — Epic 1, Story 1.4 (lines 278-314)
- [Previous story 1.1](_bmad-output/implementation-artifacts/1-1-packing-tab-foundation-list-display-and-item-label-management.md) — baseline: `PackingListView`, groupPackingItems algorithm, DB schema
- [Previous story 1.2](_bmad-output/implementation-artifacts/1-2-check-items-as-packed-with-session-persistence-and-trip-card-progress.md) — toggle pattern, pendingItemIds, handler signatures returning Promise
- [Previous story 1.3](_bmad-output/implementation-artifacts/1-3-drag-to-reorder-items-with-position-persistence.md) — SortablePackingRow, visualOrder, packing-list-row.tsx extraction
- [PackingListView](src/components/packt/packing-list-view.tsx) — main component, packing-entry-form at bottom, `onAddItem` / `onRemoveItem` / `onToggleItem` / `onReorderItems` props
- [PackingRow](src/components/packt/packing-list-row.tsx) — individual row rendering, label vs item distinction
- [PackingListSortable](src/components/packt/packing-list-sortable.tsx) — grouping, visualOrder, DnD context, section rendering
- [addPackingItem action](src/app/(app)/trips/actions.ts#L455) — existing action, extend for `afterItemId`
- [Project context](_bmad-output/project-context.md) — stack versions, conventions, CSS custom properties, CN usage

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Fixed `getByRole("textbox", { name: undefined })` ambiguity in view test — used `getByDisplayValue` instead (3 textboxes rendered after edit mode + contextual form)
- Fixed E2E regression from `openPackingTab` and `I add a packing item named` steps — Playwright non-exact match for "Add item" was matching "Add item here" as a substring; added `exact: true` to both locators

### Completion Notes List

- Added `isComplete?: boolean` to `PackingItem`, `afterItemId?: string` to `AddPackingItemInput`, and new `UpdatePackingItemInput` to `src/data/types.ts`
- Added `updatePackingItem` server action; extended `addPackingItem` with transactional `afterItemId` position-shifting using Drizzle `gt` and `sql` operators
- `PackingRow` now supports inline editing (click-to-edit with Enter/Escape/blur, empty-string guard, `maxLength={100}`) and label strikethrough via `isComplete` prop; delete button shown for labels in edit mode
- `PackingListSortable` derives `completeLabelIds` via `useMemo` over section items; renders `ContextualAddForm` after each section and ungrouped area
- `PackingListView` adds required `onEditItem` prop and updated `onAddItem` signature; threads both into `PackingListSortable`
- `handleUpdatePackingItem` added to `useTripDetailHandlers`; `handleAddPackingItem` updated with `afterItemId` parameter; both threaded through tab-body and page-client
- 1383 unit tests pass; coverage at lines 96.28%, functions 95.1%, branches 90.5%
- 17/17 packing-tab E2E scenarios pass including all 5 new Story 1.4 scenarios

### File List

- `src/data/types.ts`
- `src/app/(app)/trips/actions.ts`
- `src/app/(app)/trips/actions.test.ts`
- `src/components/packt/packing-list-row.tsx`
- `src/components/packt/packing-list-row.test.tsx`
- `src/components/packt/packing-list-sortable.tsx`
- `src/components/packt/packing-list-sortable.test.tsx`
- `src/components/packt/packing-list-view.tsx`
- `src/components/packt/packing-list-view.test.tsx`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`
- `src/app/(app)/trips/[tripId]/page-client.tsx`
- `tests/e2e/e2e-seed-data.ts`
- `tests/e2e/features/packing-tab.feature`
- `tests/e2e/steps/packing-tab.steps.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
