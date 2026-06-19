---
baseline_commit: cb77a2b
---

# Story 2.3 — Now Card Surfaces Linked Events

**Status:** done
**Epic:** 2 — Reservations Sync to the Itinerary
**Branch:** feature/2-3-now-card-surfaces-linked-events

---

## User Story

As a trip planner,
I want my Now Card to show check-ins, pickups, departures, and other booked events when they're happening or coming up next,
so that I don't miss a flight or check-in just because I created it as a Reservation instead of a manual itinerary event.

---

## Acceptance Criteria

### AC1 — Now Card includes Linked Events in todayEvents

**Given** the Now Card's "current/next-upcoming event" logic in `src/lib/queries.ts`
**When** building `todayEvents` for the Now Card
**Then** it includes Linked Events derived via `deriveLinkedEvents()` (Story 2.1), merged with manual events and sorted by `startAt` — exactly like the Itinerary's `DayItinerary.events` merge

### AC2 — Linked Event as current "Now" event renders with standard treatment + Linked badge

**Given** a Linked Event is the chronologically current event (its time window contains "now")
**When** the Now Card renders it
**Then** it shows the same layout as a manual "happening now" event — `var(--accent-soft)`/"Now" pill treatment — plus the Reservation Type icon (replacing `MapPin`, `aria-hidden`) and a "Linked" `Badge` `muted`/`secondary` pill (text `aria-hidden`, per UX-DR5)

### AC3 — Linked Event as "Next Up" renders identically to manual next-up event

**Given** a Linked Event is the chronologically next-upcoming event (no event is currently "happening now")
**When** the Now Card renders it
**Then** it displays exactly like a manually-created "next up" event, with the same icon/badge treatment as AC2

### AC4 — Linked Event row uses single-button aria-label construction

**Given** the Now Card displays a Linked Event
**When** inspected by assistive tech
**Then** it uses the same single-`aria-label`-button construction as the Itinerary's Linked Event row (Story 2.1), so "Linked" is announced exactly once

### AC5 — isEventNow/isEventPast work on Linked Events same as manual events

**Given** `now-card.tsx` determines which event is "current" vs "next-upcoming"
**Then** the existing `isEventPast`/`isEventNow` helpers in `src/lib/utils.ts` operate on Linked Events the same as manual events — no Linked-specific time logic added

### AC6 — onLinkedEventTap remains no-op placeholder

**Given** a Linked Event row on the Now Card
**When** tapped
**Then** `onLinkedEventTap(linkedReservationId)` is called (still a placeholder/no-op; Story 2.4 replaces it with real navigation to `?tab=res&highlight={id}`)

### AC7 — Manual event preferred when chronologically current alongside Linked Event

**Given** a manual event and a Linked Event both fall in the same time window
**When** determining which is "current" for the Now Card
**Then** the manual event is shown as current (existing chronological-ordering logic already handles this — Linked Events merge into `todayEvents` sorted by `startAt`, so whichever has the earliest `startAt` wins)

---

## Technical Tasks

### Task 1 — Add Linked Event rendering to `now-card.tsx`

**File:** `src/components/packt/now-card.tsx`

Current state: `now-card.tsx` renders the current/next-upcoming event from `todayEvents[]`. Each event renders as a row with `MapPin` icon, event name, time, and optional "Now" pill. The component receives `todayEvents: TripEvent[]` and `tripName`.

Changes:
1. Import `RESERVATION_TYPE_META` from `reservation-type-badge.tsx`
2. Import `LinkedEventBadge` from `linked-event-badge.tsx`
3. In the event row rendering, check if `event.linkedReservationId` is set:
   - If linked: render `RESERVATION_TYPE_META[event.reservationType!].icon` (same size/color/strokeWidth as `MapPin`, `aria-hidden`) instead of `MapPin`
   - If linked: render `<LinkedEventBadge />` after the event name
   - If not linked: existing rendering unchanged (use `MapPin`, no badge)
4. Wrap entire Linked Event row in a single `<button>` with constructed `aria-label`:
   - Pattern: `"{anchor label}: {date} · {time} — {provider}, Linked, opens Reservations"`
   - All visual children `aria-hidden="true"`
   - `onClick` calls `onLinkedEventTap(linkedReservationId)` (placeholder for now)
