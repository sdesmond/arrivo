# Story 6.2: Validate client-supplied events against stored trip

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trip collaborator,
I want route and schedule-conflict server actions to only operate on events that actually belong to the trip I have access to,
so that a client can't request route/conflict data for arbitrary event coordinates under cover of a trip I can view.

## Acceptance Criteria

1. **Given** `getDayRouteSummary` or `getDayScheduleConflicts` in `src/app/(app)/trips/[tripId]/route-actions.ts` is called with `tripId` and a client-supplied `events` array, **when** the action runs, **then** it validates that every supplied event actually belongs to that trip before computing routes — mismatched/foreign events are rejected, not silently trusted.
2. **Given** the existing `getRouteDistanceTime` action in the same file takes raw `origin`/`destination` coordinates (no event IDs at all), **when** the fix lands, **then** the same validation *principle* is applied consistently across all three actions in `route-actions.ts` — but see Dev Notes for why `getRouteDistanceTime` needs a different treatment, not the same code path.
3. **Given** a viewer-level collaborator with access to Trip A, **when** they call one of these actions with `tripId: A` but supply events belonging to Trip B, **then** the action does not return route/conflict data computed from Trip B's coordinates.
4. **And** existing valid same-trip calls continue to work unchanged — no behavior change for the legitimate path, and existing `requireUser()`/`assertTripAccess()` checks are preserved exactly as they are today (this story adds a check, it doesn't replace the existing auth checks).

## Tasks / Subtasks

- [ ] **Task 1: Add trip-ownership validation for supplied events** (AC: #1, #3, #4)
  - Current state — read `src/app/(app)/trips/[tripId]/route-actions.ts` in full before starting (it's short, 43 lines). All three actions call `requireUser()` then `assertTripAccess(tripId, user.id!, "viewer")`, which proves the caller can see *Trip A*, but never checks that the `events` array they also supplied actually belongs to *Trip A* — a caller with legitimate viewer access to any trip can pass event objects with coordinates from a different trip (or fabricated ones) and get route/conflict data computed from them.
  - The established pattern for this exact problem already exists in this codebase: `getEventTripId(eventId)` in `src/app/(app)/trips/[tripId]/actions.ts:69-73` derives the *true* owning trip of a single event from the DB (`db.select({ tripId: events.tripId }).from(events).where(eq(events.id, eventId))`) rather than trusting a client-supplied pairing. This story needs the batch equivalent: given `tripId` and an array of event IDs, confirm every ID actually belongs to that trip.
  - [ ] Add a local helper in `route-actions.ts` (not exported, not in `route.ts` — trip-ownership validation is a server-action/auth-boundary concern per epics.md's "Architectural boundaries" note: `route.ts` does route/distance calculation only) that takes `tripId` and the supplied `events: TripEvent[]`, and verifies every event ID belongs to that trip in one query: `db.select({ id: events.id }).from(events).where(and(eq(events.tripId, tripId), inArray(events.id, eventIds)))`, then compare the returned ID set against the supplied IDs. `route-actions.ts` currently imports neither `db`, the `events` schema table, nor any `drizzle-orm` operators — this story adds all three: `import { db } from "@/db"`, `import { events } from "@/db/schema"`, `import { and, eq, inArray } from "drizzle-orm"` (mirror the exact import style used in `src/lib/route.ts`, which already imports `and`/`eq` from `drizzle-orm` and `routeCache` from `@/db/schema` the same way).
  - [ ] On mismatch, throw (matching the existing pattern of `getEventTripId` throwing `new Error("Event not found")` for an analogous violation — pick a similarly clear message, e.g. `"Event(s) do not belong to trip"`). Do not silently filter and continue — the caller supplied bad data, surface it rather than degrading gracefully (this differs from `route.ts`'s `RouteResult.unavailable` pattern, which is for *provider* failures, not for a client integrity violation).
  - [ ] Wire this helper into `getDayRouteSummary` and `getDayScheduleConflicts`, called after `assertTripAccess` succeeds and before delegating to `route.ts`. Skip the check entirely when `events.length === 0` (nothing to validate, and the underlying `route.ts` functions already handle empty/under-2-located-item inputs as `unavailable`/`[]`).
- [ ] **Task 2: Decide `getRouteDistanceTime`'s treatment** (AC: #2)
  - `getRouteDistanceTime(tripId, origin, destination, transitMode)` takes raw lat/lng pairs, not event IDs — there is no event to validate against. The Epic 4.1/4.2 code reviews' "mirrors the exact pre-existing pattern in the sibling `getRouteDistanceTime` action" language was about the *shape* of the gap (trusting client-supplied coordinates), not a literal call to the same validation helper — you cannot look up "does this lat/lng belong to trip X" the way you can for an event ID.
  - [ ] Document in Dev Notes / Completion Notes that this action is intentionally out of scope for the event-ownership check (there's no event ID to check), and that the coordinate-trust risk it carries is materially lower: it returns only aggregate distance/duration for a route between two points, the same shape of information External Maps or any mapping service would give any user for any two coordinates — not could not access otherwise. Do not add speculative rate-limiting or coordinate-plausibility checks; that's a different, unrequested feature.
- [ ] **Task 3: Tests** (AC: #1, #3, #4)
  - [ ] `src/app/(app)/trips/[tripId]/route-actions.test.ts` (exists, 131 lines — extend, don't rewrite): add a `db` mock (see `src/lib/route.test.ts` for the `vi.mock("@/db", ...)` + `vi.mock("@/db/schema", ...)` pattern used to mock drizzle's `select().from().where()` chain) and add cases to `getDayRouteSummary` and `getDayScheduleConflicts` describe blocks:
    - supplied events that all belong to the trip → validation passes, `route.ts` delegate is still called with those events (no regression on the legitimate path)
    - supplied events including at least one foreign/mismatched ID → the action throws before `route.ts`'s `getDayRouteSummary`/`getDayScheduleConflicts` mock is ever called (assert `mockGetDayRouteSummary`/`mockGetDayScheduleConflicts` was NOT called, mirroring the existing "rejects when the user does not have viewer access" test's assertion style at lines 96-103 and 122-129)
    - empty `events` array → validation is skipped, no DB call made, existing "unavailable"/`[]` behavior preserved
  - [ ] No changes needed to `src/lib/route.test.ts` — `route.ts` itself is untouched by this story.
  - [ ] No changes needed to `src/app/(app)/trips/[tripId]/actions.test.ts` — `getEventTripId` there is reused as a *reference pattern*, not modified or imported cross-file.

## Dev Notes

- **Scope discipline:** this story touches exactly one file's logic (`route-actions.ts`) plus its colocated test. Do not touch `route.ts` (calculation logic, unaffected), `actions.ts` (the reference pattern lives there but isn't modified), or any component. If you find yourself editing a `.tsx` file for this story, stop — that's a sign of scope drift.
- **Why one query, not N:** `events` can contain multiple items (a full day's worth). Validate with a single `inArray` query rather than looping `getEventTripId`-style per-event lookups — this story already flagged N sequential round-trips as a separate, lower-priority deferred item (see epics.md Additional Requirements / the original 4.1 review's "awaits hops sequentially with no cap" note about a *different* function); don't introduce a second N-query pattern while fixing a security gap.
- **Severity calibration:** this is a data-integrity/trust-boundary fix, not a data-exposure vulnerability — the caller must already have at least viewer access to some real trip (`assertTripAccess` still runs first), and the "leaked" data is only route distance/duration between two coordinates, not trip content. Implement it as a correctness fix with clear tests, not as a security incident with defensive-in-depth layering beyond what's asked.

### Project Structure Notes

- No new files. Edits:
  - `src/app/(app)/trips/[tripId]/route-actions.ts` (MODIFY — add validation helper + wire into 2 of 3 actions)
  - `src/app/(app)/trips/[tripId]/route-actions.test.ts` (MODIFY — extend existing describe blocks, add `db` mock)
- Matches existing file/test colocation convention exactly.

### References

- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — original findings: "Deferred from: code review of 4-1-show-day-route-strip-for-days-with-2-plus-located-items (2026-07-15)" and "Deferred from: code review of 4-2-detect-and-surface-schedule-conflicts (2026-07-16)".
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 6: Route Reliability & Data Integrity] — Story 6.2 acceptance criteria (this file's ACs are copied from there, AC #2 elaborated with the `getRouteDistanceTime` scoping decision made during story creation).
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements] — "Architectural boundaries: all route/distance reads go through `src/lib/route.ts` only" — reinforces that the new validation belongs in `route-actions.ts` (the server-action/auth layer), not `route.ts` (pure calculation).
- [Source: src/app/(app)/trips/[tripId]/route-actions.ts] — the file being modified (all 3 actions).
- [Source: src/app/(app)/trips/[tripId]/actions.ts:69-73] — `getEventTripId()`, the existing reference pattern for deriving true event ownership from the DB instead of trusting client pairing.
- [Source: src/app/(app)/trips/[tripId]/route-actions.test.ts] — existing test file and mocking conventions to extend.
- [Source: src/lib/route.test.ts] — reference for mocking drizzle's `db.select().from().where()` chain (`vi.mock("@/db", ...)` / `vi.mock("@/db/schema", ...)` pattern), needed since `route-actions.test.ts` doesn't currently mock `db` at all.
- [Source: src/data/types.ts] — `TripEvent` type (has `id: string`, already imported in `route-actions.ts`).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
