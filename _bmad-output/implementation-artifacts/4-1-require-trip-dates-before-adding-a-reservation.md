---
baseline_commit: 2f29b59208f5138d1a536cfe62a7548314e67115
---

# Story 4.1: Require Trip Dates Before Adding a Reservation

Status: ready-for-dev

## Story

As a trip planner,
I want to be prompted to set my trip's dates before I can add a Reservation to a dateless trip,
so that booking dates always land on real, correctly ordered itinerary days instead of risking orphaned or misaligned placeholder days.

## Acceptance Criteria

1. **Oversized-file split required before feature edit** — `src/app/(app)/trips/[tripId]/reservations/actions.ts` is already oversized and must be split as part of this story before or alongside the dateless-trip fix:
   - extract reservation date-range helpers (`nextCalendarDate`, `extendTripDateRange`, related constants/types) into a sibling helper module such as `reservation-date-range.ts`
   - extract reservation document actions (`uploadReservationDocument`, `removeReservationDocument`, `renameReservationDocument`, `promoteReservationDocToTrip`, `attachTripDocToReservation`, and any document-only helper they need) into a sibling module such as `reservation-document-actions.ts`
   - keep `createReservation`, `updateReservation`, and `deleteReservation` in `actions.ts`
   - keep current consumer imports stable by re-exporting document actions from `actions.ts` if that is the lowest-churn option
   - no behavior change is introduced by the split itself

2. `src/app/(app)/trips/[tripId]/reservations/actions.ts` - `createReservation(tripId, input)` rejects dateless trips before `db.transaction(...)` begins:
   - After `requireUser()` + `assertTripAccess(tripId, user.id!, "editor")`, load the trip's current `startDate`/`endDate`
   - If `trip.startDate` is unset, throw `Error("Set trip dates before adding a reservation.")`
   - In this path, no `reservations` row, no `days` row, and no `extendTripDateRange(...)` call occur

3. Dated-trip behavior is unchanged:
   - `createReservation(...)` still accepts dated trips, still opens the existing transaction, still calls `extendTripDateRange(...)` when needed, and still revalidates `/trips/${tripId}`

4. `src/components/packt/reservations-tab.tsx` gains a dateless empty-state branch:
   - Add `isDateless: boolean` and `onOpenEditDates: () => void` to `ReservationsTabProps`
   - When `isDateless === true`, render an `Empty` composition with copy:
     - title: `Set trip dates to add reservations`
     - description: explain that reservations need trip dates before they can be added
     - primary button: `Set trip dates`
   - This branch replaces current "No reservations yet" + `ReservationTypePicker` branch only for dateless trips
   - Because dateless trips cannot have existing reservations after this fix, no accordion sections or add-reservation picker should render in this branch
   - If `action=add-reservation` is present in the URL on a dateless trip, the prompt branch still wins; do not surface or auto-open the picker after dates are saved

5. Prompt button opens existing trip edit sheet:
   - `ReservationsTab` button calls new `onOpenEditDates`
   - `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` passes its existing `onOpenEditDates` prop through to `ReservationsTab`
   - No new modal state, router state, or global store is introduced

6. Saving dates from this prompt reuses current trip-date flow unchanged:
   - `src/app/(app)/trips/actions.ts` `updateTripMetadata(...)` dateless -> dated handling remains source of truth
   - No new day-creation logic is added in Reservations code
   - Existing `TripEditSheet` remains unchanged

7. Intentionally unchanged behavior:
   - `extendTripDateRange(...)` in `reservations/actions.ts` is not modified
   - `addDay(...)` and `removeLastDay(...)` in `src/app/(app)/trips/[tripId]/actions.ts` are not modified
   - Itinerary CTA behavior is not special-cased for dateless trips; it still navigates to Reservations, and Reservations decides what to render

8. Unit/component coverage:
   - `src/app/(app)/trips/[tripId]/reservations/actions.test.ts` covers dateless-trip rejection and confirms dated-trip behavior still succeeds
   - `src/components/packt/reservations-tab.test.tsx` covers dateless prompt rendering, `onOpenEditDates` callback, and preserves current dated-trip empty state + populated-section behavior

9. E2E coverage:
   - `tests/e2e/features/reservations.feature` gains one dateless-trip scenario:
     - Itinerary CTA still navigates to Reservations on a dateless trip
     - Reservations tab shows the set-dates prompt instead of "No reservations yet" / `Add Reservation`
     - tapping `Set trip dates` opens `TripEditSheet`
     - setting trip dates through real edit-sheet flow returns the tab to normal empty-state behavior where `Add Reservation` is available
   - Reuse existing dateless-trip Object Mother (`datelessTrip`) and existing day-planning step phrases where possible instead of creating duplicate step logic

