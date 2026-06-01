# Story 1.1: Packing Tab Foundation — List Display & Item/Label Management

Status: in-progress

## Story

As a traveler,
I want to open the Packing tab on my trip and build a list of items and section labels,
so that I can capture everything I need to pack for this trip.

FRs covered: FR12, FR13, FR17, FR18, FR19, FR21, FR22, FR23, FR25

## Acceptance Criteria

**AC1 — Empty state**
Given a trip has no packing list items
When the user navigates to the Packing tab
Then they see an empty state with a prompt to start adding items

**AC2 — Add plain-text item**
Given the user is on the Packing tab
When they submit a new plain-text item
Then the item appears in the list at the correct position
And the item persists after a page reload

**AC3 — Add section label**
Given the user adds a section label
When the label is created
Then it renders visually distinct from items and has no checkbox
And items added after the label appear beneath it in the flat array

**AC4 — Remove item or label**
Given the user removes an item or section label
When the deletion is confirmed
Then it is removed from the list and the removal persists after a page reload

**AC5 — Ungrouped items below sections**
Given the packing list has items both under section labels and without a section
When the list renders
Then ungrouped items appear below all labeled sections

**AC6 — Touch targets & focus**
Given any interactive element in the packing tab
Then all touch targets are at minimum 44×44px on mobile viewports
And all interactive elements have a visible focus indicator meeting WCAG 2.1 AA contrast

**AC7 — Server action security**
Given any server action is called
Then it enforces `requireUser()` + `assertTripAccess()` before reading or writing any packing data

## Tasks

- [x] DB schema — add `is_label` column to `packing_items` (AC: 3, 4, 5)
- [x] Types — update `PackingItem` with `isLabel` field (AC: 3, 5)
- [x] DB mapper — create `dbPackingItemToType()` (AC: 2–5)
- [x] Server actions — extend `addPackingItem`/`removePackingItem` for label support (AC: 2–4, 7)
- [x] Component — `PackingListView` with empty state, add-item, add-label, remove flows (AC: 1–6)
- [x] Handlers — wire packing handlers in `useTripDetailHandlers` (AC: 1–4)
- [x] Tab body — replace stub with `PackingListView` component (AC: 1)
- [x] E2E — packing-tab.feature with empty state, add/remove item, add/remove label (AC: 1–5, 7)
- [x] Unit tests — `PackingListView.test.tsx` covering render, add, remove flows (AC: 1–6)
- [x] Unit tests — `db-mappers.test.ts` — add `dbPackingItemToType` test following existing mapper test patterns (AC: 2–5)

## Dev Notes

### Existing state (brownfield)

What already exists — extend, don't replace:

| Artifact | Location | Status |
|----------|----------|--------|
| DB table `packing_items` | `src/db/schema.ts:216` | Has `id`, `trip_id`, `name`, `done`, `position` — needs `is_label` column |
| Type `PackingItem` | `src/data/types.ts:381` | Has `id?`, `name`, `done`, `tripId?`, `position?` — needs `isLabel` |
| Type `AddPackingItemInput` | `src/data/types.ts:555` | Has `name` only — needs `isLabel` field |
| Server action `addPackingItem` | `src/app/(app)/trips/actions.ts:455` | Inserts item with auto-increment position — extend for `isLabel` |
| Server action `togglePackingItem` | `src/app/(app)/trips/actions.ts:471` | Toggles `done` — not relevant here, keep as-is |
| Server action `removePackingItem` | `src/app/(app)/trips/actions.ts:480` | Deletes by ID — works for items and labels as-is |
| Query `getTripDetail()` | `src/lib/queries.ts:129-133` | Already fetches `packingItems` ordered by position |
| `packingItems` inline mapping | `src/lib/queries.ts:254-259` | Maps DB row to `PackingItem` — update to include `isLabel` |
| Packing tab stub | `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx:110-113` | Plain text "coming soon" — replace with component |
| `PackingRail` component | `src/components/packt/packing-rail.tsx` | Read-only rail for sidebar — **do not modify** |
| `TripDetailTab.Packing` | `src/data/types.ts` | Tab value `"pack"` — already exists |

