---
title: "App-wide server action concurrency hardening"
type: "bugfix"
created: "2026-06-20"
status: "done"
baseline_commit: "59de0c5e43cfcd49923bdc8ff9ad4daab8f00b0e"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trip, day, reservation, packing, template, and profile mutations still have multi-step read-then-write paths with no row lock or optimistic guard, so concurrent requests can compute from stale state and silently overwrite each other. Reservation inline edits make this especially visible because sibling fields call `updateReservation` independently and can race on same reservation.

**Approach:** Use one server-side concurrency model across affected server actions: start a transaction, lock aggregate-root row with `SELECT ... FOR UPDATE`, then do all dependent reads and writes inside that transaction. Use trip-row locks for trip-scoped mutations, user-row locks for profile-scoped mutations, and packing-template-row locks for template-scoped mutations so partial patch APIs stay unchanged while stale-snapshot writes stop racing.

## Boundaries & Constraints

**Always:** Use one shared locking helper instead of ad hoc SQL fragments; keep mutation semantics and error messages stable unless lock behavior exposes an existing bug; move stale preflight reads inside lock-protected transactions for actions in scope; preserve partial patch behavior so sibling reservation field saves merge instead of requiring client-side batching; update colocated action tests in same change.

**Ask First:** Switching from locking to optimistic version columns; adding user-visible conflict/retry UX beyond current server errors; widening scope into auth/signup or upload-only actions that do not participate in current stale-snapshot bug.

**Never:** Ship reservation-only fix; rely on client debounce/serialization as primary safeguard; mix multiple concurrency strategies by feature; add schema churn unless locking proves insufficient during implementation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| ---------- | ------------- | -------------------------- | -------------- |
| Concurrent partial reservation edits | Two overlapping `updateReservation` calls for different fields on same reservation | Calls serialize on locked trip aggregate, second call reads first call's committed row, final reservation contains both field changes | Existing validation and not-found errors still surface; no silent field loss |
| Range/position mutation overlap | Overlapping trip/day/packing/template actions that read current dates, day numbers, or item positions before writing | Second action waits, then recalculates from latest committed aggregate state so date ranges and positions stay consistent | Existing stale-payload guard such as `CONCURRENT_MODIFICATION_ERROR` remains intact where already used |
| Missing aggregate during lock | Aggregate row deleted between auth check and transaction body | Action exits with existing not-found behavior and rolls back all dependent writes | No partial writes committed |

</frozen-after-approval>

## Code Map

