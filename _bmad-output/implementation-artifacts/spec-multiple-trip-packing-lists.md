---
title: "Multiple Trip Packing Lists with Itinerary Integration"
type: "feature"
created: "2026-06-08"
status: "ready-for-dev"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Each trip has a single flat packing list, making it hard to organize gear across multiple contexts; and there is no way to bring a reusable packing list or template into the itinerary as a checklist.

**Approach:** Add a `tripPackingLists` DB table so each trip can have multiple named packing lists. Restructure the Packing tab to a library view (matching the template library UX) with drill-down into each list's existing `PackingListView`. Add a 4th Backpack button to the itinerary type-picker that opens a picker dialog showing the trip's packing lists and the user's templates; selecting one inserts it as an itinerary checklist (pre-populated with that source's non-label items) at the chosen position in the day.

## Boundaries & Constraints

**Always:**
- All new server actions must call `requireUser()` then `assertTripAccess()` before any read or write.
- New packing items must include a `listId` targeting the specific list.
- Items with `listId = null` (legacy/existing data) are shown under an implicit "General" section if they exist, for backward compatibility.
- The Backpack button in TypePicker fires `onOpenPackingListPicker()`, which opens a picker dialog rendered at `TripItineraryView` level; dialog data (`packingLists`, `templates`) is passed as props to `TripItineraryView` rather than threaded down to `DayCardBody`.
- Only non-label items from a source list/template become checklist items; label/section rows are skipped.
- Backpack icon: `title="Insert packing list"`, `strokeWidth={1.5}`.
- DB push: `npm run db:migrate` (dev), `npm run db:migrate:e2e` (E2E).

**Ask First:**
- If auto-migrating legacy `null`-listId items to a "General" list requires SQL beyond `drizzle-kit push`, pause and confirm before writing any migration.

**Never:**
- Do not add list-level reordering — future scope.
- Do not copy label/section items into the inserted checklist.
- Do not modify `PackingListView`, `PackingListSortable`, or existing packing server actions beyond adding `listId` to `addPackingItem`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Create list (packing tab) | User clicks "New List", enters name | List added to packing tab library; clicking it shows `PackingListView` | If name empty, disable submit |
| Insert from picker — packing list | User clicks Backpack in type-picker, selects a trip packing list | New `itinerary_checklist` inserted at that position; title = list name; items = non-label items from list | Server error → `toast.error(...)` |
| Insert from picker — template | User clicks Backpack in type-picker, selects a template | New `itinerary_checklist` inserted; title = template name; items = non-label items from template | Server error → `toast.error(...)` |
| Picker opened with no sources | Trip has no packing lists and user has no templates | Dialog shows empty state: "No packing lists or templates yet" | — |
| Delete packing list | User clicks delete on a list card | If list has items, show confirmation dialog with item count; on confirm, cascade deletes | Cancel preserves the list |
| Open packing list | User clicks a list card | `PackingListView` shown for that list's items (filtered by `listId`) | — |
| Legacy items present | Trip has packing items with `listId = null` | Packing tab shows them under an implicit "General" row | — |
| Empty trip | No `tripPackingLists` rows, no legacy items | Packing tab empty state: "No packing lists yet" with "New List" button | — |

</frozen-after-approval>

## Code Map