### DB schema change

Add `is_label` column to the existing `packing_items` table (drizzle migration):

```ts
// In src/db/schema.ts, add to packingItems table:
isLabel: boolean("is_label").default(false).notNull(),
```

The existing columns (`name`, `done`, `position`) remain unchanged for backward compatibility. No new table needed — the epic's speculative `packing_list_items` name maps to the existing `packing_items` table.

The `name` column stores both item text and label text. `is_label` distinguishes them. `done` is unused for labels (always false) but kept for schema simplicity.

### Types change

Update `PackingItem` in `src/data/types.ts`:

```ts
export interface PackingItem {
  id?: string;
  name: string;
  done: boolean;
  tripId?: string;
  position?: number;
  isLabel?: boolean;
}
```

Update `AddPackingItemInput`:

```ts
export interface AddPackingItemInput {
  name: string;
  isLabel?: boolean;
}
```

### DB mapper

Create `dbPackingItemToType()` in `src/lib/db-mappers.ts` to replace the inline mapping in `queries.ts`. Pattern: matches existing mappers like `dbEventToType()`.

```ts
export function dbPackingItemToType(row: typeof packingItems.$inferSelect): PackingItem {
  return {
    id: row.id,
    name: row.name,
    done: row.done ?? false,
    position: row.position,
    isLabel: row.isLabel ?? false,
  };
}
```

Then update `src/lib/queries.ts:254-259` to use the mapper.

### Server action changes

**Extend `addPackingItem`** — add `isLabel` to the insert (action already uses `AddPackingItemInput`):

```ts
export async function addPackingItem(tripId: string, input: AddPackingItemInput) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
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
  revalidatePath(`/trips/${tripId}`);
}
```

**`removePackingItem`** already works for both items and labels (deletes by ID). No change needed.

**`togglePackingItem`** — no change needed (not used in this story).

### Flat list rendering (section grouping)

The list is a flat array ordered by `position`. Section grouping is a **render-time concern only**:

1. Walk items in position order
2. Items with `isLabel === true` start a new section
3. All non-label items that follow a label (until the next label) belong to that section
4. Items before the first label are "ungrouped" — render at the bottom, below all labeled sections
5. Render order: `[Sections (label → its items)] → [Ungrouped items]`

Pseudocode:
```
sections = [] // { label: PackingItem, items: PackingItem[] }
ungrouped: PackingItem[] = []
currentSection = null

for each item in sorted items:
  if item.isLabel:
    currentSection = { label: item, items: [] }
    sections.push(currentSection)
  else if currentSection:
    currentSection.items.push(item)
  else:
    ungrouped.push(item)

render:
  for each section:
    render section.label (visually distinct, no checkbox)
    for each item in section.items:
      render item (with checkbox)
  render "Ungrouped" heading (optional)
  for each item in ungrouped:
    render item (with checkbox)
```

### Component structure

Create `src/components/packt/packing-list-view.tsx`:

```
PackingListView
├── EmptyState (when items.length === 0)
│   └── "Your packing list is empty" prompt
│   └── AddItemForm (inline text input + submit)
├── PackingList (when items.length > 0)
│   ├── SectionGroup[] (one per label)
│   │   ├── SectionLabel (visually distinct, no checkbox)
│   │   └── ItemRow[] (with checkbox + delete button)
│   └── UngroupedArea
│       └── ItemRow[] (for items before first label)
├── AddItemForm (always visible at bottom when list has content)
│   └── Text input + "Add item" / "Add label" toggle
```

Props interface:
```ts
interface PackingListViewProps {
  tripId: string;
  items: PackingItem[];
  onAddItem: (name: string, isLabel?: boolean) => void;
  onRemoveItem: (id: string) => void;
}
```

### Handler wiring

