# Story 1.2: Check Items as Packed with Session Persistence & Trip Card Progress

Status: done

## Story

As a traveler,
I want to check items off my packing list and see my progress on the trip card,
so that I can pack incrementally across sessions and know at a glance how much is done.

FRs covered: FR26, FR27, FR28, FR35, FR36, FR37, NFR6, NFR8, NFR11

## Acceptance Criteria

**AC1 — Check item**
Given the user is on the Packing tab with items
When they tap or click an item's checkbox
Then the item is visually marked as checked/packed

**AC2 — Uncheck item**
Given an item is checked
When the user clicks or taps its checkbox again
Then it returns to unchecked state

**AC3 — Persistence across sessions**
Given the user has checked some items
When they reload the page or close and reopen the browser
Then the same items remain checked exactly as left

**AC4 — Trip card progress count**
Given a trip has a packing list with checkable items
When the user views the trips list
Then the trip card shows "X / Y packed" (X = checked items, Y = total checkable items)

**AC5 — Labels excluded from count**
Given the packing list contains both items and section labels
Then the trip card count reflects only checkable items — labels are excluded and have no checkbox

**AC6 — Screen reader announcement**
Given the user checks or unchecks an item
Then the state change is announced to screen readers via appropriate ARIA attributes (e.g., `aria-checked`)

## Tasks / Subtasks

- [x] Types — add `packingProgress?: { checked: number; total: number }` to `Trip` (AC: 4, 5)
  - [x] Add optional `packingProgress` field to `Trip` interface in `src/data/types.ts`
- [x] Query — compute packing progress in `listTripsForUser` (AC: 4, 5)
  - [x] For each trip in `listTripsForUser`, run a COUNT subquery on `packing_items` WHERE `trip_id = ?` AND `is_label = false`
  - [x] Run a second COUNT for checked items: WHERE `trip_id = ?` AND `is_label = false` AND `done = true`
  - [x] Populate `trip.packingProgress = { checked, total }` only when `total > 0`
- [x] TripCard — display packing progress (AC: 4, 5)
  - [x] Import `Package` or `Check` icon from `lucide-react` for the progress meta tag
  - [x] Render "X / Y packed" in the meta row when `trip.packingProgress` is set and `total > 0`
- [x] PackingListView — make checkbox interactive (AC: 1, 2, 6)
  - [x] Add `onToggleItem: (id: string) => void` prop to `PackingListViewProps`
  - [x] Convert the decorative checkbox `<span>` in `PackingRow` to a `<button>` with `role="checkbox"` and `aria-checked={item.done}`
  - [x] Attach `onClick={() => onToggle(item.id!)}` to the checkbox button
  - [x] Keep `aria-label="Pack {item.name}"` on the checkbox button for screen readers
  - [x] Announce toggle via the existing `aria-live` region in `PackingListView` ("Passport checked." / "Passport unchecked.")
  - [x] Apply minimum `min-h-11 min-w-11` sizing (touch target) to the checkbox button
- [x] Handler wiring — add `handleTogglePackingItem` (AC: 1, 2, 3)
  - [x] Add `handleTogglePackingItem(id: string): void` to `use-trip-detail-handlers.ts`, wrapping `togglePackingItem(id)`
  - [x] Add `handleTogglePackingItem` to the return value of the hook
  - [x] Add `onTogglePackingItem: (id: string) => void` to `TripDetailTabBodyProps` in `trip-detail-tab-body.tsx`
  - [x] Pass `onToggleItem={onTogglePackingItem}` into `<PackingListView>` in `trip-detail-tab-body.tsx`
  - [x] Thread `handleTogglePackingItem` through `page-client.tsx` to `TripDetailTabBody`
- [x] Unit tests — `packing-list-view.test.tsx` (AC: 1, 2, 6)
  - [x] Renders checkbox button with `aria-checked="false"` for unchecked item
  - [x] Renders checkbox button with `aria-checked="true"` for checked item
  - [x] Calls `onToggleItem` with the item's id when checkbox clicked
  - [x] Announces toggle via aria-live region (check "Passport checked.", uncheck "Passport unchecked.")
  - [x] Checkbox button meets 44×44px touch target (min-h-11 min-w-11)
