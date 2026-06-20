---
baseline_commit: af28b45
---

# Story 5.1: Floating Wall-Clock Times for Reservation & Event Anchors

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trip planner,
I want a reservation or event time I enter to display as exactly what I typed, no matter who views it or what timezone their device is in,
so that "3:00 PM check-in" always reads as 3:00 PM, instead of shifting when a collaborator opens the trip from a different timezone or my own phone's clock changes zones mid-trip.

## Acceptance Criteria

1. **`combineDateAndTimeToIso` constructs a literal-tagged instant, not a real-offset conversion**
   - `src/lib/utils.ts:89-92` — currently `new Date(\`${date}T${time}:00\`).toISOString()`, which parses the input in the runtime's local offset and re-serializes as a true UTC instant
   - Change to return `` `${date}T${time}:00.000Z` `` literally — the returned digits exactly match the input `date`/`time`, tagged `Z` by string construction, never passed through a `Date` object's local-offset interpretation
   - Same `undefined`-propagation behavior when `date` or `time` is missing

2. **`composeStartEndAt` (manual event anchors) gets the identical fix**
   - `src/components/packt/place-row.tsx:17-23` — same bug, same fix pattern as AC1, applied to `startAt`/`endAt` construction for manual Itinerary events
   - Reservations and manual Events must not drift from each other — one anchor-construction bug, one fix, applied to both call sites

3. **Read-back-for-edit uses UTC getters, not local getters**
   - `src/components/packt/reservation-row.tsx:132-138` (`isoToParts`) and `src/lib/utils.ts:102-106` (`toHHMM`) currently extract date/time via local getters (`getFullYear`/`getMonth`/`getDate`/`getHours`/`getMinutes`)
   - Switch both to UTC getters (`getUTCFullYear`/`getUTCMonth`/`getUTCDate`/`getUTCHours`/`getUTCMinutes`) — re-opening an anchor for inline edit must re-populate the literal stored digits regardless of the editing device's timezone
   - `toHHMM`'s existing `isNaN`/empty-string guards are unchanged

4. **Display formatting renders the literal digits, not the viewer's local time**
   - `src/components/packt/reservation-type-badge.tsx:40-61` (`formatAnchorDateTime`, `formatAnchorDateTimeRange`, `formatDatePart`, `formatTimePart` — the last two also back `formatReservationDateRange`), `src/components/packt/now-card.tsx:21-22` (`fmtTime`), and the two inline `toLocaleTimeString` calls in `src/components/packt/mobile-active-tab.tsx:160` and `:218`
   - Every `toLocaleDateString`/`toLocaleTimeString` call in these functions adds `timeZone: "UTC"` to its options object — this makes the rendered weekday/date/time match the literal stored digits unconditionally, since AC1/AC2 now tag those digits as `Z`

5. **"Happening now"/"past" comparisons stay correct under floating semantics**
   - `src/lib/utils.ts:9-19` (`isEventPast`, `isEventNow`) — public signatures unchanged, still `(event, now: Date)`
   - Internally, add a private helper that reinterprets the real `now: Date` as floating: read `now`'s real local wall-clock components (`getFullYear`/`getMonth`/`getDate`/`getHours`/`getMinutes`/`getSeconds`/`getMilliseconds`) and re-tag them as literal UTC via `Date.UTC(...)`
   - Compare that floating-now directly against `event.startAt`/`event.endAt` (already literal per AC1/AC2) — "happening now" reflects whether the viewer's own clock face has passed the anchor's literal clock face, not a true-instant comparison across zones

6. **Dev/demo seed data matches the new construction**
   - `src/db/seed.ts:13-16` (`toStartAt`) — same bug, same fix as AC1, so seeded reservation/event times exhibit identical floating behavior to user-entered ones