In `use-trip-detail-handlers.ts`:
- Import `addPackingItem`, `removePackingItem` from `../actions`
- Add handlers: `handleAddPackingItem(name, isLabel?)`, `handleRemovePackingItem(id)`
- Add to `TripDetailHandlers` interface return

In `page-client.tsx`:
- Destructure `packingItems` from `detail` (currently omitted — add to line 55)
- Pass packing handlers through to `TripDetailTabBody`

In `trip-detail-tab-body.tsx`:
- Add packing handler props to `TripDetailTabBodyProps`
- Replace stub with `<PackingListView ... />`

### Styling rules

- All colors via CSS custom properties — no hex/rgb
- Tailwind for static layout/spacing; inline `style` for dynamic values
- Section labels: `bg-surface-2` background, no checkbox circle, bold-ish weight
- Items: full row with checkable circle + text + delete button
- Touch targets minimum 44×44px for all interactive elements
- Focus indicators via `focus-visible:ring-2` or inline outline styles
- Delete button: `<X size={14} strokeWidth={1.5} />` with `title="Remove [item]"`

### Import conventions

- Domain types from `@/data/types`
- Server actions from `../actions` (relative to `[tripId]` directory)
- `cn()` from `@/lib/utils` for className merging
- Lucide icons with `strokeWidth={1.5}`
- `"use client"` as first line in all interactive components

### Files to create

| File | Purpose |
|------|---------|
| `src/components/packt/packing-list-view.tsx` | Main packing tab component |
| `src/components/packt/packing-list-view.test.tsx` | Unit tests |

### Files to modify

| File | Change |
|------|--------|
| `src/db/schema.ts` | Add `is_label` column to `packingItems` |
| `src/data/types.ts` | Add `isLabel` to `PackingItem` + `AddPackingItemInput` |
| `src/lib/db-mappers.ts` | Add `dbPackingItemToType()` |
| `src/lib/queries.ts` | Use mapper instead of inline |
| `src/app/(app)/trips/actions.ts` | Extend `addPackingItem` for `isLabel` |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Add packing handlers |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Pass `packingItems` + handlers |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Replace stub |
| `tests/e2e/e2e-seed-data.ts` | Add packing items seed data |
| `tests/e2e/global-setup.ts` | Already truncates `packing_items` — confirm |

### Accessibility requirements

- Section labels are headers (`role="heading"` or `<h3>`) — not interactive as checkboxes
- Each item row: `<div role="checkbox" aria-checked={done} tabIndex={0}>` or native `<input type="checkbox">` with visible custom styling
- Delete buttons: `<button aria-label="Remove {name}">`
- Focus ring on all interactive elements (WCAG 2.1 AA: 3:1 contrast ratio)
- Touch targets minimum 44×44 CSS pixels
- Announcements: screen reader announcements on item add/remove (use `aria-live="polite"` region)

### Testing

**Unit tests** (`packing-list-view.test.tsx`):
- Renders empty state prompt when items array is empty
- Renders items in correct order
- Renders section labels as distinct from items
- Groups items under correct label in render order
- Moves ungrouped items below all sections
- Fires onAddItem callback on submit
- Fires onRemoveItem callback on delete click
- All interactive elements meet minimum touch target size

**E2E** (`tests/e2e/features/packing-tab.feature`):
- Scenario: empty state shows prompt
- Scenario: add item and verify persistence on reload
- Scenario: add section label and verify visual distinction
- Scenario: add item under section label
- Scenario: delete item and verify removal persists
- Scenario: delete section label
- Scenario: ungrouped items appear below sections

**E2E seed data** — add to `tests/e2e/e2e-seed-data.ts`:
```ts
export const E2E_PACKING_ITEMS = [
  { name: "Passport", done: false, position: 0 },
  { name: "Documents", isLabel: true, done: false, position: 1 },
  { name: "Phone charger", done: false, position: 2 },
];
```
Update `global-setup.ts` to insert `E2E_PACKING_ITEMS` into `packing_items` linked to `E2E_TRIP`'s ID.