## Tasks / Subtasks

- [ ] **Task 0: Split oversized reservations action file** (AC: 1)
  - [ ] Extract date-range helper logic from `actions.ts` into a sibling helper module
  - [ ] Extract reservation-document actions into a sibling module
  - [ ] Keep `actions.ts` focused on reservation CRUD and small enough to be maintainable
  - [ ] Preserve current import surface with re-exports if that avoids touching component call sites

- [ ] **Task 1: Add server-side dateless-trip guard to `createReservation`** (AC: 2, 3)
  - [ ] Load trip `startDate`/`endDate` before opening reservation transaction
  - [ ] Throw `Error("Set trip dates before adding a reservation.")` when `startDate` is missing
  - [ ] Leave validation for type/provider/endAt untouched for dated trips
  - [ ] Do not modify `extendTripDateRange(...)`

- [ ] **Task 2: Add dateless Reservations empty state and prop wiring** (AC: 4, 5, 7)
  - [ ] Extend `ReservationsTabProps` with `isDateless` and `onOpenEditDates`
  - [ ] Add dateless prompt branch ahead of current zero-reservations picker branch
  - [ ] Pass `onOpenEditDates` from `TripDetailTabBody` into `ReservationsTab`
  - [ ] Keep itinerary CTA and reservations deep-link behavior unchanged

- [ ] **Task 3: Update unit/component tests** (AC: 8)
  - [ ] Extend `src/app/(app)/trips/[tripId]/reservations/actions.test.ts`
  - [ ] Extend `src/components/packt/reservations-tab.test.tsx`

- [ ] **Task 4: Add dateless-trip E2E scenario** (AC: 9)
  - [ ] Extend `tests/e2e/features/reservations.feature`
  - [ ] Extend `tests/e2e/steps/reservations.steps.ts` only for new reservations-specific assertions
  - [ ] Reuse existing generic date-edit steps from `tests/e2e/steps/day-planning.steps.ts` where phrases already exist

## Dev Notes

### Scope boundary

This story fixes one concrete bug: Reservations must not be creatable on dateless trips.

Explicitly out of scope:
- Any changes to `extendTripDateRange(...)`
- Any changes to `updateTripMetadata(...)`
- Any changes to itinerary CTA navigation rules
- Any cleanup from `_bmad-output/implementation-artifacts/deferred-work.md` other than the dateless-trip item this story closes

### Current state to preserve

- `createReservation(...)` currently calls `db.transaction(...)` and then reads trip dates inside that transaction before delegating to `extendTripDateRange(...)`
- `ReservationsTab` currently has only two branches: populated sections, or zero-reservations empty state with `ReservationTypePicker`
- `TripDetailTabBody` already receives `onOpenEditDates` and only passes it to `TripItineraryView`
- `page-client.tsx` already wires `onOpenEditDates={() => setEditingTrip(true)}` and already renders `TripEditSheet`; this story should reuse that exact path

### Server action guidance

`createReservation(...)` must fail before opening its transaction on dateless trips. Read the trip once up front, after access control, and short-circuit there.

Because `actions.ts` is already oversized, do the split first or in the same patchset. Preferred structure:
- `actions.ts` - `createReservation`, `updateReservation`, `deleteReservation`
- `reservation-date-range.ts` - date-span helpers and constants used by CRUD actions
- `reservation-document-actions.ts` - upload/remove/rename/promote/attach doc actions plus doc-only helpers

If import churn is unnecessary, re-export document actions from `actions.ts` so current component imports can remain unchanged while the file itself stays small.

Keep these behaviors intact for dated trips:
- validation for `ReservationType`
- trimmed provider validation
- `REQUIRES_END_AT`
- `db.transaction(...)`
- `extendTripDateRange(...)`
- `revalidatePath(`/trips/${tripId}`)`

Do not move the fix into `extendTripDateRange(...)`. Epic 4.1 intentionally removes dateless reservations as a valid state instead of teaching extension logic to repair it.

### UI guidance

Use existing `Empty` primitives already used in `reservations-tab.tsx` and `trip-docs-tab.tsx`.

Dateless branch requirements:
- visible button text: `Set trip dates`
- no `ReservationTypePicker`
- no "No reservations yet" copy
- no accordion sections