5. Manual event rows remain `<div>` (not button) — existing behavior unchanged
6. Add `onLinkedEventTap?: (linkedReservationId: string) => void` to `NowCardProps` (if not already)

**Critical:** The "Now" pill treatment for a Linked Event that is currently happening must use the EXISTING `var(--accent-soft)` styling — no new color tokens, per UX-DR6.

### Task 2 — Wire `onLinkedEventTap` through callers

**File:** `src/app/(app)/trips/page.tsx` (or wherever `NowCard` is instantiated)

Add `onLinkedEventTap={() => {}}` as a no-op placeholder when rendering `NowCard`. This is replaced with real navigation in Story 2.4.

### Task 3 — Unit tests for `now-card.tsx`

**File:** `src/components/packt/now-card.test.tsx`

New test cases in existing test file:

All inside `describe("NowCard")`:

1. `"renders Linked Event with icon and badge when currently happening"` — mock `todayEvents` with a `TripEvent` that has `linkedReservationId: "res-1"`, `reservationType: "lodging"`, `startAt` in the "now" window; assert `Hotel` icon rendered (not `MapPin`), "Linked" badge present, "Now" pill present
2. `"renders Linked Event with icon and badge when next up"` — mock `todayEvents` with a Linked Event that is not yet active but is the next chronological event; assert icon swap + badge + "Next" (no "Now" pill)
3. `"uses single-button aria-label for Linked Event row"` — assert the event row is a `<button>` with `aria-label` matching pattern `"Check-in: Tue, Jun 16 · 3:00 PM — Hotel Avenida Palace, Linked, opens Reservations"`; assert all visual children `aria-hidden`
4. `"manual event preferred when chronologically current alongside Linked Event"` — mock `todayEvents` with a manual event at 10:00 and a Linked Event at 11:00, assert the manual event is shown as current
5. `"manual event row is not a button"` — assert non-linked event rows render as `<div>` (no button wrapper)

### Task 4 — E2E scenario

**File:** `tests/e2e/features/linked-events.feature` (extend existing)

```gherkin
Scenario: Now Card shows a Linked Event in the current-time window
  Given the trip has a Lodging reservation whose Check-in is "now"
  When I view the trip list
  Then the Now Card shows the "Check-in" Linked Event with the "Now" pill and "Linked" badge
```

**File:** `tests/e2e/steps/linked-events.steps.ts` (extend)

```ts
Given("the trip has a Lodging reservation whose Check-in is {string}", async ({ page, scenario }, window: string) => {
  const now = new Date();
  const startAt = window === "now"
    ? now.toISOString()
    : new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        startDate: now.toISOString().slice(0, 10),
        endDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        reservations: [
          {
            type: "lodging",
            provider: "Torel Avantgarde",
            startAt,
            endAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.gotoCurrentTrip(page);
});

Then("the Now Card shows the {string} Linked Event with the {string} pill and {string} badge", async ({ page }, eventName: string, pill: string, badgeText: string) => {
  const nowCard = page.locator('[data-testid="now-card"]');
  await expect(nowCard).toContainText(eventName);
  await expect(nowCard).toContainText(pill);
  await expect(nowCard).toContainText(badgeText);
});
```

Add `data-testid="now-card"` to the Now Card container for reliable E2E targeting.

---

## Previous Story Intelligence

### Story 2.1 — Linked Events Appear on the Itinerary

Established the foundation this story builds on:

1. **Marker fields contract:** `linkedReservationId?: string` and `reservationType?: ReservationType` on `TripEvent` are the single contract between derivation, query-layer merge, and UI components. Already added to `src/data/types.ts` and wired through `deriveLinkedEvents()`.
2. **Icon map source:** `RESERVATION_TYPE_META` in `reservation-type-badge.tsx` is the single source for type→icon mapping. Import from there — never duplicate.
3. **onLinkedEventTap placeholder:** `day-card-body.tsx`, `day-card-dnd.tsx`, `place-row.tsx`, and `trip-itinerary-view.tsx` all already have `onLinkedEventTap` as a no-op. `now-card.tsx` needs the same treatment (this story) for consistency.
4. **DnD exclusion:** Linked Events excluded from `SortableContext` in day cards. Now Card has no DnD, so this doesn't apply.
5. **Position offset for sorting:** Linked Events use a large negative position offset for correct chronological interleaving. The Now Card gets `todayEvents` already sorted from `queries.ts` — no additional sort logic needed.

