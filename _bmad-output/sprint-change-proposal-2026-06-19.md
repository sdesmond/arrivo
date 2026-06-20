---
project: Packt
date: 2026-06-19
trigger: Deferred code-review backlog audit (6 review rounds, Stories 1.1–3.2)
scope_classification: Minor
mode: Batch
---

# Sprint Change Proposal — Reservations Backlog Cleanup

## 1. Issue Summary

`_bmad-output/implementation-artifacts/deferred-work.md` has accumulated ~30 findings from every story's code review since Epic 1, with no triage pass since. Re-verifying each against current code (post Story 2.4 / 3.2) found:

- **1 item already resolved** — Story 2.4 wired up the real `onLinkedEventTap` navigation that Story 2.3 had deferred as a placeholder.
- **1 real, still-reachable functional bug** — adding a dated Reservation to a dateless trip orphans the trip's existing null-date `days` rows instead of filling them in, and double-counts them against the 45-day cap (`extendTripDateRange`, `src/app/(app)/trips/[tripId]/reservations/actions.ts:73-77`).
- **~9 independent, low-risk polish items** verified still present (missing validation, DRY duplication, a11y wiring, stale state, double-submit guards) — deferred only because they rode in on other stories' diffs, not because they're hard.
- **3 items are intentionally out of scope** — app-wide cross-cutting concerns (timezone-naive UTC storage, no server-side upload validation, no row-level locking/TOCTOU) that need a dedicated design decision before touching, not a piecemeal fix.
- **~8 items are accepted-as-design or not worth chasing** — explicit product tradeoffs or Next.js-implementation-dependent fragility the original reviewer already signed off on.

No PRD requirement is missing or wrong; this is implementation catching up to existing FR8 (date-range extension correctness) and NFR1 (accessibility floor), plus general hardening.

**Revision note (post-draft review):** the fix for the functional bug changed during proposal review. The first draft had `extendTripDateRange` auto-fill a dateless trip's existing null-date days in place. Walking through the multi-reservation case surfaced a real flaw: a second reservation landing on a calendar-disjoint date range would still grab "available" null-date days at the wrong `dayNumber` position, producing day rows with no relation to their dated neighbors (e.g. Day 1 = Jun 10, Day 2 = Jun 20, no rows for Jun 11–19) — wrong dates in the wrong place, fixable only by adding a day-reorder feature that doesn't exist today. The revised fix instead prevents the bad state from occurring at all: require a trip to have firm dates before a Reservation can be added. This is smaller in every dimension (no changes to `extendTripDateRange` itself) and is reflected in Story 4.1 below.

## 2. Impact Analysis

**Epic Impact:** None of Epic 1/2/3's stories need to reopen — all are `done` in `sprint-status.yaml` and their acceptance criteria still hold. This is new, additive work: a new Epic 4.

**Story Impact:** No existing story changes. Two new stories proposed (4.1 bug fix, 4.2 polish batch).

**Artifact Conflicts:** None in PRD, Architecture, or UX Design as written — no FRs/NFRs need rewording, no new components or schema, no new UX patterns. Worth noting for the record: FR1 ("Tapping 'Add Reservation' first shows a Reservation Type picker") had an implicit, never-stated precondition that the trip already has dates; Story 4.1 makes that precondition explicit and enforced rather than changing what FR1 says. The "set trip dates" prompt reuses an *existing* UI mechanism verbatim — `TripEditSheet`'s `DateRangePicker` + `updateTripMetadata`'s already-shipped dateless→dated handling (`src/app/(app)/trips/actions.ts:329-392`), and the same `isDateless`/`onOpenEditDates` props the Itinerary already uses for its own "Set trip dates" affordance (`trip-itinerary-view.tsx:149-166`) — so no new UX pattern is introduced.

**Technical Impact:** Story 4.1 touches `reservations/actions.ts` (one guard clause) and `reservations-tab.tsx` + `trip-detail-tab-body.tsx` (two new props, already computed one level up, threaded one level down — no new prop drilling). Story 4.2 touches `reservations/actions.ts`, `src/lib/queries.ts`, `reservation-type-badge.tsx`, and several `reservation-*.tsx` components. No schema/migration changes, no new dependencies, no changes to `extendTripDateRange` itself.

## 3. Recommended Approach

**Option 1 — Direct Adjustment (selected).** Add Epic 4 with two stories to the existing epic structure; no PRD/architecture/UX rework. Effort: Low — lower than the first draft, since Story 4.1 no longer touches `extendTripDateRange` at all and reuses an existing UI mechanism end-to-end. Risk: Low (isolated surface, full test coverage required per project convention, no shared state between the two stories).