- `src/db/schema.ts` — add `tripPackingLists` table; add nullable `listId` FK column to `packingItems`
- `src/data/types.ts` — add `TripPackingList`, `CreateTripPackingListInput`, `RenameTripPackingListInput`; update `TripDetailPayload` to include `packingLists: TripPackingList[]`; add `listId?: string | null` to `AddPackingItemInput`
- `src/lib/db-mappers.ts` — add `dbPackingListToType()` mapper
- `src/lib/queries.ts` — update `getTripDetail` to fetch `tripPackingLists`; keep packing-progress count working regardless of `listId`
- `src/app/(app)/trips/packing-actions.ts` — add `createPackingList`, `renamePackingList`, `deletePackingList`; extend `addPackingItem` to accept and store `listId`
- `src/app/(app)/trips/[tripId]/actions.ts` — add `addChecklistFromPackingSource(tripId, dayId, position, sourceType, sourceId)`: fetches non-label items from the source, creates `itinerary_checklist` + `checklistItems`, revalidates
- `src/components/packt/packing-lists-view.tsx` — NEW: library view; `"use client"`; `PackingListsViewProps` interface; list cards + optional General row + drill-down
- `src/components/packt/packing-lists-view.test.tsx` — NEW: unit tests
- `src/components/packt/packing-list-picker-dialog.tsx` — NEW: dialog showing two sections ("Trip Packing Lists", "Templates"); `"use client"`; `PackingListPickerDialogProps` interface
- `src/components/packt/packing-list-picker-dialog.test.tsx` — NEW: unit tests
- `src/components/packt/type-picker.tsx` — add optional `onOpenPackingListPicker?: () => void`; when provided, render 4th Backpack button
- `src/components/packt/type-picker.test.tsx` — update to cover 4th button
- `src/components/packt/day-card-body.tsx` — add `onOpenPackingListPicker?: (insertAtPosition: number) => void`; when TypePicker fires the callback, forward position to parent
- `src/components/packt/day-card-body.test.tsx` — add test for Backpack selection forwarding
- `src/components/packt/day-card-dnd.tsx` — thread `onOpenPackingListPicker` to `DayCardBottomAdd`; extract `DayCardBottomAdd` into `day-card-bottom-add.tsx` to bring file under 250 lines
- `src/components/packt/day-card-dnd.test.tsx` — CREATE: verify Backpack button fires callback
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` — accept `packingLists`, `templates`, `onInsertFromPackingSource`; render `PackingListPickerDialog` when picker state is set; pass `onOpenPackingListPicker` to each `DayCard`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` — pass `packingLists`, `templates`, and `onInsertFromPackingSource` to `TripItineraryView`; replace `PackingListView` render with `PackingListsView` on pack tab
- `src/app/(app)/trips/[tripId]/use-packing-handlers.ts` — NEW (split from `use-trip-detail-handlers.ts`): all packing handlers including `handleInsertFromPackingSource`, `handleCreatePackingList`, `handleRenamePackingList`, `handleDeletePackingList`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` — remove packing handlers (moved to `use-packing-handlers.ts`)
- `src/app/(app)/trips/[tripId]/page-client.tsx` — extract hero section into `trip-detail-hero.tsx` first; wire packing handlers from `use-packing-handlers.ts`
- `tests/e2e/features/packing-lists.feature` — NEW: Gherkin scenarios
- `tests/e2e/steps/packing-lists.steps.ts` — NEW: step definitions

## Tasks & Acceptance

**Execution:**

- [ ] `src/db/schema.ts` — add `tripPackingLists` table (`id`, `tripId` FK cascade, `name`, `position`, `createdAt`) and nullable `listId` FK on `packingItems` referencing `tripPackingLists.id` with cascade delete
- [ ] `src/data/types.ts` — add `TripPackingList` interface and input types; add `listId?: string | null` to `AddPackingItemInput`; add `packingLists: TripPackingList[]` to `TripDetailPayload`
- [ ] `src/lib/db-mappers.ts` — add `dbPackingListToType()`
- [ ] `src/lib/db-mappers.test.ts` — add test for `dbPackingListToType()`: verify `id`, `tripId`, `name`, `position`, `createdAt` are mapped correctly
- [ ] `src/lib/queries.ts` — extend `getTripDetail` to query `tripPackingLists` ordered by `position`; keep packing-progress count intact
- [ ] `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` — FIRST: extract packing handlers into new `use-packing-handlers.ts`; file is 443 lines
- [ ] `src/app/(app)/trips/[tripId]/page-client.tsx` — FIRST: extract hero section (crumb bar + cover + metadata) into `trip-detail-hero.tsx`; file is 292 lines
- [ ] `src/app/(app)/trips/packing-actions.ts` — add `createPackingList(tripId, name)`, `renamePackingList(listId, name)`, `deletePackingList(listId)`; extend `addPackingItemImpl` to store `input.listId`
- [ ] `src/app/(app)/trips/[tripId]/actions.ts` — add `addChecklistFromPackingSource(tripId, dayId, position, sourceType: "packing-list" | "template", sourceId)`: fetch non-label items from source, insert `itinerary_checklist` with title = source name, insert `checklistItems` for each item, revalidate trip path; return new checklist `id`
- [ ] `src/components/packt/packing-lists-view.tsx` — create library component: `"use client"`; `PackingListsViewProps` interface; list cards with name, item count, rename (`title`/`aria-label`) and delete (`title`/`aria-label`) icon buttons; `AlertDialog` for non-empty list deletion; `useState<string | null>` drill-down; "New List" button; name input with `aria-label="Packing list name"`; optional General row for null-listId legacy items
- [ ] `src/components/packt/packing-lists-view.test.tsx` — unit tests: empty state, list cards with counts, drill-down on click, accessible rename/delete labels, delete confirmation for non-empty list, General row for null-listId items
- [ ] `src/components/packt/packing-list-picker-dialog.tsx` — create dialog: `"use client"`; `PackingListPickerDialogProps` interface (`open`, `onClose`, `packingLists`, `templates`, `onSelect(sourceType, sourceId)`); use the existing `Dialog` component from `src/components/ui/dialog.tsx` (Base UI-backed) as the shell — focus trapping, Escape, and focus-return are handled automatically; do not implement custom focus management; two labeled sections "Trip Packing Lists" / "Templates"; each row is a `<button>` element (keyboard-focusable, Enter/Space selection) at least `h-11` tall; empty state when both sections are empty
- [ ] `src/components/packt/packing-list-picker-dialog.test.tsx` — unit tests: renders both sections, clicking item calls `onSelect` with correct type+id, empty state shown when no sources, Escape closes dialog
- [ ] `src/components/packt/type-picker.tsx` — add optional `onOpenPackingListPicker?: () => void`; when provided, render 4th Backpack button with `title="Insert packing list"` and `strokeWidth={1.5}`
- [ ] `src/components/packt/type-picker.test.tsx` — update: 4th button renders when prop provided, fires callback on click, absent when prop omitted
- [ ] `src/components/packt/day-card-body.tsx` — add `onOpenPackingListPicker?: (insertAtPosition: number) => void`; pass it to TypePicker as `onOpenPackingListPicker={() => onOpenPackingListPicker?.(insertAtPosition)}`; no inline prompt needed
- [ ] `src/components/packt/day-card-body.test.tsx` — add test: Backpack button click calls `onOpenPackingListPicker` with correct position
- [ ] `src/components/packt/day-card-dnd.tsx` — thread `onOpenPackingListPicker` to `DayCardBottomAdd`; extract `DayCardBottomAdd` into `src/components/packt/day-card-bottom-add.tsx` to bring the file under 250 lines
- [ ] `src/components/packt/day-card-dnd.test.tsx` — CREATE: `onOpenPackingListPicker` threads correctly through to the bottom-add area
- [ ] `src/components/packt/day-card-bottom-add.test.tsx` — CREATE: renders the bottom-add button, clicking it opens the type-picker, Backpack option is present when `onOpenPackingListPicker` is provided
- [ ] `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` — accept `packingLists: TripPackingList[]`, `templates: PackingTemplate[]`, `onInsertFromPackingSource(dayNumber, position, sourceType, sourceId)`; hold `pickerState: {dayNumber, insertAtPosition} | null`; render `PackingListPickerDialog` when set; pass `onOpenPackingListPicker` to each `DayCard`
- [ ] `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` — pass `packingLists`, `templates`, `onInsertFromPackingSource` to `TripItineraryView`; render `PackingListsView` on pack tab
- [ ] `src/app/(app)/trips/[tripId]/use-packing-handlers.ts` — NEW: `handleInsertFromPackingSource`, `handleCreatePackingList`, `handleRenamePackingList`, `handleDeletePackingList`
- [ ] `src/app/(app)/trips/[tripId]/page-client.tsx` — after hero split: wire packing handlers; pass `packingLists`, `templates`, and `onInsertFromPackingSource` down through `TripDetailTabBody`
- [ ] `tests/e2e/features/packing-lists.feature` + `tests/e2e/steps/packing-lists.steps.ts` — E2E scenarios: create packing list from tab, add item to list, open picker from itinerary and insert template as checklist, legacy null-listId items appear in General row
- [ ] Run `npm run db:migrate` and `npm run db:migrate:e2e` after schema changes

**Acceptance Criteria:**

- Given the packing tab is open with no lists, then an empty state with "New List" is shown.
- Given the packing tab has lists, then each appears as a card with name and non-label item count; clicking drills into its `PackingListView`.
- Given a list has items and delete is clicked, then a confirmation dialog shows the item count; confirming deletes the list and all items.
- Given a trip has legacy packing items with `listId = null`, then those items appear in a "General" row in the packing tab.
- Given the Backpack button is clicked in the itinerary type-picker, then a dialog opens showing "Trip Packing Lists" and "Templates" sections.
- Given a source is selected from the picker, then a new itinerary checklist is inserted at that position with the source's name as title and its non-label items pre-populated.
- Given the picker is opened with no packing lists and no templates, then an empty-state message is shown.

## Spec Change Log

- 2026-06-08: Renegotiated itinerary integration (Goal 2). Original spec had the Backpack button create a new trip-level packing list with an inline name prompt. Revised to: Backpack opens a picker dialog showing existing trip packing lists + templates; selecting one inserts it as a pre-populated itinerary checklist. Removed inline name prompt tasks; added `PackingListPickerDialog`, `addChecklistFromPackingSource` action, picker state in `TripItineraryView`.

## Design Notes

**Packing tab drill-down:** `PackingListsView` holds `useState<string | null>` for the active list ID. Null renders the library index; non-null renders `PackingListView` with items filtered to that `listId`. No URL change needed.

**Picker dialog placement:** `PackingListPickerDialog` is rendered at `TripItineraryView` level — it needs `packingLists` and `templates` but those only need to thread as far as `TripItineraryView`, not down into individual `DayCardBody` instances. `DayCardBody` only receives a position-forwarding callback.

**Insert action:** `addChecklistFromPackingSource` in `actions.ts` fetches non-label items from the source (packing list or template), creates one `itinerary_checklist` row and N `checklistItems` rows in a transaction, returns the new checklist `id` so the caller can pass it as `newlyCreatedChecklistId` for auto-scroll focus.

## Verification

**Commands:**

- `npm run lint` -- expected: no ESLint errors
- `npm run test:coverage` -- expected: ≥95% lines/functions, ≥90% branches
- `npm run build` -- expected: clean production build
- `npm run test:e2e` -- expected: packing-lists feature passes
