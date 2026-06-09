---
title: "Enforce the always-one-day trip invariant for dateless itineraries"
type: "feature"
created: "2026-06-09"
status: "in-progress"
route: "one-shot"
baseline_commit: "1efda861a7129b40aef95a9119b1809c49fe656e"
---

## Intent

**Problem:** Packt currently allows trips to exist with zero day rows. That creates a broken zero-day itinerary state for dateless trips, forces the trip detail page to render an empty-state action set instead of a real itinerary, and lets the last remaining day be deleted even though the desired product model is that every trip always contains at least one day.

**Approach:** Make "a trip always has at least one day" a hard invariant across trip creation, itinerary editing, and later date assignment. New dateless trips should start with a usable dateless `Day 1`, scheduled trips should keep the current day-per-date behavior, `Add Day` should append the next ordinal day directly, and the last remaining day should never expose a delete affordance.

## Scope

### In Scope

- Creating a trip without dates initializes one persisted dateless `Day 1`.
- Creating a trip with dates preserves the current scheduled-trip behavior.
- Dateless trips render a real day card instead of the zero-day itinerary empty state.
- `Add Day` works for both scheduled and dateless trips.
- The last remaining day cannot be removed from the UI or server action path.
- Setting dates later on a dateless trip maps existing days from `Day 1` forward and appends blank days if the chosen range is longer.
- Clearing dates from an already scheduled trip preserves existing days as dateless days instead of deleting them.
- Trip-detail messaging and summary copy update to reflect the new invariant.
- Unit/component/E2E coverage updates for the new flow.

### Out of Scope

- Day reordering.
- Removing non-final days.
- Changing trip-card, desktop-list, or mobile-list day-count copy outside the trip-detail surface.
- New data model fields for "unscheduled day count" or stored derived state.

## Product Rules

### Core Invariant

- Every trip must always contain at least one `days` row.
- The product must never render a zero-day itinerary state.

### Trip Creation

- `createTrip` must insert scheduled day rows when dates are provided.
- `createTrip` must insert exactly one dateless `Day 1` when dates are omitted.
- A newly created dateless trip should still land on `/trips/:id?new=1`, which already expands `Day 1` automatically.

### Trip Detail UX

- Dateless trips render the normal itinerary stack with `Day 1` visible immediately.
- Day headers show ordinal labels only when `day.date` is null.
- The existing empty-state CTA cluster (`Add event`, `Add note`, `Add checklist`) is removed for zero-day trips because that state no longer exists.
- Keep the current last-day-only removal model: only the final day can expose a remove action, and only when more than one day exists.
- When the trip has exactly one day, the remove icon is hidden entirely.
- Add a trip-level `Set trip dates` CTA above the itinerary for dateless trips. Reuse the existing trip edit sheet rather than inventing a second date-entry flow.
- The `Set trip dates` CTA must open the existing `TripEditSheet`, preserving its current keyboard, Escape-dismiss, and focus-return behavior.

### Add / Remove Day Behavior

- Scheduled trip: `Add Day` appends the next calendar date, adds the next ordinal label, and advances `trip.endDate`.
- Dateless trip: `Add Day` appends the next ordinal day with `date: null` and leaves `trip.startDate` / `trip.endDate` null.
- Server-side removal of the only remaining day must be rejected even if a stale client tries to call it directly.
- Removing the final day from a multi-day dateless trip removes the last ordinal day only.
- Removing the final day from a multi-day scheduled trip keeps the current behavior of shrinking `trip.endDate` to the new last day.

### Date Assignment / Date Removal

- Setting dates on a dateless trip must assign dates from `Day 1` forward in the current day order.
- If the chosen range is longer than the existing day count, append blank day rows at the end until the day count matches the range.
- If the chosen range exactly matches the existing day count, reuse the existing rows and assign dates in place.
- If the chosen range is shorter than the existing day count, preserve the earliest authored days and reuse the existing trip-date conflict/removal flow for overflow days.
- Clearing dates from a scheduled trip must preserve the existing ordered day rows and null out their `date` values instead of deleting all days.

## Current Code Constraints

### Server actions