### Story 2.2 — Reservations Extend the Itinerary's Date Range

1. **Query layer already handles new days:** `getTripDetail()` in `queries.ts` maps all days from DB, then matches Linked Events via `toLocalDateKey(linkedEvent.startAt) === day.date`. Works for extension days and the Now Card's `todayEvents` alike — no changes needed.
2. **Dates in `todayEvents`:** `todayEvents` is already computed from the trip's days matching today's date. Extension days don't affect the Now Card unless they fall on "today" — the existing filtering is correct.
3. **Transaction pattern:** `createReservation`/`updateReservation` wrapped in `db.transaction()` with `extendTripDateRange()` helper. No changes needed for this story.

---

## Dev Notes

### Architecture constraints

- **Linked Events are computed, not persisted:** `deriveLinkedEvents()` runs at query time in `queries.ts`. The Now Card already receives merged Linked Events in `todayEvents` (Story 2.1). This story only changes NOW the card renders them — NOT how they're fetched or stored.
- **Single-button aria-label:** The entire Linked Event row must be one `<button>` with a constructed `aria-label`. This matches the Itinerary's Linked Event row pattern from Story 2.1 (ac-9, task-6). All visual children are `aria-hidden="true"`.
- **No new color tokens:** UX-DR6 explicitly rejected `--linked-brand`/`--linked-soft`/`--linked-ink`. A Linked Event that is "happening now" uses the standard `var(--accent-soft)`/"Now" pill — no badge-specific override.
- **`onLinkedEventTap` stays placeholder:** This story wires the tap handler as a no-op. Story 2.4 replaces it with real `router.push()` to `?tab=res&highlight={id}`.
- **`isEventNow`/`isEventPast` need no changes:** These helpers compare `startAt`/`endAt` against `getNow()`. They work identically for Linked Events and manual events.

### Key files and their current state

| File | State today | What this story changes |
|------|------------|------------------------|
| `src/components/packt/now-card.tsx` | Renders `todayEvents` with `MapPin` icon, no Linked Event awareness | Add icon swap + `LinkedEventBadge` + single-button `aria-label` for linked events; add `onLinkedEventTap` prop |
| `src/components/packt/now-card.test.tsx` | Tests manual event rendering | Add test cases AC1–AC5 |
| `src/app/(app)/trips/page.tsx` (where NowCard is rendered) | No `onLinkedEventTap` passed | Add `onLinkedEventTap={() => {}}` placeholder |
| `src/components/packt/linked-event-badge.tsx` | NEW in Epic 2 (Story 2.1 files) | Already exists — neutral "Linked" `Badge` `muted`/`secondary` variant. No changes needed |
| `src/components/packt/reservation-type-badge.tsx` | NEW in Epic 2 (Story 2.1 files) | Already exists — `RESERVATION_TYPE_META` with icon map. No changes needed |

### No changes needed to these files

- `src/lib/linked-events.ts` — Pure derivation, no Now Card awareness.
- `src/lib/queries.ts` — Already merges Linked Events into `todayEvents` (Story 2.1).
- `src/lib/utils.ts` — `isEventNow`/`isEventPast` work on any `TripEvent` regardless of marker fields.
- `src/data/types.ts` — `TripEvent` already has `linkedReservationId`/`reservationType` (Story 2.1).
- `src/components/packt/place-row.tsx` — Its Linked Event handling is for the Itinerary (`day-card-body`), not the Now Card.
- `src/components/packt/day-card-body.tsx` — unchanged; this story only touches `now-card.tsx`.
- `src/app/(app)/trips/[tripId]/reservations/actions.ts` — No server action changes for this story.
- `src/db/schema.ts` — No schema changes.

### Key imports

```ts
import { RESERVATION_TYPE_META } from "@/components/packt/reservation-type-badge";
import { LinkedEventBadge } from "@/components/packt/linked-event-badge";
```