### Existing file size notes

- `src/app/(app)/trips/[tripId]/page-client.tsx` — 279 lines, slightly over the 250-line guideline. The packing additions are minimal (~5 lines of props/handlers), but consider extracting the tab bar and hero section into separate sub-components if it grows further.
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` — 292 lines, no JSX (pure TypeScript hook file). Adding 2–3 packing handler functions is acceptable within the existing pattern.
- `src/app/(app)/trips/actions.ts` — 567 lines, but this is a server-actions collection file. Adding the `isLabel` field is a 1-line change. File splitting is a separate concern.

### What NOT to do

- Do NOT create a new DB table — extend `packing_items`
- Do NOT modify `PackingRail` component (sidebar rail stays read-only)
- Do NOT modify `togglePackingItem` action (not used until story 1.2)
- Do NOT add drag-to-reorder (story 1.3)
- Do NOT add inline editing (story 1.4)
- Do NOT add strikethrough on labels when items checked (story 1.4)
- Do NOT implement trip card progress (story 1.2)
- Do NOT add keyboard reorder (story 1.3)
- Do NOT add template-related features (Epic 2)
- Do NOT add `updatePackingItem` server action (needed in story 1.4, not now)

### Architecture compliance

- All server actions: `requireUser()` + `assertTripAccess()` first
- `revalidatePath()` after every mutation
- All types in `src/data/types.ts` — no local type definitions
- Interactive components: `"use client"` as first line
- Colors via CSS custom properties only — no hardcoded hex/rgb
- Lucide icons: `strokeWidth={1.5}`
- No `any` types, no single-letter variable names (except `for` loop `i`)
- Tests colocated with source files

### Review Findings

#### patch

- [x] [Review][Patch] Remove `window.confirm` from delete flow — no confirmation on delete [packing-list-view.tsx:197]
- [x] [Review][Patch] `groupPackingItems` recomputes on every render — wrapped with useMemo [packing-list-view.tsx]
- [x] [Review][Patch] Dead nullish coalescing in `dbPackingItemToType` — removed `?? false`, column is notNull [db-mappers.ts]
- [x] [Review][Patch] No guard against rapid double-submit on add — added isSubmitting state + useEffect reset on items change [packing-list-view.tsx]
- [x] [Review][Patch] Indirect parameter type on `handleAddPackingItem` — changed to plain `boolean` [use-trip-detail-handlers.ts]
- [x] [Review][Patch] Cancel confirm dialog not tested [packing-list-view.test.tsx]
- [x] [Review][Patch] No input maxLength on item name — added maxLength={100} [packing-list-view.tsx]
- [x] [Review][Patch] AC6 — missing min-width on some interactive elements — added min-w-11 to Add item/Add label buttons [packing-list-view.tsx]
- [x] [Review][Patch] Duplicate React keys from id→name fallback — changed to item.id (always present for DB rows) [packing-list-view.tsx]
- [x] [Review][Patch] aria-live region won't re-announce identical text — added keyed inner span via announcementId counter [packing-list-view.tsx]
- [x] [Review][Patch] Redundant `<label>` and `aria-label` on same input — removed aria-label, label htmlFor provides accessible name [packing-list-view.tsx]
- [x] [Review][Patch] `getBaseTripId` returns undefined silently — added console.warn when trip not found [packing-tab.steps.ts]
- [x] [Review][Patch] Missing test: `addPackingItem` with null maxPos (empty list) — added position-0 test [actions.test.ts]
- [x] [Review][Patch] Missing E2E scenario: add item under section label — added "Items added after a section label appear under that label" [packing-tab.feature]
- [x] [Review][Patch] Missing E2E: section label deletion not verified to persist after reload — extended label removal scenario [packing-tab.feature]
- [x] [Review][Patch] day-planning.steps.ts: hardcoded "1 day"/"2 days" strings — changed to regex /\b1 day\b/ and /\b2 days\b/ [day-planning.steps.ts]
- [x] [Review][Patch] `groupPackingItems` falls back to array index when `position` is undefined — changed to Infinity fallback [packing-list-view.tsx]

#### defer

- [x] [Review][Defer] Optional `isLabel` type vs not-null DB column [types.ts:387] — deferred, intentional: the optional makes sense for input/mutation contexts
- [x] [Review][Defer] No optimistic update pattern — deferred, out of scope for this story
- [x] [Review][Defer] Label removal orphans items as ungrouped — deferred, intended behavior per spec
- [x] [Review][Defer] Non-functional checkbox looks clickable — deferred, toggle arrives in story 1.2
- [x] [Review][Defer] No dedicated `groupPackingItems` unit test — deferred, grouping is verified implicitly by the render-order test
- [x] [Review][Defer] Touch target test uses class presence not rendered size — deferred, jsdom cannot measure computed pixel dimensions
- [x] [Review][Defer] Optimistic announcement not rolled back on server error — deferred, requires onAddItem/onRemoveItem to return Promise<void> which is a cross-cutting refactor

### References

- [Epics doc](_bmad-output/implementation-artifacts/epics.md) — Epic 1, Story 1.1 (lines 175-214)
- [PRD](_bmad-output/implementation-artifacts/prd.md) — FR12-FR19, FR21-FR23, FR25, NFR5-NFR6, NFR8, NFR10, NFR12
- [Project context](_bmad-output/project-context.md) — stack versions, conventions, component patterns
- [Existing action patterns](src/app/(app)/trips/actions.ts:455-487) — `addPackingItem`, `removePackingItem`
- [DB schema](src/db/schema.ts:216-226) — existing `packing_items` table
- [Types](src/data/types.ts:381-387) — existing `PackingItem` type
- [DnD pattern](src/components/packt/day-card-dnd.tsx) — @dnd-kit usage (for reference, not used in this story)

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `npx tsc --noEmit`
- `npx vitest run src/components/packt/packing-list-view.test.tsx src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx src/lib/db-mappers.test.ts src/app/(app)/trips/actions.test.ts src/app/(app)/trips/[tripId]/page-client.test.tsx`
- `npm run db:reset:e2e`
- `npm run db:migrate:e2e`
- `npx bddgen`
- `npx playwright test '.features-gen/tests/e2e/features/packing-tab.feature.spec.js'`
- `npm run lint 2>&1`
- `npx tsc --noEmit 2>&1`
- `npm run test:coverage 2>&1`
- `npm run test:e2e 2>&1`
- `npm run build 2>&1`

### Completion Notes List

- Added `is_label` support end-to-end across the schema, type layer, mappers, trip detail queries, and packing server actions.
- Replaced the packing-tab placeholder with `PackingListView`, including empty state, label/item creation, confirmed removal, render-time section grouping, touch-target sizing, and screen-reader announcements.
- Added targeted unit coverage for packing view behavior, handler wiring, mapper output, and packing action authorization.
- Added dedicated Playwright-BDD packing scenarios covering empty state, item persistence, label management, and ungrouped ordering.
- Full validator status: lint, TypeScript, coverage, Playwright E2E, and production build passed.

### File List

- `src/db/schema.ts`
- `src/data/types.ts`
- `src/lib/db-mappers.ts`
- `src/lib/queries.ts`
- `src/app/(app)/trips/actions.ts`
- `src/app/(app)/trips/actions.test.ts`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx`
- `src/app/(app)/trips/[tripId]/page-client.tsx`
- `src/app/(app)/trips/[tripId]/page-client.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`
- `src/components/packt/packing-list-view.tsx`
- `src/components/packt/packing-list-view.test.tsx`
- `src/lib/db-mappers.test.ts`
- `tests/e2e/features/packing-tab.feature`
- `tests/e2e/steps/day-planning.steps.ts`
- `tests/e2e/steps/packing-tab.steps.ts`