- [`src/app/(app)/trips/create-trip-days.ts`](../../../src/app/(app)/trips/create-trip-days.ts) currently returns `[]` when `startDate` is missing, so dateless trip creation never inserts a day row.
- [`src/app/(app)/trips/actions.ts`](../../../src/app/(app)/trips/actions.ts) currently inserts day rows only when `buildDayRows(...)` returns scheduled rows, and `updateTripMetadata(...)` throws if any existing day lacks a date.
- [`src/app/(app)/trips/[tripId]/actions.ts`](../../../src/app/(app)/trips/[tripId]/actions.ts) currently treats `addDay` as scheduled-only and allows `removeLastDay` to delete the last remaining day, clearing trip dates and leaving zero rows.

### UI

- [`src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`](../../../src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx) currently renders a zero-day empty state and always wires removal for the final day, including the only day.
- [`src/app/(app)/trips/[tripId]/trip-detail-hero.tsx`](../../../src/app/(app)/trips/[tripId]/trip-detail-hero.tsx) currently shows `0 days` for unscheduled trips because it derives the count from trip dates only.
- [`src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`](../../../src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx) is already 246 lines, so any meaningful UI growth should be offset by a small extraction rather than pushing the file over the project’s size limit.

### E2E fixtures

- [`tests/e2e/e2e-seed-data.ts`](../../../tests/e2e/e2e-seed-data.ts) defines `DATELESS_TRIP_MOTHER` and `EMPTY_ITINERARY_TRIP_MOTHER` with `days: []`, which bakes the zero-day state into E2E setup.

## Implementation Plan

1. Update trip creation to always persist at least one day.
   - Adjust the trip-creation path so dateless trips insert a single row with `dayNumber: 1`, `label: "Day 1"`, and `date: null`.
   - Preserve the current scheduled-day generation path for dated trips.

2. Refactor trip-date updates around day-order-first behavior.
   - Remove the blanket rejection for existing days with null dates.
   - Support three cases in `updateTripMetadata(...)`:
     - scheduled -> scheduled range changes,
     - dateless -> scheduled,
     - scheduled -> dateless.
   - Keep day identity/order anchored from `Day 1` forward.
   - Reuse the existing confirmation/removal logic when a shorter target range would drop authored days.

3. Extend itinerary day mutations to support dateless trips and enforce the invariant server-side.
   - Update `addDay(tripId)` so it appends either a dated or dateless day based on the trip’s current scheduling state.
   - Update `removeLastDay(tripId)` so it rejects attempts to remove the only remaining day.
   - Preserve current last-day removal behavior for multi-day trips.

4. Replace the zero-day itinerary UI with a real first-day experience.
   - Remove the zero-day empty-state branch from `TripItineraryView`.
   - Keep rendering the itinerary stack even for unscheduled trips with one dateless day.
   - If the extra `Set trip dates` CTA and conditional controls push `TripItineraryView` past the line budget, extract the top-of-itinerary actions into a small helper component in the same route folder with an explicit `Props` interface rather than creating a broad shared abstraction.

5. Add the trip-level `Set trip dates` entry point.
   - Surface a clear `Set trip dates` button above the itinerary when the trip is currently dateless.
   - Reuse the existing `TripEditSheet` open path instead of adding a separate date dialog.
   - Preserve the existing sheet’s keyboard/focus behavior; this story should not introduce a second modal or custom focus-management path.
   - Keep this as local prop wiring through `page-client.tsx` and `trip-detail-tab-body.tsx`; do not introduce context for a single consumer path.

6. Update detail-surface summary copy to match the invariant.
   - The trip-detail hero should report actual itinerary day count on unscheduled trips instead of `0 days`.
   - Keep the unscheduled badge/date-line behavior intact; only the day-count number changes.

7. Update scenario fixtures and E2E flows.
   - Convert the dateless and empty-itinerary mothers to the new one-day invariant.
   - Rewrite the create-trip and day-planning scenarios that currently assert the zero-day empty state.
   - Replace the "remove the only day and become unscheduled" scenario with assertions that the remove affordance is absent when only one day exists.

## Acceptance Criteria