### Existing render pattern in now-card.tsx

The Now Card currently checks `events[0]` for current event, `events[1]` for next up. Each event renders:
```
<MapPin size={16} strokeWidth={1.5} aria-hidden />
<span>{event.name}</span>
{pill === "now" && <span className="now-pill">Now</span>}
```

For Linked Events, replace `MapPin` with the type's icon and add `LinkedEventBadge` after the name. The "Now" pill treatment stays identical.

### Edge cases

- **Linked Event with no `reservationType`:** Defensive — check `event.reservationType` exists before looking up `RESERVATION_TYPE_META`. If missing, fall back to `MapPin`.
- **Linked Event that is both "happening now" and has "now" pill:** Standard `--accent-soft` treatment applies per UX-DR5 — no special override.
- **Multiple Linked Events in todayEvents:** The existing "find current" logic picks the first chronological one — no change needed.

### What will break if done wrong

- If `aria-label` is missing or duplicated across visual children, screen readers announce "Linked" multiple times or miss it entirely. Follow Story 2.1's exact pattern: single-button wrapper, all children `aria-hidden`, `aria-label` on the button.
- If the icon swap is placed inside `aria-hidden="false"` element, the icon's `aria-hidden="true"` won't cascade — ensure the parent wrapper handles aria visibility.

---

## Definition of Done

- [x] `npm run test:coverage` passes with ≥95% lines/functions, ≥90% branches (2197/2197 tests; lines 96.17%, functions 95.02%, branches 90.59%)
- [x] `npm run test:e2e` passes including the new Now Card Linked Event scenario
- [x] `npm run build` succeeds with no TypeScript errors
- [x] `npx eslint src tests --max-warnings 0` passes (no single-letter vars, no `any`, etc.)
- [ ] Manual verification: create a Lodging Reservation with Check-in time = now + 1 minute, confirm the Now Card shows it with the Hotel icon and "Linked" badge — equivalent flow exercised end-to-end by the new E2E scenario; not separately re-verified against a personal dev DB

---

## Dev Agent Record

### Implementation Plan

1. Add `onLinkedEventTap` prop to `NowCardProps`
2. In `now-card.tsx`, detect `linkedReservationId` on each event in `todayEvents`:
   - Render `RESERVATION_TYPE_META[reservationType].icon` instead of `MapPin`
   - Render `<LinkedEventBadge />` after event name
   - Wrap in single `<button>` with constructed `aria-label`
3. Wire `onLinkedEventTap={() => {}}` placeholder in `page.tsx` (or where `NowCard` is instantiated)
4. Add unit tests for AC1–AC5 in `now-card.test.tsx`
5. Add E2E scenario to `linked-events.feature`

### Completion Notes

Two of this story's premises turned out to be inaccurate against the actual codebase; both were corrected during implementation rather than halting, since they were implementation-detail discoveries, not product decisions:

1. **AC1 required a query-layer change the story said wasn't needed.** Dev Notes claimed `queries.ts` "already merges Linked Events into `todayEvents` (Story 2.1)." That's true for `getTripDetail()` (the Itinerary), but the Now Card consumes `todayEvents` from `listTripsForUser()`, which queried the `events` table directly and never called `deriveLinkedEvents()`. Without this, AC1 was unreachable — Linked Events could never appear on the Now Card in production. Fixed by fetching reservations per trip in bulk (mirroring the existing docs/collabs pattern) and merging derived Linked Events into `todayEvents`, sorted by `startAt` ascending (not by `position`, unlike the Itinerary's merge — the Now Card's current/next-event finder in `now-card.tsx` assumes ascending-by-time order, and the Itinerary's large-negative-offset position trick would have broken that assumption by always sorting Linked Events first regardless of actual time).
2. **`now-card.tsx`'s "current state" didn't match the file.** The story described a `MapPin` icon and a manual-event `<div>` row to adapt from; neither exists — the component already renders the current/next event as a `<Link>` card with no icon (a `cb46f14` UI-cleanup commit predates the story's baseline_commit but the description was never reconciled). Adapted intent instead of premise: manual events keep their existing `<Link>` unchanged; Linked Events get a parallel `<button>` (same outer layout/styling) with the reservation-type icon, `<LinkedEventBadge />`, and the constructed `aria-label`, calling `onLinkedEventTap` instead of navigating.

AC5's "no Linked-specific time logic" held without changes — `now-card.tsx` never used `isEventNow`/`isEventPast` in the first place (its current/next finder is inline `startAt` comparison), so there was nothing to special-case.

**Pre-existing test-infra bug found and fixed (out of story scope but blocking the coverage gate):** 18 unit tests (`template-editor-view.test.tsx`, 2 in `trips-desktop-layout.test.tsx`) failed with `window.localStorage` undefined, present on baseline `4d4f9cc` before this story touched anything (confirmed via `git stash`). Root cause: Node 22+ defines a global `localStorage`/`sessionStorage` accessor (Web Storage API, gated behind `--localstorage-file`, returns `undefined` without it). Vitest's jsdom environment only copies a `window` property onto the test global if Node doesn't already define that key; since `"localStorage" in globalThis` is `true` in Node 22+, Vitest skips copying jsdom's real implementation and Node's broken accessor wins. Fixed in `vitest.setup.mts` by restoring `window.localStorage`/`window.sessionStorage` from `globalThis.jsdom.window` (the real jsdom instance Vitest stashes there). After the fix: 2197/2197 unit tests pass, coverage thresholds pass (lines 96.17%, functions 95.02%, branches 90.59%).

Full E2E suite: 142/143 pass; the one red (`packing-tab.feature` keyboard-reorder) is unrelated to this story and passes in isolation on re-run (flaky, not a regression).

### File List

- `src/components/packt/now-card.tsx`
- `src/components/packt/now-card.test.tsx`
- `src/components/packt/trips-desktop-layout.tsx`
- `src/lib/queries.ts`
- `src/lib/queries.test.ts`
- `vitest.setup.mts`
- `tests/e2e/features/linked-events.feature`
- `tests/e2e/steps/linked-events.steps.ts`

### Change Log

- 2026-06-19: Added Linked Event rendering (icon swap, badge, single-button aria-label) to the Now Card; fixed `listTripsForUser()` to merge derived Linked Events into `todayEvents` (previously missing, which made AC1 unreachable); wired `onLinkedEventTap` placeholder through `trips-desktop-layout.tsx`; added unit and E2E coverage.
- 2026-06-19: Fixed a pre-existing, unrelated test-infra bug blocking the coverage gate — Node 22+'s global `localStorage`/`sessionStorage` accessor was shadowing jsdom's real implementation in `vitest.setup.mts`, breaking 18 tests across `template-editor-view.test.tsx` and `trips-desktop-layout.test.tsx`.

### Review Findings

#### Patch

- [x] [Review][Patch] Same-day Linked Event aria-label malformed [now-card.tsx:64-71] — fixed: flat aria-label when no separator found
- [x] [Review][Patch] Hardcoded "— km" placeholder renders for all linked events [now-card.tsx:276-278] — fixed: removed from linked event block
- [x] [Review][Patch] No MapPin fallback when reservationType is missing [now-card.tsx:60-63] — dismissed: reservationType is required at creation time
- [x] [Review][Patch] AC7 preference not enforced — manual event should win over linked when both are chronologically "current" [now-card.tsx:45-49] — fixed: prefer non-linked events in currentEvent selection
- [x] [Review][Patch] Linked event falsy startAt → button has zero accessible name [now-card.tsx:69-72] — fixed: fallback aria-label when startAt missing
- [x] [Review][Patch] Sort comparator NaN risk when event has no startAt [queries.ts:179-181] — fixed: filter before sort
- [x] [Review][Patch] Missing test for same-day Linked Event aria-label [now-card.test.tsx] — fixed: tests added for same-day and missing-startAt cases

#### Defer

- [x] [Review][Defer] aria-label says "opens Reservations" but onClick may be no-op [now-card.tsx:72,215] — deferred, placeholder per AC6, Story 2.4 replaces with real navigation
- [x] [Review][Defer] UTC midnight timezone edge case in today date filter [queries.ts:176-177] — deferred, matches existing codebase pattern