- [x] Unit tests — `trip-card.test.tsx` (AC: 4, 5)
  - [x] Renders "X / Y packed" when `trip.packingProgress = { checked: 3, total: 5 }`
  - [x] Does not render any packing count when `packingProgress` is undefined
  - [x] Does not render any packing count when `packingProgress = { checked: 0, total: 0 }`
- [x] E2E — packing-tab.feature (AC: 1, 2, 3, 4, 5, 6)
  - [x] Add seed constant `E2E_PACKING_ITEMS` for 3 checkable items (no labels) to `e2e-seed-data.ts`
  - [x] Scenario: User checks an item and it persists after reload
  - [x] Scenario: User unchecks an item and it persists after reload
  - [x] Scenario: Checking items updates the trip card progress count

## Dev Notes

### Existing State (Brownfield)

Everything from Story 1.1 is in place. Do NOT modify:
- `togglePackingItem` server action (`src/app/(app)/trips/actions.ts:472`) — already correct, toggles `done` and calls `revalidatePath`
- `PackingRow` decorative checkbox `<span>` exists at `packing-list-view.tsx:137-148` — this is what becomes interactive
- `aria-live` region at `packing-list-view.tsx:217-219` — already wired, reuse it for toggle announcements
- `handleAddPackingItem` and `handleRemovePackingItem` in `use-trip-detail-handlers.ts:214-232` — follow this exact pattern for `handleTogglePackingItem`

| Artifact | Location | Status |
|----------|----------|--------|
| `togglePackingItem` action | `src/app/(app)/trips/actions.ts:472` | Already correct — use as-is |
| `PackingItem.done` field | `src/data/types.ts:384` | Already there |
| `PackingRow` visual checkbox | `src/components/packt/packing-list-view.tsx:137-148` | Decorative `<span>` — convert to `<button role="checkbox">` |
| `aria-live` region | `src/components/packt/packing-list-view.tsx:217-219` | Already wired — add toggle announcements |
| `Trip` type | `src/data/types.ts:344` | Add `packingProgress?: { checked: number; total: number }` |
| `listTripsForUser` | `src/lib/queries.ts:85` | Add per-trip packing count subquery |
| `TripCard` meta row | `src/components/packt/trip-card.tsx:144-161` | Add packing progress display |
| `TripDetailTabBodyProps` | `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx:9` | Add `onTogglePackingItem` |
| `PackingListView` in tab body | `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx:117-124` | Pass `onToggleItem` |
| `use-trip-detail-handlers.ts` | Lines 214-232 | Add `handleTogglePackingItem` alongside existing packing handlers |
| `page-client.tsx` | `src/app/(app)/trips/[tripId]/page-client.tsx:55+` | Thread toggle handler through |

### Session Persistence (AC3)

AC3 needs **no new code** — `togglePackingItem` already:
1. Updates `done` in the DB
2. Calls `revalidatePath(`/trips/${item.tripId}`)` which triggers a server-side re-fetch
3. `getTripDetail` already loads `packingItems` with `done` values ordered by position

The item will be checked on reload because the DB has the state and the server component re-renders it. Verify only that the toggle action is wired correctly.

### Making the Checkbox Interactive

Current state in `packing-list-view.tsx:127-176` — `PackingRow` renders the circle as a decorative `<span aria-hidden="true">`. For Story 1.2:

```tsx
// BEFORE (Story 1.1 — decorative)
<span
  aria-hidden="true"
  className="flex size-5 shrink-0 items-center justify-center rounded-full"
  style={{ ... }}
>
  {item.done ? <Check size={12} strokeWidth={1.5} /> : null}
</span>

// AFTER (Story 1.2 — interactive)
<button
  aria-checked={item.done}
  aria-label={`Pack ${item.name}`}
  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full"
  role="checkbox"
  title={item.done ? `Unpack ${item.name}` : `Pack ${item.name}`}
  type="button"
  style={{ ... }}
  onClick={() => onToggle(item.id!)}
>
  {item.done ? <Check size={12} strokeWidth={1.5} /> : null}
</button>
```

