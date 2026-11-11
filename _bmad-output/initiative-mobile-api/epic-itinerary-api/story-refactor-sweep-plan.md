---
title: "Refactor sweep"
type: "refactor"
ticket: "9"
created: "2026-11-11"
status: "built"
baseline_revision: "eefdd92c53c64432a4d9b3f2054519c13e4021a7"
route: "oneshot"
route_source: "auto"
risk: "low"
review: 'quick'
review_source: 'auto'
lenses_ran: [quick]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 2.1-2.8 left one helper copied across three itinerary services and test titles that still name a server action the epic moved to the API. `actions.ts` itself has no unused code left: every helper (`getEventTripId`, `publishItineraryChanged`) and import still serves a document or cover action.

**Approach:** Keep one copy of the shared day-owner lookup and fix the stale titles, behind identical behavior. Add no features, endpoints, UI or domain changes.

## Boundaries & Constraints

**Always:** Branch `story/2-9-refactor-sweep` from latest `feature/api-v1`; PR base `feature/api-v1`; return to `feature/api-v1` after the PR. Same queries in the same order, same locks, statuses and effects. Each cleanup cites its source plan in Implementation Notes. Tests describe current behavior only.

**Never:** Migrations; API or contract changes; UI, component or prop changes; `actions.ts` edits; the deferred findings in `deferred-work.md`; folding `idCollision` and `collision` (different messages); `CHANGELOG.md`; full E2E; push without authorization.

</frozen-after-approval>

## Code Map

- `src/lib/services/events.ts` L44, `days.ts` L36, `itinerary-notes.ts` L32 -- identical `readDayTripId(executor, dayId)`; local `Executor` type in days, itinerary-notes, trip-notes, and inline `Pick<DbTransaction, "select">` in events and checklists. Sources: plans 2.4, 2.5, 2.6, 2.8.
- `src/lib/services/trip-write.ts` -- already imported by all of them; home for the shared lookup and a `ReadExecutor` type.
- `src/app/(app)/trips/[tripId]/actions.ts` -- checked, nothing to remove.
- `src/components/arrivo/trip-notes-editor.test.tsx` L106, L117 -- titles say "server action"; trip notes moved to the API in plan 2.7.
- `src/components/arrivo/place-row.test.tsx` L1006 -- "dialog owns the server action"; event delete moved to the API in plan 2.5. L1064 is the expense action, out of scope.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/services/trip-write.test.ts` -- cover `readDayTripId`: day found returns its trip, missing day returns undefined -- pins behavior before the move
- [x] `src/lib/services/trip-write.ts` -- export `ReadExecutor` and `readDayTripId`
- [x] `src/lib/services/events.ts`, `days.ts`, `itinerary-notes.ts` -- import `readDayTripId`, delete the local copies; use `ReadExecutor` in place of the local `Executor`/inline `Pick` (also `trip-notes.ts`, `checklists.ts`) -- one copy
- [x] `trip-notes-editor.test.tsx`, `place-row.test.tsx` -- retitle the three tests to say "API" -- titles match behavior

**Acceptance Criteria:**

- Given the sweep, when the touched services' Vitest files run, then they pass with no assertion weakened.
- Given the diff, when reviewed, then no API, contract, UI or prop change appears, and each cleanup names its source plan.

## Implementation Notes

Oneshot: about 40 lines, one concern, low risk. Investigation of the epic's changed runtime files found no export unused outside tests; the only duplication left is `readDayTripId`. Branch `story/2-9-refactor-sweep` from `feature/api-v1` (eefdd92c); PR base `feature/api-v1`; nothing pushed.

- `readDayTripId` and `ReadExecutor` now live in `trip-write.ts` (plans 2.4, 2.5, 2.6, 2.8). Removed the copies in `events.ts`, `days.ts`, `itinerary-notes.ts`; `trip-notes.ts`, `checklists.ts` and the others use `ReadExecutor` in place of the local `Executor` or inline `Pick`. `checklists.ts` create's inline day lookup (plan 2.8 era) now calls the helper too.
- The `days.ts` copy read the full `days` row via `readDay`; the shared helper selects only `tripId`. Same result, narrower projection; no test pins the column set.
- Test titles (plans 2.5, 2.7): `trip-notes-editor.test.tsx` x2 and `place-row.test.tsx` L1006 now say "API". `place-row.test.tsx` L1064 (expense action) left alone.
- `actions.ts` checked, nothing removed: `getEventTripId` and `publishItineraryChanged` still serve the document and cover actions.
- Verification: `src/lib/services` Vitest (13 files, 465 tests), `tsc --noEmit` and eslint clean; earlier run with the trip-notes-editor and place-row tests also passed. E2E and `build-validator` not run yet.

## Plan Change Log

## Review Triage Log

Lens: quick (one subagent). Diff 18 KB.

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| `days.ts` lookup now selects `tripId` only, not the full row; plan said "identical" | low | noted | Equivalent result; recorded in Implementation Notes. |
| `checklists.ts` create kept an inline copy of the day lookup | low | patch | Replaced with `readDayTripId`; same SQL; 465 service tests, tsc, eslint pass. |
| Implementation Notes did not name source plans or the branch | low | patch | Added. |
| Task checkboxes still open | low | patch | Ticked. |
| `readDayTripId` tests did not check `from`/`where` | low | patch | Assert `select({ tripId: days.tripId })`, `from(days)` and one `where`. |

## Verification

**Commands:**

- `npx vitest run src/lib/services src/components/arrivo/trip-notes-editor.test.tsx src/components/arrivo/place-row.test.tsx` -- expected: pass
- `npx tsc --noEmit` -- expected: clean