**Option 2 — Rollback.** Not viable — the bug lives in already-shipped, otherwise-correct code (Story 2.2); rolling back would regress working features for no benefit.

**Option 3 — MVP/PRD Review.** Not applicable — no MVP scope or PRD goal is affected.

## 4. Detailed Change Proposals

### 4.1 — New Epic in `_bmad-output/epics.md`

Add after Epic 3, plus a one-line entry in the `## Epic List` section. No FR Coverage Map changes (no new FRs — this closes existing-FR/NFR implementation gaps).

```markdown
### Epic 4: Reservations Backlog Cleanup

Closes a real functional bug and a batch of independently-deferred code-review polish items accumulated across Epics 1–3's reviews (tracked in `_bmad-output/implementation-artifacts/deferred-work.md`). No new product requirements — every change brings already-shipped code into compliance with existing FR8 (date-range extension) and NFR1 (accessibility floor) intent, or removes pre-existing DRY/race risk.

#### Story 4.1: Require Trip Dates Before Adding a Reservation

As a trip planner,
I want to be prompted to set my trip's dates before I can add a Reservation to a dateless trip,
So that my booking dates always land on real, correctly-ordered itinerary days instead of risking orphaned or misaligned placeholder days.

**Acceptance Criteria:**

**Given** a dateless trip (`trip.startDate` unset)
**When** `createReservation` is called (`src/app/(app)/trips/[tripId]/reservations/actions.ts`)
**Then** it throws `"Set trip dates before adding a reservation."` before opening its transaction, and no `reservations` or `days` row is written

**Given** a dated trip
**When** `createReservation` is called
**Then** behavior is unchanged from today — no regression for the only state Reservations are designed to operate in

**Given** the Reservations tab (`reservations-tab.tsx`) on a dateless trip
**When** it renders
**Then** — because a dateless trip can never have an existing Reservation, it is always in the zero-reservations branch — it shows a "Set trip dates to add reservations" prompt (same `Empty` composition pattern as the existing empty state, different copy/icon) instead of the normal "No reservations yet" / "Add Reservation" state

**Given** that prompt
**When** I tap its button
**Then** it calls `onOpenEditDates` (a new prop, wired from `trip-detail-tab-body.tsx` to the same `() => setEditingTrip(true)` callback already passed to the Itinerary's existing "Set trip dates" affordance), opening `TripEditSheet`

**Given** `TripEditSheet`'s date range field
**When** I set and save trip dates from that entry point
**Then** it uses the existing, unmodified `updateTripMetadata` dateless→dated handling (`src/app/(app)/trips/actions.ts:329-392`) — no new date-setting logic is written — and the Reservations tab now shows the normal empty state, allowing a Reservation to be added

**Given** the Itinerary CTA (`ItineraryCta`/`onActivateReservationsCta`)
**When** tapped on a dateless trip
**Then** it is intentionally left unchanged — it still navigates to the Reservations tab unconditionally; the tab itself is the single point that decides what to show, so no per-entry-point special-casing is added

**And** `extendTripDateRange` is **not modified** — once Reservations only ever exist on dated trips, every date it places already lands in its existing, already-correct shift/append branches; the originally-proposed null-date-day-filling logic is dropped entirely, and `addDay`/`updateTripMetadata` also remain unchanged

**And** unit tests: `reservations/actions.test.ts` — `createReservation` rejects on a dateless trip, unaffected on a dated trip; `reservations-tab.test.tsx` — `isDateless=true` + zero reservations renders the prompt and invokes `onOpenEditDates`, `isDateless=false` + zero reservations renders today's unchanged empty state, existing populated-accordion tests updated for the new required props

**And** E2E: one new scenario — on a dateless trip, the Reservations tab shows the set-dates prompt instead of "Add Reservation"; setting dates via the prompt's button (through the real `TripEditSheet`/`updateTripMetadata` flow) then allows adding a reservation normally. This crosses the server/client boundary so belongs in E2E, not as a duplicate unit test

#### Story 4.2: Reservations Polish & Hardening Batch

As a developer maintaining the Reservations feature,
I want the small, independently-deferred code-review findings from Stories 1.1–2.4 resolved,
So that the backlog reflects real outstanding work instead of accumulating low-risk items indefinitely.

**Acceptance Criteria:**

**Given** `createReservation` (`reservations/actions.ts`)
**When** `startAt`/`endAt` are malformed (non-parseable as a date)
**Then** it rejects with the same validation `updateReservation` already has, before opening the transaction

**Given** the reservation-documents query in `getTripDetail` (`src/lib/queries.ts`)
**When** a Reservation has multiple attached Documents
**Then** they return in a stable, deterministic order (`orderBy(documents.addedAt)`, matching the trip-docs query)

**Given** `REQUIRES_END_AT` (currently duplicated in `reservations/actions.ts` and `reservation-edit-drawer.tsx`)
**When** this story is implemented
**Then** it is exported once from `reservation-type-badge.tsx` (the existing centralized reservation-type-metadata module) and imported by both call sites, with no behavior change

**Given** `ReservationAnchorFieldset`'s date/time inputs
**When** a validation error is shown
**Then** both `DatePicker` and `TimePicker` carry `aria-describedby` pointing at the rendered error message's `id`

**Given** a Reservation Type accordion header (`reservation-type-section.tsx`)
**When** expanded
**Then** the header button's `aria-controls` references the `id` of the rendered row region

**Given** `PLACEHOLDER_STYLE` (currently duplicated in `reservation-row.tsx` and `reservation-inline-text-field.tsx`)
**When** this story is implemented
**Then** it is exported once from `reservation-inline-text-field.tsx` and imported by `reservation-row.tsx`, with no visual change

**Given** `openSections` state in `reservations-tab.tsx`
**When** a Reservation Type's last reservation is deleted (its section disappears) and a new Reservation of that type is later added
**Then** that type's section renders collapsed by default, not stale-expanded

**Given** two Reservations sharing the same `provider` value
**When** their delete buttons are rendered
**Then** each has a distinct accessible name (disambiguated by the reservation's formatted date/time via the existing `formatReservationDateRange` helper)

**Given** `ReservationInlineTextField`'s `save()` and `reservation-row.tsx`'s `handleDoneEditingDates()`
**When** a save is already in flight
**Then** a re-entrant call (rapid Enter+blur, double-blur) is a no-op, mirroring the existing `deletingRef` guard pattern already used for delete

**And** unit/component tests added or extended for each item above, colocated with its source file per project convention

**And** `_bmad-output/implementation-artifacts/deferred-work.md` is updated: items resolved by Story 4.1/4.2 are removed; items confirmed as accepted-design/no-action are removed; a new "Candidate Future Epics" section is added at the top listing the three app-wide concerns intentionally left open — timezone-naive UTC storage, no server-side upload MIME validation + unsanitized filename-as-blob-key, no row-level locking/TOCTOU across server actions — each with one line on what a dedicated future story would need to decide
```

