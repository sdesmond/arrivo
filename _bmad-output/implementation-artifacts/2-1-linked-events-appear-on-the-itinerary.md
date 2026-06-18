---
baseline_commit: cb77a2b
---

# Story 2.1 — Linked Events Appear on the Itinerary

**Status:** review
**Epic:** 2 — Reservations Sync to the Itinerary
**Branch:** feature/2-1-linked-events-appear-on-the-itinerary

---

## User Story

As a trip planner, I want my Reservations to automatically appear as events on the Itinerary, so that I don't have to manually re-create check-in/check-out, pickup/return, or departure/arrival events for things I've already booked.

---

## Acceptance Criteria

### AC1 — `deriveLinkedEvents()`: single-anchor Reservations produce one TripEvent

**Given** a Reservation with only `startTime` set (Flight, Train, Bus, Ferry, or Other with no `endTime`)
**When** `deriveLinkedEvents()` runs
**Then** it produces exactly one synthetic `TripEvent` labeled per the Glossary (e.g. "Departure" for Flight/Train/Bus/Ferry, "Start" for Other), with `linkedReservationId` set to the Reservation's `id` and `reservationType` set to its type

### AC2 — `deriveLinkedEvents()`: dual-anchor Reservations produce two TripEvents

**Given** a Reservation with both `startTime` and `endTime` set (Lodging, Rental Car, Cruise, or any optional-`endTime` type that has one)
**When** `deriveLinkedEvents()` runs
**Then** it produces exactly two synthetic `TripEvent`s, one per anchor (Check-in/Check-out for Lodging, Pickup/Return for Rental Car, Departure/Return for Cruise, Start/End for Other), each on its corresponding day

### AC3 — Module exports exactly one function with correct signature

**Given** `src/lib/linked-events.ts`
**When** implemented
**Then** it exports exactly one function, `deriveLinkedEvents(reservations: Reservation[]): TripEvent[]`, with no alternate or additional exported names

### AC4 — `TripEvent` gains exactly two new optional fields

**Given** `TripEvent` in `src/data/types.ts`
**When** extended for this feature
**Then** it gains exactly `linkedReservationId?: string` and `reservationType?: ReservationType` — no other marker fields

### AC5 — Query layer merges Linked Events into DayItinerary

**Given** `src/lib/queries.ts` builds a trip's `DayItinerary[]`
**When** it runs
**Then** it merges `deriveLinkedEvents()` output into each `DayItinerary.events` array, interleaved with real events and sorted by `startAt`, without writing any new `events` rows to the database

### AC6 — Linked Event row renders with icon swap and "Linked" badge

**Given** a Day's itinerary contains a Linked Event
**When** `day-card-body.tsx` renders it
**Then** the row uses the same padding/border/time-column layout as a manual event row, but the Reservation Type's icon (per UX-DR1 mapping: `Plane`/`Train`/`Bus`/`Ship`/`Car`/`Hotel`/`Anchor`/`Package`, `strokeWidth={1.5}`) replaces the default `MapPin` icon (`aria-hidden="true"`), and a "Linked" `Badge` `muted`/`secondary` pill (text `aria-hidden="true"`) appears inline after the event name

### AC7 — Linked Event row accessible name

**Given** a Linked Event row
**When** inspected by assistive tech
**Then** the entire row is one `<button>`/link with a single constructed `aria-label` (e.g. "Check-in: Tue, Jun 16 · 3:00 PM — Hotel Avenida Palace, Linked, opens Reservations"), with all visual children (icon, "Linked" badge text, chevron) marked `aria-hidden="true"`, so "Linked" is announced exactly once

### AC8 — "Happening now" + Linked co-occurrence uses standard Now treatment

**Given** a Linked Event is the chronologically current event for "happening now" purposes
**When** rendered
**Then** it uses the standard `var(--accent-soft)`/"Now" pill treatment identical to a manual event's "happening now" state — no left border, no row background tint, and no new color token (per UX-DR6, the `--linked-brand`/`--linked-soft`/`--linked-ink` violet triple remains rejected)

### AC9 — `onLinkedEventTap` callback prop (placeholder for Story 2.4)

