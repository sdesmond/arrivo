---
title: "Concurrent edit batching"
type: "feature"
ticket: "2"
created: "2026-10-26"
status: done
baseline_revision: "c146a6a278057b700cc6f500b1d5b9f2b5694cf6"
route: "full"
route_source: "auto"
risk: "high"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/epic-activity-and-retention.md"
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/activity-producer-inventory.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Routine trip edits would flood Activity with one row each. Story 2.5 needs a single summary row per burst of edits, and the merge must stay correct when events arrive late or at the same time.

**Approach:** Add a summary-only `trip_updated` event type whose persistence merges into an existing row instead of inserting. A row is keyed by actor account ID, trip ID and event-time username; occurrence-time intervals connected by at most ten minutes (inclusive) become one row, serialized per key inside one transaction. No producer is wired here (2.5 does that), and no underlying edit records are stored.

## Boundaries & Constraints

**Always:** Occurrence time comes from the captured injectable real clock, never arrival time or `getNow()`. Merge runs only in the post-response `persist` path, keeps the existing timeout and failure catch, no retries. Rows hold only the existing `activity_events` columns; no edit details. A row whose latest event is recent stays readable while ongoing. The service takes an injected `database` (`Pick<typeof db, "transaction">`) so real-Postgres tests can bind it to an isolated schema.

**Never:** Wiring trip producers (2.5), new columns or migration, filters/pagination (2.7), retention (2.8), batching other event types, advisory locks outside the transaction, `any`.

## I/O & Edge-Case Matrix

| Scenario              | Input / State                                       | Expected Output / Behavior                            | Error Handling |
| --------------------- | --------------------------------------------------- | ----------------------------------------------------- | -------------- |
| First edit            | no row for key                                      | insert row, start = end = t                           | n/a            |
| Exactly 10 min gap    | row ends T, new event T+10:00 (or before start -10:00) | merge, interval extended                           | n/a            |
| 10 min 1 ms gap       | row ends T, new event T+10:00.001                   | second row                                            | n/a            |
| Delayed arrival       | event inside or before an existing row's span       | merge; start/end widen, never shrink                  | n/a            |
| Bridging              | event connects two rows (<=10 min from each)        | one row spanning both, other row deleted              | n/a            |
| Concurrent events     | two same-key events race                            | result equals sequential result; no duplicate rows    | n/a            |
| Distinct keys         | different actor, trip or username snapshot          | separate rows never merged                            | n/a            |
| Rename back           | username A, then B, then A within window            | A events merge into one row; B row separate           | n/a            |
| Write failure         | transaction rejects or times out                    | caught and logged by class only; caller unaffected    | n/a            |

</frozen-after-approval>

## Code Map

- `src/lib/activity.ts` -- `persist` inserts directly; route `TripUpdated` to the merge service, keep timeout/catch. Test seams `setActivityClock`.
- `src/lib/activity-batches.ts` (new) -- `mergeActivityInterval(database, input, occurredAt)`; `BATCH_GAP_MS = 600_000`; `BATCHED_TYPES`.
- `src/data/types.ts:56` -- add `ActivityEventType.TripUpdated: "trip_updated"`.
- `src/components/arrivo/instance-activity.tsx:8` -- `EVENT_LABELS` must gain the new type (typed `Record`, build fails otherwise): `{ type: "Trips", action: "Updated trip" }`.
- `src/lib/activity-queries.ts` -- `KNOWN_TYPES` derives from the const; reader needs no change (`endedAt` is the shown time).
- `src/lib/account-role-changes.ts:10` -- `RoleChangeDatabase` pattern to mirror; `tests/e2e/role-service-fixture.ts` -- isolated-schema fixture (search_path via `set_config`, `application_name` blocked-lock polling, `createLockGate`).
- `tests/e2e/feature-map.mjs` -- register `activity-batching` entry (`src/lib/activity-batches.ts`, `src/lib/activity.ts`, fixture).
- `playwright.config.ts` -- real-DB service scenarios run in the BDD project like `instance-role-service`; no change expected.
- Do not change: `activity_events` schema, `drizzle/`, `listRecentActivity`.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/activity-batches.test.ts`, `src/lib/activity.test.ts`, `src/components/arrivo/instance-activity.test.tsx` -- write first with a mocked transaction: gap boundary, key scoping in the query, insert vs update vs bridging delete, `persist` routing, new label -- covers matrix
- [ ] `src/data/types.ts` -- add `TripUpdated` -- shared name
- [ ] `src/lib/activity-batches.ts` -- one transaction: `pg_advisory_xact_lock(hashtextextended(actorId|tripId|username, 0))`, select same-key rows with `started_at <= t + gap and ended_at >= t - gap`, update the earliest to min/max, delete the rest, else insert -- atomic merge
- [ ] `src/lib/activity.ts` -- batched types call the service via `db`; others unchanged -- wiring
- [ ] `src/components/arrivo/instance-activity.tsx` -- label entry -- readable rows
- [ ] `tests/e2e/activity-batch-fixture.ts`, `tests/e2e/features/activity-batching.feature`, `tests/e2e/steps/activity-batching.steps.ts`, `tests/e2e/feature-map.mjs` -- per-scenario schema copy of `activity_events`; scenarios for inclusive boundary, delayed bridge, concurrent same-key (blocked-lock proof), distinct actors/trips/usernames, rename-back, no edit records stored. Tag `@feat:activity-batching`. Run `npm run test:e2e:affected`.

**Acceptance Criteria:**

- Given edits at 0, 10:00 and 20:00 minutes, when persisted in any arrival order, then one row spans 0 to 20:00.
- Given two same-key events arriving concurrently, when both commit, then exactly one row exists with the union interval.
- Given an admin opens Activity, when a batch is ongoing, then its row shows as "Updated trip" with no edit details.

## Implementation Notes

## Plan Change Log

## Review Triage Log

- medium / patch: 5 s caller timeout does not cancel a queued merge, so waiters pin pool connections -- added `set_config('lock_timeout', 4s)` before the lock (fixed, unit-tested).
- medium / patch: backward inclusive boundary and other arrival orders untested -- added three real-DB scenarios (fixed).
- low / rejected: unit mocks ignore `where` args -- key scoping and lock key are proven by the real-DB distinct-key, rename and concurrent scenarios.
- low / rejected: READ COMMITTED reliance, reverse-winner and bridging-under-race untested -- default isolation, guards would add complexity.
- low / rejected: label has no E2E, feature-map overlap -- label unit-tested; map unions tags.
- medium / deferred: admin page showing a merged row end to end -- no `trip_updated` producer until 2.5.
- false: fixture schema copy omits FKs -- Activity has no FKs by design.

## Design Notes

Serialize per key with a transaction-scoped advisory lock (row locks cannot cover the "no row yet" case). Merge is an interval union, so arrival order cannot change the result. Invariant: no two same-key rows are within the gap, so one new event can bridge at most the rows it touches.

## Verification

**Commands:**

- `npx vitest run src/lib/activity src/components/arrivo/instance-activity` -- expected: pass
- `npm run test:e2e:affected` -- expected: activity-batching, instance-activity pass