- `src/lib/server-action-locks.ts` -- shared aggregate-root lock helpers for trip, user, and packing-template transactions.
- `src/lib/server-action-locks.test.ts` -- colocated coverage for raw lock helper behavior and guard branches.
- `src/app/(app)/trips/[tripId]/reservations/actions.ts` -- highest-value lost-update path; currently reads reservation/trip outside lock and then mutates inside transaction.
- `src/app/(app)/trips/[tripId]/reservations/reservation-date-range.ts` -- trip date/day expansion logic that must run only after trip aggregate lock is held.
- `src/app/(app)/trips/[tripId]/actions.ts` -- day, note, checklist, document, and cover mutations with multiple read-then-write paths.
- `src/app/(app)/trips/actions.ts` -- trip metadata mutation already transactional but still reads mutable trip/day state before writing without lock.
- `src/app/(app)/trips/packing-actions.ts` -- trip-scoped packing mutations compute positions, toggles, and section moves from current state.
- `src/app/(app)/packing/[templateId]/actions.ts` -- template item insert/reorder/remove flows use same stale-position pattern under user-owned aggregate.
- `src/app/(app)/profile/actions.ts` -- profile list mutations compute next positions and counts from current user-owned state.
- `src/app/(app)/trips/[tripId]/reservations/actions.test.ts` -- reservation concurrency regression coverage.
- `src/app/(app)/trips/[tripId]/actions.test.ts` -- trip/day/cover lock coverage.
- `src/app/(app)/trips/packing-actions.test.ts` -- packing aggregate serialization coverage.
- `src/app/(app)/packing/[templateId]/actions.test.ts` -- template aggregate serialization coverage.
- `src/app/(app)/profile/actions.test.ts` -- user aggregate serialization coverage.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/server-action-locks.ts` and `src/lib/server-action-locks.test.ts` -- add reusable helpers to lock trip, user, and packing-template aggregate roots inside active Drizzle transactions, with colocated tests for missing-row and SQL-shape branches -- keeps one concurrency model across action files.
- [x] `src/app/(app)/trips/[tripId]/reservations/actions.ts` and `src/app/(app)/trips/[tripId]/reservations/reservation-date-range.ts` -- move preflight reads into transaction, acquire trip lock first, then run reservation create/update range logic -- closes sibling inline field lost-update race without changing client payloads.
- [x] `src/app/(app)/trips/[tripId]/actions.ts` and `src/app/(app)/trips/actions.ts` -- wrap read-then-write trip/day/note/checklist/cover/date-range mutations in lock-protected transactions -- fixes deferred TOCTOU cases like `removeTripCover`, `addDay`, `removeLastDay`, and trip metadata edits.
- [x] `src/app/(app)/trips/packing-actions.ts`, `src/app/(app)/packing/[templateId]/actions.ts`, and `src/app/(app)/profile/actions.ts` -- apply aggregate-root locks to position-based and toggle/update flows that currently derive writes from mutable state -- keeps app-wide decision consistent beyond reservations.
- [x] `src/app/(app)/trips/[tripId]/reservations/actions.test.ts`, `src/app/(app)/trips/[tripId]/actions.test.ts`, `src/app/(app)/trips/packing-actions.test.ts`, `src/app/(app)/packing/[templateId]/actions.test.ts`, and `src/app/(app)/profile/actions.test.ts` -- add regression tests proving lock helper is invoked before dependent reads/writes and current conflict errors still hold where expected.

**Acceptance Criteria:**

- Given two overlapping `updateReservation` calls that patch different fields on same reservation, when both complete, then final persisted reservation includes both field changes instead of last-write-wins field loss.
- Given a trip-scoped mutation that reads current dates, day order, item order, or cover source before writing, when another trip-scoped mutation overlaps on same trip, then both actions serialize through one trip-row lock and compute from committed state.
- Given a user- or template-scoped mutation that derives `max(position)`, section membership, or ownership state before writing, when concurrent requests target same aggregate, then inserts/reorders do not compute from stale snapshots.
- Given an already-stale reorder payload after another mutation changed aggregate membership, when reorder action runs, then existing explicit conflict behavior is preserved rather than silently corrupting positions.

## Spec Change Log

## Design Notes

Aggregate-root row locking is preferred over optimistic version columns here because it fixes whole deferred class with no schema migration, no action signature churn, and no client requirement to echo version tokens. Trip row is natural serialization boundary for reservation, day, note, checklist, collaborator, and packing mutations because they already revalidate and authorize at trip scope; user row and packing-template row provide same boundary for profile and template actions.

Implementation should avoid fake locking from pre-transaction reads. If an action needs mutable row data to authorize or validate a write, fetch IDs needed for auth first if unavoidable, then re-read mutable state only after the aggregate lock is held inside transaction. Existing explicit conflict checks such as `CONCURRENT_MODIFICATION_ERROR` should stay in place because locking prevents stale snapshots across overlapping writes, but it does not make stale client payloads magically correct.

## Verification

**Commands:**

- `npx vitest run src/app/(app)/trips/[tripId]/reservations/actions.test.ts src/app/(app)/trips/[tripId]/actions.test.ts src/app/(app)/trips/packing-actions.test.ts src/app/(app)/packing/[templateId]/actions.test.ts src/app/(app)/profile/actions.test.ts` -- expected: updated action suites pass with lock helper coverage.
- `npx vitest run src/lib/server-action-locks.test.ts src/app/(app)/trips/[tripId]/reservations/actions.test.ts src/app/(app)/trips/[tripId]/actions.test.ts src/app/(app)/trips/packing-actions.test.ts src/app/(app)/packing/[templateId]/actions.test.ts src/app/(app)/profile/actions.test.ts` -- actual: pass.
- `npm run lint` -- actual: pass.
- `npx tsc --noEmit` -- actual: pass before E2E run; post-E2E rerun currently fails on generated `.next-e2e/dev/types/routes.d.ts` parser errors unrelated to changed files.
- `npm run test:coverage` -- actual: pass (94.75% statements, 90.5% branches, 95.37% functions, 96.44% lines).
- `npm run build` -- actual: pass with existing `src/lib/local-upload.ts` Turbopack glob warnings.
- `npx playwright test .features-gen/tests/e2e/features/packing-tab.feature.spec.js --grep "User keyboard-reorders an item and the new position persists after reload"` -- actual: pass.
- `npm run test:e2e` -- actual: 150 passed, 1 failed on `packing-tab.feature` keyboard reorder persistence under full parallel suite; isolated rerun passed, so this appears to be a pre-existing flaky scenario rather than a deterministic regression from this change.

## Suggested Review Order

**Locking Foundation**

- Centralizes aggregate-root `FOR UPDATE` helpers for one app-wide concurrency model.
  [`server-action-locks.ts:5`](../../src/lib/server-action-locks.ts#L5)

- Lock helper coverage proves missing-row guards and SQL parameter wiring.
  [`server-action-locks.test.ts:39`](../../src/lib/server-action-locks.test.ts#L39)

**Reservation Serialization**

- Entry point for highest-risk lost-update path; lock now wraps live reservation reread.
  [`actions.ts:85`](../../src/app/(app)/trips/[tripId]/reservations/actions.ts#L85)

- Tests now assert transaction-scoped lock ordering and partial-field preservation.
  [`actions.test.ts:222`](../../src/app/(app)/trips/[tripId]/reservations/actions.test.ts#L222)

**Trip-Day Mutation Guards**

- Day-scoped creators now revalidate locked day existence before position-sensitive writes.
  [`actions.ts:58`](../../src/app/(app)/trips/[tripId]/actions.ts#L58)

- Event creation moved from plain DB writes into trip-locked transaction flow.
  [`actions.ts:126`](../../src/app/(app)/trips/[tripId]/actions.ts#L126)

- Tests cover locked event appends, day disappearance, and transaction-scoped cover locking.
  [`actions.test.ts:165`](../../src/app/(app)/trips/[tripId]/actions.test.ts#L165)

**Packing Aggregate Hardening**

- Trip packing mutations now revalidate list scope and section shape inside lock.
  [`packing-actions.ts:96`](../../src/app/(app)/trips/packing-actions.ts#L96)

- Template pulls and section removal regained direct behavior coverage after review fixes.
  [`packing-actions.test.ts:223`](../../src/app/(app)/trips/packing-actions.test.ts#L223)

**Other Aggregate Roots**

- Template editor mutations follow same lock-first pattern for insert, delete, reorder.
  [`actions.ts:61`](../../src/app/(app)/packing/[templateId]/actions.ts#L61)

- Profile position-count mutations serialize on user root instead of stale snapshots.
  [`actions.ts:73`](../../src/app/(app)/profile/actions.ts#L73)

- Trip metadata edits now lock trip root before date-range recalculation.
  [`actions.ts:256`](../../src/app/(app)/trips/actions.ts#L256)