**Given** `day-card-body.tsx` and `day-card-dnd.tsx`
**When** implemented for this story
**Then** they accept an `onLinkedEventTap(linkedReservationId: string)` callback prop, invoked when a Linked Event row is tapped; this story wires it as a placeholder/no-op (real navigation to the Reservations tab is implemented in Story 2.4)

---

## Technical Tasks

Complete in order to avoid cascading compile errors.

### Task 1 — Add `linkedReservationId` and `reservationType` to `TripEvent`

**File:** `src/data/types.ts`

Add two new optional fields to the `TripEvent` interface (after the `position` field and before `createdAt`):

```ts
linkedReservationId?: string;
reservationType?: ReservationType;
```

Import `ReservationType` is already available in the same file — no new import needed.

### Task 2 — Create `src/lib/linked-events.ts`

**File:** `src/lib/linked-events.ts` (NEW)
**Unit test:** `src/lib/linked-events.test.ts` (NEW)

#### What it exports

A single named function:

```ts
export function deriveLinkedEvents(reservations: Reservation[]): TripEvent[];
```

No other exported names. Accepts an array of `Reservation` domain types, returns synthetic `TripEvent[]`.

#### Anchor label mapping (per Glossary)

| Reservation Type | Start anchor label | End anchor label | endTime required? |
|-----------------|-------------------|------------------|-------------------|
| `flight`        | "Departure"       | "Arrival"        | No |
| `train`         | "Departure"       | "Arrival"        | No |
| `bus`           | "Departure"       | "Arrival"        | No |
| `ferry`         | "Departure"       | "Arrival"        | No |
| `rental-car`    | "Pickup"          | "Return"         | Yes |
| `lodging`       | "Check-in"        | "Check-out"      | Yes |
| `cruise`        | "Departure"       | "Return"         | Yes |
| `other`         | "Start"           | "End"            | No |

#### Logic

```
for each reservation in reservations:
  if reservation.startAt is set:
    create synthetic TripEvent for start anchor:
      id = `linked-${reservation.id}-start`
      tripId = reservation.tripId
      name = "{anchor label} — {reservation.provider}"
      startAt = reservation.startAt
      linkedReservationId = reservation.id
      reservationType = reservation.type
      position = reservation.startAt epoch milliseconds (ensures correct sort order)

  if reservation.endAt is set:
    create synthetic TripEvent for end anchor:
      id = `linked-${reservation.id}-end`
      tripId = reservation.tripId
      name = "{anchor label} — {reservation.provider}"
      startAt = reservation.endAt
      linkedReservationId = reservation.id
      reservationType = reservation.type
      position = reservation.endAt epoch milliseconds

return all synthetic TripEvents in one flat array
```

**Sorting note:** The `position` field uses epoch milliseconds of the event's `startAt` so that when the query layer merges these into `DayItinerary.events` and sorts by `position`, linked events interleave correctly with real events (which also use epoch-ms `position` from the DB). This ensures correct chronological ordering without a separate sort pass.