The `min-h-11 min-w-11` classes on the button ensure the 44×44px touch target (the visual circle stays `size-5` via the inner flex layout). The `size-5` `flex` class on the inner span should be removed; the visual circle effect can be achieved with the button itself or a nested visual span.

**Alternate approach that preserves the existing visual**: keep the inner `size-5` visual circle, wrap just the click target in a larger `<button>` shell with negative margin or padding to expand the tap target without affecting layout:

```tsx
<button
  aria-checked={item.done}
  aria-label={`Pack ${item.name}`}
  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
  role="checkbox"
  title={item.done ? `Unpack ${item.name}` : `Pack ${item.name}`}
  type="button"
  style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
  onClick={() => onToggle(item.id!)}
>
  <span
    className="flex size-5 items-center justify-center rounded-full"
    style={{
      background: item.done ? "var(--accent-brand)" : "transparent",
      border: item.done ? "1.5px solid var(--accent-brand)" : "1.5px solid var(--line-strong)",
      color: item.done ? "var(--accent-fg)" : "transparent",
    }}
  >
    {item.done ? <Check size={12} strokeWidth={1.5} /> : null}
  </span>
</button>
```

This preserves the exact visual appearance from Story 1.1 while making the touch target large enough for mobile.

### PackingRow Props Change

`PackingRow` needs a new optional prop `onToggle`:

```ts
interface PackingRowProps {
  item: PackingItem;
  isLabel?: boolean;
  onRemove: () => void;
  onToggle?: () => void;  // undefined for labels
}
```

Pass `onToggle={() => onToggleItem(item.id!)}` from the render sites for non-label items. Labels don't get a toggle prop (keeping the checkbox circle absent, as in Story 1.1).

### PackingListView Props Change

```ts
interface PackingListViewProps {
  tripId: string;
  items: PackingItem[];
  onAddItem: (name: string, isLabel?: boolean) => void;
  onRemoveItem: (id: string) => void;
  onToggleItem: (id: string) => void;  // NEW
}
```

### Toggle Announcement

The existing `aria-live` region at `packing-list-view.tsx:217-219` uses the `announcement` + `announcementId` pattern. Add toggle announcements:

```ts
function handleToggle(item: PackingItem): void {
  if (!item.id) return;
  onToggleItem(item.id);
  const action = item.done ? "unchecked" : "checked";
  setAnnouncement(`${item.name} ${action}.`);
  setAnnouncementId((id) => id + 1);
}
```

Note: `item.done` reflects the **current** state at call time (before the server response updates it), so "checked" is announced when the item is being checked (not after).

### Handler Wiring Pattern

Follow the exact pattern of `handleAddPackingItem` and `handleRemovePackingItem` at lines 214-232:

```ts
function handleTogglePackingItem(id: string): void {
  React.startTransition(async () => {
    try {
      await togglePackingItem(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update packing item. Please try again.");
    }
  });
}
```

Add `togglePackingItem` to the imports from `../actions`. Add `handleTogglePackingItem` to the `TripDetailHandlers` interface and the return object.

In `use-trip-detail-handlers.ts`, the `TripDetailHandlers` interface currently lists `handleAddPackingItem` and `handleRemovePackingItem` at lines ~60-61 — add `handleTogglePackingItem: (id: string) => void` there too.

### Trip Card Progress — Query Change

`listTripsForUser` at `queries.ts:85` currently builds `TripListEntry[]` using one subquery per trip for `todayEvents`. For packing progress, add two `COUNT` queries using Drizzle:

```ts
import { count } from "drizzle-orm";

// Inside the rows.map() callback, alongside the todayEvents query:
const [{ totalItems }] = await db
  .select({ totalItems: count() })
  .from(packingItems)
  .where(and(eq(packingItems.tripId, trip.id), eq(packingItems.isLabel, false)));

const [{ checkedItems }] = await db
  .select({ checkedItems: count() })
  .from(packingItems)
  .where(and(eq(packingItems.tripId, trip.id), eq(packingItems.isLabel, false), eq(packingItems.done, true)));
```

Then attach to the trip:

```ts
const packingProgress = totalItems > 0 ? { checked: checkedItems, total: totalItems } : undefined;
return {
  trip: { ...dbTripToType(trip), packingProgress },
  todayEvents: todayEvents.map(dbEventToType),
};
```

`count` is imported from `drizzle-orm` — it's already available in the project. `packingItems` is already imported in `queries.ts:9`.

**Performance note**: This adds 2 DB queries per trip in `listTripsForUser`. For the current use case (small user, few trips), this is acceptable. A single query with `GROUP BY trip_id` or a join would be more efficient at scale, but YAGNI — the simple approach is correct for Phase 1.

### TripCard Progress Display

In the meta row at `trip-card.tsx:144-161`, add a packing progress span when `trip.packingProgress` is set and `total > 0`:

```tsx
import { Package } from "lucide-react";

// In the meta row:
{trip.packingProgress && trip.packingProgress.total > 0 ? (
  <span className="flex items-center gap-1">
    <Package size={13} strokeWidth={1.5} />
    {trip.packingProgress.checked} / {trip.packingProgress.total} packed
  </span>
) : null}
```

Use `Package` icon from `lucide-react` (already installed). Render it after the existing Calendar, FileText, Users spans.

### Styling Rules

- The checkbox button: no border/background at the button level (keep visual in the inner span), cursor "pointer"
- Checked item text: add `line-through` text-decoration to item name when `item.done === true`
- Colors for checked state: `var(--fg-3)` for struck-through text (matches dimmed style)
- All existing colors remain via CSS custom properties — no hex/rgb additions

### Import Checklist for actions.ts

`togglePackingItem` must be imported alongside the existing packing imports in `use-trip-detail-handlers.ts`. Check line ~12-15 where `addPackingItem` and `removePackingItem` are imported.

### What NOT to do

- Do NOT add drag-to-reorder (story 1.3)
- Do NOT add inline editing of item text (story 1.4)
- Do NOT add label strikethrough when all items under it are checked (story 1.4)
- Do NOT add keyboard reorder (story 1.3)
- Do NOT add template-related features (Epic 2)
- Do NOT add optimistic UI for toggle (out of scope — accept the server round-trip)
- Do NOT use `window.confirm` for any action (project convention)
- Do NOT hardcode any hex/rgb colors

### Architecture Compliance

- All server actions: `requireUser()` + `assertTripAccess()` first — `togglePackingItem` already does this
- `revalidatePath()` after every mutation — `togglePackingItem` already does this
- All types in `src/data/types.ts` — no local type definitions
- Interactive components: `"use client"` as first line — `packing-list-view.tsx` already has it
- Colors via CSS custom properties only — no hardcoded hex/rgb
- Lucide icons: `strokeWidth={1.5}` — use `Package` for packing progress meta

### E2E Seed Data