Recommended icon: `CalendarDays` or `Luggage` is acceptable, but keep existing token usage and `strokeWidth={1.5}`. This button has visible text, so no icon-only labeling work is needed.

### Existing implementation references

- `src/components/packt/reservations-tab.tsx`
  - current zero-state branch starts at the `sections.length === 0` check and renders `EmptyTitle>No reservations yet</EmptyTitle>`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`
  - already receives `onOpenEditDates`
  - currently passes it only to `TripItineraryView`
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`
  - existing dateless affordance already renders `Set trip dates` button and calls `onOpenEditDates`
- `src/app/(app)/trips/[tripId]/page-client.tsx`
  - already uses `setEditingTrip(true)` for the itinerary affordance and `TripDetailHero` edit action
- `src/app/(app)/trips/actions.ts`
  - existing dateless -> dated mapping lives in `updateTripMetadata(...)`, especially the `dateless -> dated` branch that remaps current placeholder days onto the chosen date range

### Testing guidance

#### Unit / component

`src/app/(app)/trips/[tripId]/reservations/actions.test.ts`
- add rejection case: trip with `startDate: null`, `endDate: null` throws exact message
- assert no reservation insert occurs on rejection
- assert no day insert/update occurs on rejection
- keep one existing dated-trip success case untouched to prove no regression

`src/components/packt/reservations-tab.test.tsx`
- add dateless empty-state render: title + button text + no add-reservation picker
- assert clicking `Set trip dates` calls `onOpenEditDates`
- add dateless + `action=add-reservation` case: prompt still renders and picker does not become visible/open
- keep existing dated zero-state test and populated-section ordering/toggle tests working with new required props

#### E2E

Prefer reusing existing dateless-trip support already in repo:
- Object Mother: `tests/e2e/e2e-seed-data.ts` exposes `datelessTrip`
- Existing tag setup: `tests/e2e/steps/day-planning.steps.ts` already uses `@dateless-trip`
- Existing reusable steps:
  - `When I click Set trip dates`
  - `Then the trip edit sheet is open`
  - `When I change the trip date range to {string} through {string}`
  - `When I save the trip date change`

New reservations scenario should only add steps that are genuinely reservations-specific, such as:
- asserting Reservations tab shows `Set trip dates to add reservations`
- asserting normal reservations empty state appears after saving dates

### Files to modify

- `src/app/(app)/trips/[tripId]/reservations/actions.ts`
- `src/app/(app)/trips/[tripId]/reservations/reservation-date-range.ts` (new)
- `src/app/(app)/trips/[tripId]/reservations/reservation-document-actions.ts` (new)
- `src/app/(app)/trips/[tripId]/reservations/actions.test.ts`
- `src/components/packt/reservations-tab.tsx`
- `src/components/packt/reservations-tab.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`
- `tests/e2e/features/reservations.feature`
- `tests/e2e/steps/reservations.steps.ts`

### Files to leave untouched

- `src/app/(app)/trips/actions.ts`
- `src/app/(app)/trips/[tripId]/actions.ts`
- `src/components/packt/trip-edit-sheet.tsx`
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`

### References

- [Source: _bmad-output/epics.md#Story 4.1: Require Trip Dates Before Adding a Reservation] - story ACs and explicit non-goals
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Closed by Epic 4 (pending - remove these once 4.1/4.2 ship)] - bug context for orphaned/duplicate dateless-trip day rows
- [Source: _bmad-output/project-context.md#Testing] - colocated test + E2E expectations
- [Source: src/app/(app)/trips/[tripId]/reservations/actions.ts] - current reservation create flow and `extendTripDateRange(...)`
- [Source: src/components/packt/reservations-tab.tsx] - current reservations zero-state and picker flow
- [Source: src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx] - current tab-body prop wiring
- [Source: src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx] - existing dateless itinerary affordance to mirror
- [Source: src/app/(app)/trips/[tripId]/page-client.tsx] - existing `setEditingTrip(true)` callback path
- [Source: src/app/(app)/trips/actions.ts] - current `updateTripMetadata(...)` dateless -> dated handling
- [Source: tests/e2e/e2e-seed-data.ts] - `datelessTrip` mother already available
- [Source: tests/e2e/steps/day-planning.steps.ts] - reusable edit-dates E2E steps

## Dev Agent Record

### Agent Model Used

- Codex GPT-5 via `bmad-create-story`

### Debug Log References

- None yet

### Completion Notes List

- Story prepared for implementation
- No product code changed as part of story creation

### File List

- `_bmad-output/implementation-artifacts/4-1-require-trip-dates-before-adding-a-reservation.md`