**Edge cases:**
- `startAt` is `undefined` → skip the start anchor (shouldn't happen in practice since `startAt` is required by the DB schema, but guard defensively)
- `endAt` is `undefined` → skip the end anchor (valid for Flight/Train/Bus/Ferry/Other without `endTime`)
- Reservation `provider` is empty string → use `""` as the event name suffix (defensive)

#### Unit tests (`linked-events.test.ts`)

All inside `describe("deriveLinkedEvents")`:

1. `"returns empty array for empty reservations input"`
2. `"produces one TripEvent for single-anchor Flight (no endTime)"` — assert `name === "Departure — TAP Air Portugal"`, `linkedReservationId === expected`, `reservationType === "flight"`, only 1 event returned
3. `"produces two TripEvents for dual-anchor Lodging"` — assert 2 events, names "Check-in — Torel Avantgarde" and "Check-out — Torel Avantgarde", both carrying correct `linkedReservationId`/`reservationType`
4. `"produces two TripEvents for Rental Car (Pickup/Return)"` — assert labels
5. `"produces two TripEvents for Cruise (Departure/Return)"` — assert labels
6. `"produces one TripEvent for Train with no endTime"` — start-only
7. `"produces one TripEvent for Bus with no endTime"` — start-only
8. `"produces one TripEvent for Ferry with no endTime"` — start-only
9. `"produces one TripEvent for Other with no endTime (Start label)"` — assert `name === "Start — Some Booking"`, single event
10. `"produces two TripEvents for Other with endTime (Start/End labels)"` — assert both anchors use generic Start/End
11. `"sets position to epoch ms of startAt for correct chronological sorting"`
12. `"handles missing startAt defensively (skips start anchor)"` — `startAt: undefined`
13. `"handles empty provider string"` — event name has empty suffix
14. `"produces correct events for mixed input array"` — two reservations of different types

### Task 3 — Extend `TripEvent` type with marker fields and update Now Card types

**Already handled in Task 1** — no additional changes to types.ts for `now-card.tsx` since it already consumes `TripEvent[]` from `todayEvents`.

### Task 4 — Merge Linked Events into the query layer

**File:** `src/lib/queries.ts`
**Note:** Excluded from coverage. No test changes required for this file.

#### Changes to `getTripDetail()`

1. Import `deriveLinkedEvents` from `@/lib/linked-events` at the top of the file
2. After the existing `tripReservations` query (line 246) and the `docsByReservationId` map (lines 248–259), add:

```ts
const reservationsDomain = tripReservations.map((row) => ({
  ...dbReservationToType(row),
  documents: (docsByReservationId.get(row.id) ?? []).map(dbDocToType),
}));

const linkedEvents = deriveLinkedEvents(reservationsDomain);
```

3. In the days mapping (lines 353–373), add Linked Events to the day's events array BEFORE the existing real events, then sort by `position`:

```ts
events: [
  ...(linkedEvents
    .filter((le) => le.startAt && le.startAt!.startsWith(day.date ?? ""))
    .map((le) => ({ ...le, position: new Date(le.startAt!).getTime() }))
  ),
  ...(eventsByDay.get(day.id) ?? []).map((event) => ({
    ...dbEventToType(event),
    docs: (docsByEventId.get(event.id) ?? []).map(dbDocToType),
  })),
].sort((first, second) => first.position - second.position),
```

**Important:** The date matching uses `startAt.startsWith(day.date)` to assign linked events to the correct day. `day.date` is an ISO date string (`"YYYY-MM-DD"`), and `startAt` is an ISO datetime string (`"YYYY-MM-DDTHH:mm:ssZ"`), so a prefix match works. This is simpler and more reliable than day-number arithmetic.

4. Update the `reservations` field in the return object to use `reservationsDomain` (already built above):

```ts
reservations: reservationsDomain,
```

5. For the Now Card (`trip-detail-tab-body.tsx`, which calls `getTripDetail()`), the `TripDetailPayload.reservations` already includes linked events merged into `DayItinerary.events`. The Now Card reads `todayEvents` from `TripListEntry`, which is built by `listTripsForUser()` — that function is **unaffected** by this story (Now Card changes deferred to Story 2.3). This story only merges into `DayItinerary[]` inside `getTripDetail()`.

### Task 5 — Create `LinkedEventBadge` component

**File:** `src/components/packt/linked-event-badge.tsx` (NEW)
**Test file:** `src/components/packt/linked-event-badge.test.tsx` (NEW)

A simple presentational component — the neutral "Linked" badge pill.

```tsx
"use client";

import { Badge } from "@/components/ui/badge";

export function LinkedEventBadge(): ReactElement {
  return (
    <Badge variant="secondary" aria-hidden="true" style={{ height: 18, padding: "0 7px", borderRadius: 9999, fontSize: 10, fontWeight: 500 }}>
      Linked
    </Badge>
  );
}
```

**Design notes:**
- Uses the existing `Badge` component with `variant="secondary"` (equivalent to `muted` — renders `background: var(--surface-2)`, `color: var(--fg-2)`, ~8.4:1 contrast)
- `aria-hidden="true"` because "Linked" is exposed via the row's `aria-label` (see Task 6)
- Height 18px, pill shape, 10px text weight 500 — per UX-DR5/DESIGN.md `linked-event-badge` spec
- No new badge variant required

#### Unit tests (`linked-event-badge.test.tsx`)

1. `"renders the text 'Linked'"` — assert `getByText("Linked")`
2. `"renders with aria-hidden attribute"` — assert `aria-hidden="true"`
3. `"uses the Badge component"` — verify it imports/renders Badge (or assert class names match Badge secondary styling)

### Task 6 — Update `PlaceRow` for Linked Event rendering

**File:** `src/components/packt/place-row.tsx`
**Test file:** `src/components/packt/place-row.test.tsx`

**This is the most critical UI change.** The existing `PlaceRow` component renders itinerary events. Linked Events are also `TripEvent` objects passing through the same rendering pipeline.

#### Changes to `place-row.tsx`

0. **Split the note editing section** (~58 lines in the current file) into a new `PlaceRowNoteEditor` component before adding any linked event code. This brings the file under the ~250-line limit and prevents the new linked event logic from compounding the size problem. Import the extracted component back into `place-row.tsx`.
1. Check if the event has `linkedReservationId` set
2. If it is a Linked Event:
   - Replace the default `MapPin` icon with the Reservation Type's lucide icon per UX-DR1 mapping (`Plane`/`Train`/`Bus`/`Ship`/`Car`/`Hotel`/`Anchor`/`Package`, `strokeWidth={1.5}`), `aria-hidden="true"`
   - Add a `LinkedEventBadge` inline after the event name text (before any action buttons), `aria-hidden="true"`
   - Construct the row as a single `<button>` with a comprehensive `aria-label`:
     `"{anchor label}: {Weekday, Month Day} · {h:mm AM/PM} — {provider}, Linked, opens Reservations"`
    - The event's meta line uses `formatAnchorDateTime` from `@/components/packt/reservation-type-badge` (already produces `"{anchor label}: {Weekday, Month Day} · {h:mm AM/PM}"`) and appends `— from {ReservationType} reservation` (e.g. "Check-in: Tue, Jun 16 · 3:00 PM — from Lodging reservation")
   - Call `onLinkedEventTap(linkedReservationId)` when the row is tapped/activated
   - Disable DnD for linked event rows (they should not be draggable — `DayCardDnd`'s `SortablePlaceRow` wrapping should be bypassed for linked events)

3. If the event does NOT have `linkedReservationId` (manual event): no changes to existing rendering

4. Add `onLinkedEventTap?: (linkedReservationId: string) => void` to `PlaceRowProps`

#### How to handle the DnD exclusion

Linked Events should NOT be sortable. In `day-card-dnd.tsx` (around line 179–188), the `SortablePlaceRow` is rendered for every event. Update the check:

```tsx
) : entry.item.kind === "event" ? (
  entry.item.data.linkedReservationId ? (
    // Render PlaceRow directly (non-sortable, wrapped in a button for tap handling)
    <PlaceRow
      place={entry.item.data}
      dayDate={dayDate}
      isLast={isLast}
      onUpdate={onUpdateEvent}
      onDelete={onDeleteEvent}
      tripDocs={tripDocs}
      onLinkedEventTap={onLinkedEventTap}
    />
  ) : (
    <SortablePlaceRow
      id={`event-${entry.item.data.id}`}
      place={entry.item.data}
      dayDate={dayDate}
      isLast={isLast}
      onUpdate={onUpdateEvent}
      onDelete={onDeleteEvent}
      tripDocs={tripDocs}
    />
  )
```

### Task 7 — Add `onLinkedEventTap` callback through `DayCardDnd` and `DayCardBody`

**File:** `src/components/packt/day-card-dnd.tsx`
**File:** `src/components/packt/day-card-body.tsx`

#### `day-card-dnd.tsx`

1. Add `onLinkedEventTap?: (linkedReservationId: string) => void` to `DayCardDndProps`
2. Pass it through to the non-sortable `PlaceRow` rendering for linked events (see Task 6 above)

#### `day-card-body.tsx`

1. Add `onLinkedEventTap?: (linkedReservationId: string) => void` to `DayCardBodyProps`
2. Pass it through to `DayCardDnd`
3. For this story, wire it as a no-op placeholder:
   ```tsx
   onLinkedEventTap={onLinkedEventTap ?? (() => {})}
   ```

### Task 8 — Wire `onLinkedEventTap` through `trip-itinerary-view.tsx`

**File:** `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`

Add the `onLinkedEventTap` prop as a no-op placeholder for this story. Pass it to `DayCard` → `DayCardBody`. In Story 2.4 this becomes a real navigation handler.

---

## Dev Notes

### Architecture constraints

- **Marker fields contract (non-negotiable):** `linkedReservationId` and `reservationType` are the ONLY two marker fields on `TripEvent`. Do not introduce `isLinked`, `reservationId`, or any alternate names. These two fields are the sole contract between `linked-events.ts`, the query-layer merge in `queries.ts`, and every rendering component.
- **No DB writes for Linked Events:** `deriveLinkedEvents()` is a pure function. No `events` rows are ever created, updated, or deleted for Linked Events. They exist only as computed in-memory shapes.
- **Anchor label mapping** already exists in `src/components/packt/reservation-type-badge.tsx` as `ANCHOR_LABELS` and `RESERVATION_TYPE_META`. Import from there rather than duplicating. The `deriveLinkedEvents()` function uses `ANCHOR_LABELS[type].start`/`.end` directly; no `endRequired` field is needed — check `reservation.endAt !== undefined` in the loop.
- **The `position` field** on synthetic Linked Events uses epoch milliseconds (matching how real events store their position). This ensures correct interleaving when merging into `DayItinerary.events` — the existing sort by `position` works naturally.
- **No new color tokens** — `--linked-brand`/`--linked-soft`/`--linked-ink` were proposed and rejected. Do not add them. The "Linked" indicator uses only (1) the Reservation Type icon swap and (2) the neutral `Badge secondary` variant.
- **No left-border accent or tinted row background** for Linked Events — per UX-DR6/DESIGN.md Do's and Don'ts.
- **`NEXT_PUBLIC_` env vars**: none needed for this feature.

### Key files and their current state

| File | State today | What this story changes |
|------|------------|------------------------|
| `src/data/types.ts` | `TripEvent` has no `linkedReservationId`/`reservationType` | Add both as optional fields |
| `src/lib/linked-events.ts` | Does not exist | NEW — `deriveLinkedEvents(reservations: Reservation[]): TripEvent[]` |
| `src/lib/linked-events.test.ts` | Does not exist | NEW — ~14 unit tests |
| `src/lib/queries.ts` | `getTripDetail()` doesn't merge Linked Events | Import `deriveLinkedEvents`, merge into each `DayItinerary.events` sorted by position |
| `src/components/packt/linked-event-badge.tsx` | Does not exist | NEW — "Linked" badge pill component |
| `src/components/packt/linked-event-badge.test.tsx` | Does not exist | NEW — 3 unit tests |
| `src/components/packt/place-row.tsx` | Renders normal event rows with `MapPin` icon | Add Linked Event detection: icon swap + badge + single-button `aria-label` rendering; add `onLinkedEventTap` prop |
| `src/components/packt/place-row.test.tsx` | Tests for manual events | Add test cases for Linked Event rendering |
| `src/components/packt/day-card-dnd.tsx` | All events wrapped in `SortablePlaceRow` | Add `onLinkedEventTap` prop; render non-sortable `PlaceRow` for linked events |
| `src/components/packt/day-card-body.tsx` | No linked event awareness | Add `onLinkedEventTap` prop; pass through to `DayCardDnd` |
| `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` | No `onLinkedEventTap` plumbing | Add placeholder no-op handler |

### Anchor label resolution strategy

Import `ANCHOR_LABELS` from `@/components/packt/reservation-type-badge` in `linked-events.ts`. The mapping is already defined there and is the single source of truth for `ReservationType → { start, end }` labels:

```ts
import { ANCHOR_LABELS } from "@/components/packt/reservation-type-badge";
```

In the derivation loop, use `ANCHOR_LABELS[reservation.type].start` for the start anchor and `ANCHOR_LABELS[reservation.type].end` for the end anchor. Guard end-anchor creation with `if (reservation.endAt)` — no `endRequired` metadata needed.

### Date matching strategy

Linked Events are merged into days by matching `startAt` date prefix against `day.date`. Since:
- `day.date` = `"YYYY-MM-DD"` (ISO date)
- `startAt` = `"YYYY-MM-DDTHH:mm:ssZ"` (ISO datetime)

A `.startsWith()` comparison works reliably without date-fns or timezone math:
```ts
linkedEvents.filter((le) => le.startAt?.startsWith(day.date ?? ""))
```

### The `SortablePlaceRow` exclusion

Linked Events must NOT be draggable/sortable — they are computed views of Reservation data, not independent itinerary events with a `position` to reorder. In `day-card-dnd.tsx`, detect linked events by checking `entry.item.data.linkedReservationId` and render a non-sortable `PlaceRow` instead of wrapping in `SortablePlaceRow`. The `SortablePlaceRow` already wraps `PlaceRow` for the DnD context, so this is a clean fork.

### Icon mapping

The icon mapping already exists in `src/components/packt/reservation-type-badge.tsx` as `RESERVATION_TYPE_META`. `PlaceRow` should import from there:

```ts
import { RESERVATION_TYPE_META } from "@/components/packt/reservation-type-badge";
```

Then use the icon directly:
```tsx
const Icon = RESERVATION_TYPE_META[event.reservationType!].icon;
<Icon size={16} strokeWidth={1.5} aria-hidden="true" />
```

This is the single source of truth — no new helper needed.

### `document.reservationId` not used in this story

No changes to documents, document mappers, or document queries in this story. Those belong to Epic 1 (Story 1.5).

### Accidental complexity with DnD

The `day-card-dnd.tsx` DnD setup creates complexity for linked events. Keep the change minimal:
- Only the `${entry.item.kind === "event"}` branch needs a `linkedReservationId` check
- The `SortableContext items` array should exclude linked event IDs (otherwise DnD will fail silently since sortable placeholders won't find their matching element)
- To exclude linked events from `SortableContext`, filter the `items` prop:
  ```tsx
  <SortableContext items={timelineItems.filter(item => !(item.kind === "event" && item.data.linkedReservationId)).map((item) => item.data.id)} strategy={verticalListSortingStrategy}>
  ```

### Testing: PlaceRow test considerations

The `place-row.test.tsx` currently tests manual events only. Add a fixture:

```ts
const linkedEvent: TripEvent = {
  id: "linked-1",
  name: "Check-in — Torel Avantgarde",
  startAt: "2030-06-16T15:00:00Z",
  position: 1718550000000,
  linkedReservationId: "res-1",
  reservationType: "lodging",
};
```

New test cases:
- `"renders Linked Event with Hotel icon instead of MapPin"`
- `"renders Linked Event with 'Linked' badge after event name"`
- `"renders Linked Event with correct aria-label"`
- `"renders Linked Event meta line with anchor label and reservation type"`
- `"calls onLinkedEventTap when Linked Event row is activated"`
- `"renders manual event normally without linked event indicators"`

### Test: `day-card-body` / `day-card-dnd` test considerations

- `day-card-dnd` test: verify linked events render as non-sortable `PlaceRow` (not wrapped in `SortablePlaceRow`)
- `day-card-body` test: verify `onLinkedEventTap` callback is passed through to `DayCardDnd`

### E2E

**File (NEW):** `tests/e2e/features/linked-events.feature`

```gherkin
Feature: Linked Events
  Reservations automatically appear as Linked Events on the Itinerary.

  Scenario: Lodging reservation shows Check-in and Check-out on the Itinerary
    Given the trip has a Lodging reservation with Check-in on Day 1 and Check-out on Day 2
    When I view the Itinerary tab
    Then I see a "Check-in" Linked Event on Day 1 with a Hotel icon and a "Linked" badge
    And I see a "Check-out" Linked Event on Day 2 with a Hotel icon and a "Linked" badge
```

**File (NEW):** `tests/e2e/steps/linked-events.steps.ts`

Step definitions using the Reservation Object Mother (from Epic 1):

```ts
Given("the trip has a Lodging reservation with Check-in on Day 1 and Check-out on Day 2", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        reservations: [
          {
            type: "lodging",
            provider: "Torel Avantgarde",
            startAt: "2030-01-10T15:00:00Z",
            endAt: "2030-01-12T11:00:00Z",
          },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.gotoCurrentTrip(page);
});
```

**E2E seed fixture note:** The Reservation Object Mother already exists in `tests/e2e/e2e-seed-data.ts` and `tests/e2e/scenario-fixture.ts` from Epic 1. No changes needed to those files for this story.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/linked-events.ts` | Pure derivation module: `deriveLinkedEvents()` |
| `src/lib/linked-events.test.ts` | Unit tests for derivation (14 test cases) |
| `src/components/packt/linked-event-badge.tsx` | "Linked" badge pill component |
| `src/components/packt/linked-event-badge.test.tsx` | Unit tests for badge |
| `tests/e2e/features/linked-events.feature` | E2E feature for linked events |
| `tests/e2e/steps/linked-events.steps.ts` | Step definitions for linked events feature |

## Files to Modify

| File | Change summary |
|------|---------------|
| `src/data/types.ts` | Add `linkedReservationId?: string` and `reservationType?: ReservationType` to `TripEvent` |
| `src/lib/queries.ts` | Import `deriveLinkedEvents`, merge linked events into `DayItinerary.events` |
| `src/components/packt/place-row.tsx` | Add `onLinkedEventTap` prop; render Linked Events with icon swap + badge + `aria-label` |
| `src/components/packt/place-row.test.tsx` | Add Linked Event rendering tests |
| `src/components/packt/day-card-dnd.tsx` | Add `onLinkedEventTap` prop; exclude linked events from DnD sortable context; render non-sortable `PlaceRow` for linked events |
| `src/components/packt/day-card-body.tsx` | Add `onLinkedEventTap` prop; pass through to `DayCardDnd` |
| `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` | Add no-op `onLinkedEventTap` placeholder |

---

## Definition of Done

- [x] `npm run test:coverage` passes with ≥95% lines/functions, ≥90% branches
- [x] `npm run test:e2e` passes including the new linked events scenario
- [x] `npm run build` succeeds with no TypeScript errors
- [x] `npx eslint src tests --max-warnings 0` passes (no single-letter vars, no `any`, etc.)
- [x] Visual check: Linked Event row on Itinerary shows Reservation Type icon + "Linked" badge, normal row shows `MapPin` + no badge
- [x] Visual check: "happening now" Linked Event uses standard teal treatment, no violet/indigo tokens
- [x] Linked Event row is not draggable via DnD

---

## Change Log

- 2026-06-18: Added linked-event derivation, itinerary query merging, linked-event row rendering, DnD exclusion, callback plumbing, unit coverage, and linked-events E2E coverage.

## Dev Agent Record

- Implemented `deriveLinkedEvents()` with runtime-safe reservation-type normalization and reused reservation badge metadata as the single anchor-label/icon source.
- Merged synthetic linked events into `getTripDetail()` day itineraries without writing event rows, and threaded linked-event handling through `PlaceRow`, `DayCardDnd`, `DayCardBody`, `DayCard`, and `trip-itinerary-view`.
- Added unit and E2E coverage for linked-event derivation, rendering, non-sortable behavior, and itinerary visibility.
- Validation:
  `npm run lint`
  `npx tsc --noEmit`
  `npm run test:coverage`
  `npm run test:e2e`
  `npm run build`

## File List

- `src/data/types.ts`
- `src/lib/linked-events.ts`
- `src/lib/linked-events.test.ts`
- `src/lib/queries.ts`
- `src/components/packt/reservation-type-badge.tsx`
- `src/components/packt/linked-event-badge.tsx`
- `src/components/packt/linked-event-badge.test.tsx`
- `src/components/packt/place-row-note-editor.tsx`
- `src/components/packt/place-row.tsx`
- `src/components/packt/place-row.test.tsx`
- `src/components/packt/day-card-dnd.tsx`
- `src/components/packt/day-card-dnd.test.tsx`
- `src/components/packt/day-card-body.tsx`
- `src/components/packt/day-card-body.test.tsx`
- `src/components/packt/day-card.tsx`
- `src/components/packt/day-card.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`
- `tests/e2e/features/linked-events.feature`
- `tests/e2e/steps/linked-events.steps.ts`