Add a dedicated seed constant for scenarios that need pre-existing checkable items (so the toggle test doesn't depend on UI-driven item creation):

```ts
// e2e-seed-data.ts
export const E2E_PACKING_ITEMS = [
  { name: "Sunscreen", isLabel: false, done: false, position: 0 },
  { name: "Sunglasses", isLabel: false, done: false, position: 1 },
  { name: "Beach towel", isLabel: false, done: false, position: 2 },
];
```

Each E2E scenario that needs pre-seeded packing items must use a `Before` DB hook to insert these rows linked to `E2E_TRIP`'s ID — follow the pattern established in `packing-tab.steps.ts` for the "empty packing state" which already seeds per-scenario. Do NOT rely on items created by UI actions in prior scenarios.

### Testing

**Unit tests** (`packing-list-view.test.tsx` — add to existing describe block):

- Renders checkbox with `role="checkbox"` and `aria-checked="false"` for unchecked item
- Renders checkbox with `role="checkbox"` and `aria-checked="true"` for checked item (pass `done: true` in item fixture)
- Calls `onToggleItem` with the item's id when checkbox button is clicked
- Does NOT render a checkbox button for section labels (`isLabel: true`)
- Checkbox button carries `min-h-11` and `min-w-11` classes (touch target)

**Unit tests** (`trip-card.test.tsx` — add to existing describe block):

- Renders "X / Y packed" meta span when `trip.packingProgress = { checked: 3, total: 5 }`
- Renders "0 / 5 packed" when nothing is checked yet (`{ checked: 0, total: 5 }`)
- Does NOT render packing count when `packingProgress` is undefined
- Does NOT render packing count when `packingProgress.total === 0` (edge: all items are labels — shouldn't happen but guard it)

**E2E** (`tests/e2e/features/packing-tab.feature` — add scenarios):

```gherkin
Scenario: User checks an item and the checked state persists after reload
  Given I have pre-seeded packing items for the trip
  When I open the Packing tab
  And I check the packing item named "Sunscreen"
  Then the packing item "Sunscreen" should be checked
  When I reload the trip page
  And I open the Packing tab
  Then the packing item "Sunscreen" should be checked

Scenario: User unchecks an item and the unchecked state persists after reload
  Given I have pre-seeded packing items for the trip
  And the packing item "Sunscreen" is already checked
  When I open the Packing tab
  And I uncheck the packing item named "Sunscreen"
  Then the packing item "Sunscreen" should be unchecked
  When I reload the trip page
  And I open the Packing tab
  Then the packing item "Sunscreen" should be unchecked

Scenario: Checking items updates the trip card progress count
  Given I have pre-seeded packing items for the trip
  When I navigate to the trips list
  Then the trip card for "E2E Test Trip" should show "0 / 3 packed"
  When I open the trip and go to the Packing tab
  And I check the packing item named "Sunscreen"
  When I navigate to the trips list
  Then the trip card for "E2E Test Trip" should show "1 / 3 packed"
```

The "pre-seeded packing items" step definition should use a `Before` DB hook (same pattern as other self-seeding scenarios in the project) to insert `E2E_PACKING_ITEMS` linked to the E2E trip. The "already checked" step should update the `done` field in the DB directly (not via UI).

### Files to Create

None — all changes are additions to existing files.

### Files to Modify

| File | Change |
|------|--------|
| `src/data/types.ts` | Add `packingProgress?: { checked: number; total: number }` to `Trip` |
| `src/lib/queries.ts` | Add COUNT subqueries for packing progress in `listTripsForUser` |
| `src/components/packt/trip-card.tsx` | Render packing progress in meta row |
| `src/components/packt/trip-card.test.tsx` | Add progress count tests |
| `src/components/packt/packing-list-view.tsx` | Add `onToggleItem` prop; make checkbox interactive; add toggle announcement |
| `src/components/packt/packing-list-view.test.tsx` | Add toggle interaction tests |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Add `handleTogglePackingItem` |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Add `onTogglePackingItem` prop; pass to `PackingListView` |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Thread `handleTogglePackingItem` |
| `tests/e2e/e2e-seed-data.ts` | Add `E2E_PACKING_ITEMS` constant |
| `tests/e2e/features/packing-tab.feature` | Add check/uncheck/progress scenarios |
| `tests/e2e/steps/packing-tab.steps.ts` | Add step definitions for new scenarios |

### References

- [Epics doc](_bmad-output/implementation-artifacts/epics.md) — Epic 1, Story 1.2 (lines 218-247)
- [PRD](_bmad-output/implementation-artifacts/prd.md) — FR26-FR28, FR35-FR37, NFR8, NFR11, NFR12
- [Project context](_bmad-output/project-context.md) — stack versions, conventions, testing patterns
- [Previous story](_bmad-output/implementation-artifacts/1-1-packing-tab-foundation-list-display-and-item-label-management.md) — baseline implementation, review learnings
- [PackingListView](src/components/packt/packing-list-view.tsx) — existing component; `PackingRow` at line 127, `aria-live` at line 217
- [togglePackingItem action](src/app/(app)/trips/actions.ts#L472) — already correct, no changes needed
- [listTripsForUser](src/lib/queries.ts#L85) — add packing count subqueries here
- [TripCard meta row](src/components/packt/trip-card.tsx#L144) — add progress span here
- [useTripDetailHandlers packing handlers](src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts#L214) — follow same pattern for toggle handler

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `PackingProgress` interface and `packingProgress` field to `Trip` in `src/data/types.ts`
- Added packing COUNT subqueries to `listTripsForUser` in `src/lib/queries.ts`
- Added `handleTogglePackingItem` handler in `use-trip-detail-handlers.ts`
- Wired `onTogglePackingItem` through `page-client.tsx` and `trip-detail-tab-body.tsx`
- Converted decorative `<span>` to interactive `<button role="checkbox">` with `aria-checked` in `PackingRow`
- Added toggle announcements via existing `aria-live` region
- Added strikethrough styling and dimmed color for checked items
- Added packing progress display (`Package` icon + "X / Y packed") to `TripCard` meta row
- Added 11 new unit tests (toggle interaction + progress display)
- Added `E2E_PACKING_ITEMS` seed data, 3 Gherkin scenarios, and step definitions
- All validations pass: ESLint, TypeScript, Vitest coverage (96.57% lines, 95.3% functions, 90.5% branches), Next.js build

### File List

| File | Change |
|------|--------|
| `src/data/types.ts` | Added `PackingProgress` interface + `packingProgress` to `Trip` |
| `src/lib/queries.ts` | Added packing COUNT subqueries to `listTripsForUser` |
| `src/components/packt/trip-card.tsx` | Added packing progress display in meta row |
| `src/components/packt/trip-card.test.tsx` | Added 4 progress count tests |
| `src/components/packt/packing-list-view.tsx` | Added `onToggleItem` prop; interactive checkbox; toggle announcements |
| `src/components/packt/packing-list-view.test.tsx` | Added 11 toggle interaction tests |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Added `handleTogglePackingItem` |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Added `onTogglePackingItem` prop |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Threaded `handleTogglePackingItem` |
| `tests/e2e/e2e-seed-data.ts` | Added `E2E_PACKING_ITEMS` constant |
| `tests/e2e/features/packing-tab.feature` | Added check/uncheck/progress scenarios |
| `tests/e2e/steps/packing-tab.steps.ts` | Added step definitions for new scenarios |

### Review Findings

- [x] [Review][Dismiss] Static `aria-label` always says "Pack {name}" regardless of checked state [`src/components/packt/packing-list-view.tsx:142`] — spec explicitly chose static label; `aria-checked` communicates state to AT.
- [x] [Review][Patch] E2E "I uncheck" step — added wait for `aria-checked="false"` after click [`tests/e2e/steps/packing-tab.steps.ts:149-151`]
- [x] [Review][Patch] E2E Given step URL regex — changed to more permissive regex [`tests/e2e/steps/packing-tab.steps.ts:128,141`]
- [x] [Review][Dismiss] `handleToggle` silently returns when `item.id` is undefined [`src/components/packt/packing-list-view.tsx:232`] — follows same pre-existing pattern as `handleRemove`.
- [x] [Review][Defer] Optimistic `aria-live` announcement fires before server action resolves [`src/components/packt/packing-list-view.tsx:231-237`] — deferred, pre-existing pattern (other handlers follow same optimistic announcement approach).
- [x] [Review][Defer] Race condition between two COUNT queries in `listTripsForUser` [`src/lib/queries.ts:102-110`] — deferred, pre-existing architectural decision (spec notes this and accepts it for Phase 1).
- [x] [Review][Defer] Test asserts hardcoded `"ungrouped-1"` ID not visible in diff [`src/components/packt/packing-list-view.test.tsx:117`] — deferred, pre-existing test data context.