### 4.2 — `_bmad-output/implementation-artifacts/sprint-status.yaml`

Add, following the existing `epic-N` / `story-id: status` convention:

```yaml
  epic-4: backlog
  4-1-require-trip-dates-before-adding-a-reservation: backlog
  4-2-reservations-polish-and-hardening-batch: backlog
  epic-4-retrospective: optional
```

### 4.3 — `_bmad-output/implementation-artifacts/deferred-work.md`

- Remove: the Story 2.3 `onLinkedEventTap` item (resolved by 2.4); `user.id!` non-null assertion; `uploadCoverImage` discards previous attribution; linked-events-outside-day-range dropped; the (already-gone) `AGENTS.md` warning-block item; all four Story 2.4 race/fragility items (self-race in highlight resolve, `searchParams.toString()` stability, `handleTabChange` vs `router.push`, highlight vs DOM race); and, once Story 4.1/4.2 ship, the items they close.
- Keep as-is: no index on `reservations.trip_id`; dev-date-picker overlay E2E click interception; weak E2E substring assertions; AC4 focus-on-error test-coverage gap; minor zero-byte-upload/empty-array edge cases.
- Add new top section: "Candidate Future Epics" — timezone-naive UTC storage across reservations/events (needs a timezone strategy decision); no server-side upload MIME validation + unsanitized client filename as blob key (needs a MIME allowlist + key-generation scheme decision); no row-level locking/TOCTOU across server actions (needs an isolation-level/locking approach decision).

## 5. Implementation Handoff

**Scope classification: Minor.** Fully specified bug fix + independent polish items, no PRD/architecture/UX rework, no cross-team coordination needed.

**Handoff:** Developer agent, via the normal story cycle — `bmad-create-story` (Story 4.1 first, since 4.2 has no dependency on it but fixing the real bug first is the better sequencing), then `bmad-dev-story` → `bmad-code-review` per story, same as Epics 1–3.

**Success criteria:** Story 4.1 — `createReservation` rejects on a dateless trip and is unaffected on a dated one; `reservations-tab.test.tsx` covers both the new prompt and the unchanged empty state; the new E2E scenario passes; manual sanity check (dateless trip → Reservations tab shows the set-dates prompt → tapping it opens `TripEditSheet` → saving dates there unlocks normal reservation-adding) confirms the flow end-to-end. Story 4.2 — each acceptance criterion above has a passing colocated test; `packt-build-validator` passes; `deferred-work.md` reflects the pruned/reframed state.