7. **Explicitly unchanged: `queries.ts`'s day-bucketing for the Now Card's server-prefetched Linked Events**
   - `src/lib/queries.ts:176-177` (`linkedEvent.startAt.slice(0, 10) === todayISO`) buckets by calendar-date string — the same pre-existing, app-wide day-boundary convention used by `trip.startDate`/`endDate`/`day.date` (date-only, no time-of-day)
   - This is a separate, lower-priority, already-accepted nuance from the time-of-day anchor bug this story fixes — do not touch it

8. **No schema/migration change**
   - `reservations.startAt`/`endAt` and `events.startAt`/`endAt` (`src/db/schema.ts:138-139,163-164`) remain `timestamp(..., { withTimezone: true })`, unmodified
   - A literal-UTC-tagged `Date` round-trips through a `timestamptz` column and `db-mappers.ts`'s `.toISOString()` byte-for-byte (`toISOString()` is timezone-independent by definition) — verify this with a test, do not just assert it

9. **`deferred-work.md` updated**
   - Remove the "Timezone-naive UTC storage" Candidate Future Epics bullet (resolved)
   - Remove the per-story items it was an umbrella for that this story resolves: Story 1.1's "Local wall-clock times stored as UTC", Story 1.2's "Timezone-naive anchor formatting", Story 1.3's "Timezone-naive anchor edit/display"
   - Keep Story 1.3's "`updateReservation` select-then-update is non-transactional" (unrelated TOCTOU concern — still points to the row-level-locking Candidate Future Epic, which this story does not touch)
   - Keep Story 2.3's "UTC midnight timezone edge case in today date filter" but reword it to drop the "See Candidate Future Epics above" pointer — per AC7 it's not part of an open strategy decision anymore, just a standalone, already-accepted day-boundary nuance

## Tasks / Subtasks

- [x] Task 1: Fix anchor construction to literal-tag, not real-offset-convert (AC: 1, 2, 6)
  - [x] `combineDateAndTimeToIso` in `src/lib/utils.ts`
  - [x] `composeStartEndAt` in `src/components/packt/place-row.tsx`
  - [x] `toStartAt` in `src/db/seed.ts`

- [x] Task 2: Fix read-back-for-edit to use UTC getters (AC: 3)
  - [x] `isoToParts` in `src/components/packt/reservation-row.tsx`
  - [x] `toHHMM` in `src/lib/utils.ts`

- [x] Task 3: Fix display formatters to render literal digits via `timeZone: "UTC"` (AC: 4)
  - [x] `formatAnchorDateTime`, `formatAnchorDateTimeRange`, `formatDatePart`, `formatTimePart` in `src/components/packt/reservation-type-badge.tsx`
  - [x] `fmtTime` in `src/components/packt/now-card.tsx`
  - [x] Two inline `toLocaleTimeString` calls in `src/components/packt/mobile-active-tab.tsx` (lines ~160, ~218)

- [x] Task 4: Fix "happening now"/"past" comparisons for floating semantics (AC: 5)
  - [x] Add a private floating-now helper in `src/lib/utils.ts`
  - [x] Use it inside `isEventPast`/`isEventNow` — signatures unchanged

- [x] Task 5: Update tests for every changed function (AC: 1-6, 8 — see Testing Guidance below for the exact list)

- [x] Task 6: Update `deferred-work.md` (AC: 9)

## Dev Notes

### Scope boundary

This story is a pure client/component-layer fix — confined to anchor **construction**, **read-back-for-edit**, **display formatting**, and **"happening now" comparison**. It does not touch:

- `src/db/schema.ts` — no migration. `timestamptz` columns already round-trip a literal-UTC-tagged `Date` byte-for-byte via `.toISOString()`.
- `src/app/(app)/trips/[tripId]/reservations/actions.ts` / `reservation-date-range.ts` — these already operate on date-only strings with explicit `T00:00:00.000Z` literals (`extendTripDateRange`'s day-boundary math), which is the **same correct pattern** this story is extending to time-of-day anchors. No change needed there.
- `src/lib/queries.ts`'s UTC-midnight today-bucketing (AC7) — explicitly out of scope, see AC7.
- Any per-trip or per-anchor timezone field, picker, or schema column — the decision made with Spencer (recorded in `_bmad-output/epics.md#Epic 5`) was floating wall-clock, no schema change. Do not introduce a timezone concept anywhere.
- `getTripStatus`, `getActiveDayNumber`, `formatTripDate`, `formatDate`, `getTripDays` (all in `src/lib/utils.ts`) — these operate on date-only strings (`"YYYY-MM-DD"`, no time-of-day) via local-midnight `Date` construction with no `Z`-tagging at all, so there's no real-offset round trip to fix. Leave unchanged.

### Floating-now helper (AC5) — exact shape

```ts
function asFloatingUtc(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds()
    )
  );
}
```

Keep this private to `utils.ts` (not exported) unless a future caller needs it directly. `isEventPast`/`isEventNow` call `asFloatingUtc(now)` once each and compare the result against the (already-literal) `event.startAt`/`endAt` with the existing `<`/`<=` operators — no other logic changes.

### Why this is safe with no schema change

`reservations.startAt`/`endAt` and `events.startAt`/`endAt` are `timestamp(..., { withTimezone: true })` (Postgres `timestamptz`). When a JS `Date` object is written to a `timestamptz` column, Postgres stores the instant; reading it back via Drizzle/postgres.js returns a `Date` whose `.toISOString()` always reports the UTC representation of that instant — by definition, this is timezone-independent. If the `Date` written was constructed from a literal-UTC-tagged ISO string (AC1/AC2's `` `${date}T${time}:00.000Z` ``), `.toISOString()` on read returns that exact same string back. The DB layer is fully transparent to this change; verify it with one round-trip test, but do not modify `actions.ts`'s `new Date(patch.startAt)` calls — they already do the right thing once the input string is correct.

### Current state to preserve

- `combineDateAndTimeToIso` is called from both `reservation-row.tsx` (inline edit save) and `reservation-edit-drawer.tsx:37` (`dateTimeToIso` wrapper, add/edit flow) — fixing the one shared helper fixes both call sites.
- `reservation-edit-drawer.tsx` has no `isoToParts`-equivalent of its own — Add mode starts blank, so there's nothing to fix there beyond the shared `combineDateAndTimeToIso`.
- `ReservationAnchorFieldset` (`reservation-anchor-fieldset.tsx`) is purely presentational (renders `DatePicker`/`TimePicker`, no date math) — no changes needed.
- `place-row-dialogs.tsx` already calls `toHHMM` directly for its time-dialog defaults (`time={place.startAt ? toHHMM(place.startAt) : undefined}`) — fixing `toHHMM` fixes this call site too, no separate change needed in `place-row-dialogs.tsx`.
- `isEventPast`/`isEventNow` are called from `now-card.tsx`, `mobile-active-tab.tsx`, and `place-row.tsx` for "happening now"/"past" styling — keep the public signature `(event, now: Date)` exactly as-is; only the internal comparison logic changes. Do not change any call site.
- `src/components/ui/calendar.tsx:153`'s `day.date.toLocaleDateString(locale?.code)` is react-day-picker's own internal calendar-day rendering (date-only, no time-of-day) — unrelated to this story, leave unchanged.

### Testing Guidance

This codebase already has a precedent for TZ-sensitive unit testing: `src/lib/utils.test.ts:268-295` (`toLocalDateKey` describe block) swaps `process.env.TZ` per test (`"America/Denver"`, `"Pacific/Auckland"`, `"UTC"`) with an `afterEach` restoring `originalTz`. Mirror this exact pattern for every test below that needs to prove TZ-independence.

**`src/lib/utils.test.ts`:**
- `combineDateAndTimeToIso` (currently `utils.test.ts:226-243`): replace the existing `expect(result).toBe(new Date("2026-05-19T09:05:00").toISOString())` assertion — that assertion only coincidentally passes under whatever TZ the test runner happens to use today, and will fail once the production code stops doing real-offset conversion. Replace with `expect(result).toBe("2026-05-19T09:05:00.000Z")` (a literal expected string, TZ-independent on both sides).
- `toHHMM` (currently `utils.test.ts:245-266`): the existing tests already use loose assertions (`toMatch(/^\d{2}:\d{2}$/)`, length checks) because the old local-getter behavior was TZ-dependent. Tighten to exact `toBe` assertions now that the function is UTC-based, e.g. `toHHMM("2026-05-19T09:05:00.000Z")` → `"09:05"` exactly, deterministic under any `process.env.TZ`.
- `isEventPast`/`isEventNow` (currently `utils.test.ts:76-114`): add at least one test per function that sets `process.env.TZ` to a non-UTC zone (e.g. `"America/Denver"`) and confirms the floating-now comparison still produces the correct boolean for a fixed wall-clock `now` and anchor — proving the device's local wall clock, not its real UTC offset, drives the comparison.
- New: in `src/lib/db-mappers.test.ts`, add a test asserting that constructing a `Date` from a literal-tagged string and calling `.toISOString()` on it returns the same literal string — documents AC8's "why no schema change" reasoning as an executable assertion, colocated with `dbReservationToType`'s/`dbEventToType`'s existing round-trip tests.

**`src/components/packt/reservation-row.test.tsx`:** `isoToParts`/`handleOpenDateEdit` — assert the date/time drafts populate with the literal stored digits under a non-UTC `process.env.TZ`.

**`src/components/packt/reservation-type-badge.test.tsx`:** the existing tests build their own "expected" values by calling the *same* unguarded `toLocaleDateString`/`toLocaleTimeString` the production code used to call (e.g. lines ~100, ~108, ~117, ~129) — these will desync once production adds `timeZone: "UTC"` and the test helper doesn't. Update every expected-value construction in this file to also pass `timeZone: "UTC"`, and add one assertion per formatter under a non-UTC `process.env.TZ` proving the output doesn't shift.

**`src/components/packt/reservation-type-section.test.tsx:58-60`:** tighten the existing loose regex (`toMatch(/^[A-Za-z]{3}, [A-Za-z]{3} \d{1,2} · \d{1,2}:\d{2} (AM|PM)$/)`) to an exact string: `formatAnchorDateTime("2026-06-16T15:00:00.000Z")` → `"Tue, Jun 16 · 3:00 PM"` exactly (2026-06-16 is a Tuesday; 15:00 UTC literal = 3:00 PM literal).

**`src/components/packt/now-card.test.tsx`, `mobile-active-tab.test.tsx`:** existing fixtures already use literal `Z`-suffixed ISO strings for `startAt` — add a non-UTC `process.env.TZ` case to at least one existing rendering test per file to prove the displayed time string doesn't shift.

**`src/components/packt/place-row.test.tsx`:** add coverage for `composeStartEndAt`'s new literal construction (the function isn't currently exported — if a test needs direct access, export it the same way `formatAnchorDateTime` etc. are exported from their module, or test indirectly through whatever public component prop triggers it; check current test patterns in this file first).

No new E2E coverage is required — every AC here is unit-testable at the function/component level, and the underlying user-facing behavior (a Reservation/Event drawer, an accordion row, a Now Card) is already covered by existing E2E scenarios that don't assert on absolute clock-face values.

### Architecture compliance

- ISO 8601 string format for `startAt`/`endAt` is unchanged (`"YYYY-MM-DDTHH:mm:ss.sssZ"`) — only what those literal digits *mean* changes (a floating wall-clock value, not a true instant). No type changes in `src/data/types.ts`.
- `src/lib/queries.ts` and `src/lib/auth-helpers.ts` remain `server-only` and excluded from coverage — no changes needed there beyond what AC7 explicitly excludes.
- No new dependencies, no new components, no new server actions.

### Project Structure Notes

No new files. All changes land in existing modules already responsible for date/time handling — no structural deviation.

### References

- [Source: _bmad-output/epics.md#Epic 5] — epic rationale and the floating-wall-clock decision record
- [Source: _bmad-output/epics.md#Story 5.1] — story ACs (this file expands on them with exact line numbers and test guidance)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Candidate Future Epics] — the "Timezone-naive UTC storage" item this story closes, and the per-story items it umbrellas
- [Source: _bmad-output/implementation-artifacts/4-2-reservations-polish-and-hardening-batch.md] — previous story; established that `reservations/actions.ts` is split into `actions.ts`/`reservation-date-range.ts`/`reservation-document-actions.ts`, and that `vitest run --coverage` may report unreliable coverage percentages due to a pre-existing Vite temp-dir race (test pass/fail data is still reliable)
- [Source: _bmad-output/architecture.md:238] — `Reservation.startAt`/`endAt` are ISO 8601 strings matching `TripEvent.startAt`/`endAt` exactly, confirming no new date format is introduced
- [Source: src/lib/utils.ts] — `combineDateAndTimeToIso`, `toHHMM`, `isEventPast`, `isEventNow` (all four touched by this story) plus the date-only functions (`getTripStatus`, `getActiveDayNumber`, `formatTripDate`, `formatDate`, `getTripDays`) confirmed out of scope
- [Source: src/components/packt/reservation-row.tsx:132-138] — `isoToParts`
- [Source: src/components/packt/place-row.tsx:17-23] — `composeStartEndAt`
- [Source: src/components/packt/reservation-type-badge.tsx:40-61] — display formatters
- [Source: src/components/packt/now-card.tsx:21-22] — `fmtTime`
- [Source: src/components/packt/mobile-active-tab.tsx:160,218] — inline time formatting
- [Source: src/db/seed.ts:13-16] — `toStartAt`
- [Source: src/db/schema.ts:138-139,163-164] — `timestamptz` columns confirmed unmodified
- [Source: src/lib/utils.test.ts:268-295] — existing `process.env.TZ`-swap test pattern to mirror

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6 (Amelia persona, bmad-dev-story workflow)

### Debug Log References

None — no failing test runs or build breaks required debugging; all validation passed on first full run after implementation (one pre-existing, unrelated flaky failure in `save-as-template-dialog.test.tsx`, confirmed identical on baseline commit `af28b45`).

### Completion Notes List

- AC1/AC2/AC6: `combineDateAndTimeToIso`, `composeStartEndAt`, and `toStartAt` now build the ISO string by literal template concatenation (`` `${date}T${time}:00.000Z` ``) instead of routing through `new Date(...).toISOString()`, removing the local-offset round-trip.
- AC3: `isoToParts` and `toHHMM` switched from local (`getFullYear`/`getHours`/etc.) to UTC getters so read-back-for-edit reproduces the literal stored digits regardless of the editing device's timezone.
- AC4: Every `toLocaleDateString`/`toLocaleTimeString` call in `formatAnchorDateTime`, `formatAnchorDateTimeRange`, `formatDatePart`, `formatTimePart`, `fmtTime`, and the two inline calls in `mobile-active-tab.tsx` now passes `timeZone: "UTC"`. `formatReservationDateRange`'s own `toDateString()` same-day check was left untouched — out of the AC4 line range and not flagged by the story.
- AC5: Added a private `asFloatingUtc()` helper in `utils.ts` (exact shape from Dev Notes) and routed `isEventPast`/`isEventNow` through it; public signatures unchanged, no call sites touched.
- AC7: `queries.ts`'s UTC-midnight day-bucketing left untouched, confirmed out of scope.
- AC8: No schema change; added a literal-tag round-trip test in `db-mappers.test.ts` proving `.toISOString()` returns the same literal string after a `Date` round-trip — verifies the "why no schema change" reasoning as an executable assertion.
- AC9: `deferred-work.md` updated — removed the resolved "Timezone-naive UTC storage" Candidate Future Epic and its three per-story umbrella items (1.1, 1.2, 1.3's timezone items); kept 1.3's unrelated TOCTOU item; reworded 2.3's UTC-midnight item to drop the stale "Candidate Future Epics" pointer.
- Test fixes beyond the explicit Testing Guidance list: several existing tests in `reservation-row.test.tsx` and `reservation-edit-drawer.test.tsx` asserted `updateReservation`/`createReservation` calls using `new Date("...").toISOString()` as the expected value — these were stale against the new literal-tag behavior and were updated to literal `Z`-suffixed string expectations.
- `isEventPast`/`isEventNow` existing tests in `utils.test.ts` and all tests in `mobile-active-tab.test.tsx` were pinned to `process.env.TZ = "UTC"` (mirroring the established `toLocalDateKey` pattern) since the floating-now comparison is genuinely TZ-sensitive at the comparison step, even though the literal anchors are not; this preserves their original literal-digit intent on any machine. New TZ-swap tests were added per the Testing Guidance to prove the floating semantics independent of the runtime's real offset.
- Verified `now-card.tsx`'s and `mobile-active-tab.tsx`'s top-level current/next-event *selection* logic (`new Date(event.startAt) <= now`) is a separate, pre-existing, real-instant comparison not covered by AC5 and explicitly not in scope — left unchanged.

### File List

- `src/lib/utils.ts` — `combineDateAndTimeToIso`, `toHHMM`, `isEventPast`/`isEventNow` (+ new private `asFloatingUtc`)
- `src/components/packt/place-row.tsx` — `composeStartEndAt`
- `src/components/packt/reservation-row.tsx` — `isoToParts`
- `src/components/packt/reservation-type-badge.tsx` — `formatAnchorDateTime`, `formatAnchorDateTimeRange`, `formatDatePart`, `formatTimePart`
- `src/components/packt/now-card.tsx` — `fmtTime`
- `src/components/packt/mobile-active-tab.tsx` — two inline `toLocaleTimeString` calls
- `src/db/seed.ts` — `toStartAt`
- `_bmad-output/implementation-artifacts/deferred-work.md` — AC9 updates
- `src/lib/utils.test.ts` — tightened/replaced assertions for `combineDateAndTimeToIso`, `toHHMM`; TZ-pinned and extended `isEventPast`/`isEventNow` suites
- `src/lib/db-mappers.test.ts` — new literal-tag round-trip test
- `src/components/packt/reservation-row.test.tsx` — updated stale ISO assertions; new non-UTC TZ test for `isoToParts`/`handleOpenDateEdit`
- `src/components/packt/place-row.test.tsx` — new literal-tag assertion for `composeStartEndAt`
- `src/components/packt/reservation-type-badge.test.tsx` — `timeZone: "UTC"` added to expected-value construction; new non-UTC TZ test
- `src/components/packt/reservation-type-section.test.tsx` — tightened `formatAnchorDateTime` assertion to exact string; new non-UTC TZ test
- `src/components/packt/now-card.test.tsx` — new non-UTC TZ test
- `src/components/packt/mobile-active-tab.test.tsx` — TZ-pinned suite; new non-UTC TZ test
- `src/components/packt/reservation-edit-drawer.test.tsx` — updated stale ISO assertion

### Review Findings

- [x] [Review][Patch] `formatReservationDateRange` same-day check uses local `toDateString` while formatters now use `timeZone: "UTC"` [src/components/packt/reservation-type-badge.tsx:88] — fixed: replaced with `startAt.slice(0,10)` comparison

## Change Log

- 2026-06-20: Implemented floating wall-clock anchor construction, read-back, display formatting, and "happening now" comparisons (AC1-9); updated `deferred-work.md`; full validation (lint, tsc, unit tests, E2E, build) passed.