1. Creating a trip without dates persists exactly one day labeled `Day 1`.
2. A newly created dateless trip opens on the trip detail page with `Day 1` available for immediate itinerary editing.
3. Creating a trip with dates preserves the current scheduled initialization behavior.
4. The trip detail itinerary never renders the zero-day empty state.
5. In a dateless trip, `Add Day` appends `Day 2`, `Day 3`, and so on without prompting for dates.
6. In a scheduled trip, `Add Day` preserves the current append-and-extend-date behavior.
7. When only one day remains in a trip, no remove-day icon is rendered for that day.
8. A direct server call cannot remove the only remaining day.
9. In a multi-day dateless trip, removing the final day removes only that last day and preserves the remaining days.
10. A dateless trip exposes a trip-level `Set trip dates` CTA.
11. Setting dates on a dateless trip assigns dates across existing days from `Day 1` forward in order.
12. If the selected date range is longer than the existing day count, blank days are appended at the end.
13. Clearing dates from a scheduled trip preserves existing day rows as dateless days rather than deleting the itinerary.
14. The trip-detail hero no longer shows `0 days` for an unscheduled trip that still contains day rows.

## Test Plan

### Unit / component updates

- Update [`src/app/(app)/trips/actions.test.ts`](../../../src/app/(app)/trips/actions.test.ts)
  - dateless `createTrip` inserts a single `Day 1`
  - `updateTripMetadata` handles dateless -> scheduled mapping
  - `updateTripMetadata` handles scheduled -> dateless conversion without deleting all rows
  - shorter target ranges still route through the existing confirmation logic when authored days overflow

- Update [`src/app/(app)/trips/[tripId]/actions.test.ts`](../../../src/app/(app)/trips/[tripId]/actions.test.ts)
  - `addDay` appends a dateless day when the trip is unscheduled
  - `removeLastDay` rejects removal of the only remaining day
  - `removeLastDay` still removes the final day correctly for multi-day dateless and scheduled trips

- Update [`src/app/(app)/trips/[tripId]/trip-itinerary-view.test.tsx`](../../../src/app/(app)/trips/[tripId]/trip-itinerary-view.test.tsx)
  - dateless one-day itinerary renders a day card, not the empty state
  - no remove control is wired for a single remaining day
  - `Set trip dates` CTA appears only for dateless trips

- Update [`src/app/(app)/trips/[tripId]/page-client.test.tsx`](../../../src/app/(app)/trips/[tripId]/page-client.test.tsx)
  - unscheduled trips with one day show the corrected hero day count

- Update [`src/components/packt/day-card-header.test.tsx`](../../../src/components/packt/day-card-header.test.tsx) only if the header API changes; otherwise keep the hide/show assertion at the `TripItineraryView` level.

### E2E updates

- Update [`tests/e2e/features/create-trip.feature`](../../../tests/e2e/features/create-trip.feature)
  - dateless trip creation lands on a trip page with `Day 1` expanded instead of the empty itinerary state

- Update [`tests/e2e/features/day-planning.feature`](../../../tests/e2e/features/day-planning.feature)
  - replace the zero-day empty-state scenario with a dateless one-day scenario
  - replace the "confirm removal of the only day" scenario with "remove control is absent when one day remains"
  - add coverage for adding a second day to a dateless trip
  - add coverage for setting trip dates on a dateless trip

- Update [`tests/e2e/steps/create-trip.steps.ts`](../../../tests/e2e/steps/create-trip.steps.ts) and [`tests/e2e/steps/day-planning.steps.ts`](../../../tests/e2e/steps/day-planning.steps.ts) to match the revised assertions and fixture behavior.

- Update [`tests/e2e/e2e-seed-data.ts`](../../../tests/e2e/e2e-seed-data.ts) so `DATELESS_TRIP_MOTHER` and any replacement for `EMPTY_ITINERARY_TRIP_MOTHER` satisfy the one-day invariant.

## Suggested Review Order

1. [`src/app/(app)/trips/actions.ts`](../../../src/app/(app)/trips/actions.ts)
2. [`src/app/(app)/trips/[tripId]/actions.ts`](../../../src/app/(app)/trips/[tripId]/actions.ts)
3. [`src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`](../../../src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx)
4. [`src/app/(app)/trips/[tripId]/trip-detail-hero.tsx`](../../../src/app/(app)/trips/[tripId]/trip-detail-hero.tsx)
5. Unit/component tests
6. E2E features, steps, and fixture mothers

## Notes For Dev

- Do not introduce a new temporary "planning container" type. A dateless day is still a day.
- Do not store any derived "scheduled vs unscheduled day count" field; derive from the existing trip + day data at render time.
- Keep all new domain typing in [`src/data/types.ts`](../../../src/data/types.ts) if any type additions are required.
- Preserve the current trip-detail edit sheet and date conflict UI rather than forking new date-management components.
