---
title: "Delete reservations through the API"
type: feature
ticket: 4
created: "2026-11-24"
status: built
baseline_revision: b8f46cd1e4c297e4941ac52e286a0cc4a5e9da32
route: full
route_source: auto
risk: high
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: ["_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Reservation deletion still uses a server action, and cascaded expenses and date-pruned reservations can be recreated by replay.

**Approach:** Expose idempotent reservation deletion through the API, migrate its web caller, and record reservation and expense deletions during both explicit deletion and trip date pruning.

## Boundaries & Constraints

**Always:** Preserve trip locking, in-transaction editor role recheck, document ancestry validation, transactional file-deletion queue and post-commit cleanup, promoted-document survival, activity and refresh behavior. Record every cascaded expense ID before deletion in the same transaction. Branch `story/7-4-delete-reservations-api`; PR base `feature/api-v1`, verify before opening and return to integration branch after opening.

**Never:** Change date-pruning choices, unrelated expense operations, server-rendered reads, or schema. Do not delete files before commit.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Delete | Editor deletes reservation with attached files and expenses | 204; row and linked expenses gone, deletion records committed, files removed after commit; promoted documents survive |
| Retry | Reservation already absent | 204, no duplicate effects |
| Access | Viewer, nonmember, role revoked under lock, or foreign document ancestry | 403 for viewer, 404 for concealed resources; no deletion |
| Failure | Queue or transaction fails | Rollback; no post-commit cleanup |
| Prune | Date narrowing deletes reservations | Record all deleted reservation and linked expense IDs in the transaction; keep-as-unscheduled records neither |
| Replay | Create with recently deleted or pruned reservation or expense ID | 409, no resurrection |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/[tripId]/reservations/actions.ts` contains the existing deletion and exhaustive failure tests. Move behavior and tests to the service; remove both action files when no callers remain.
- `src/lib/services/reservations.ts`, `documents.ts:deleteDocument`, and `events.ts:deleteEvent` provide service, lock, cleanup and typed-error patterns. `expenses.reservationId` is not unique: collect all linked expense IDs.
- `src/lib/services/trip-date-change.ts:applyTripDateChange` deletes reservations only in DeleteEvents; `summarizeRemovedDayContent` already identifies reservation and document IDs. Use `recordDeletions` before cascade under the existing transaction.
- `src/lib/api/contract/reservations.ts` and `src/app/api/v1/reservations/[reservationId]/route.ts` already provide GET/PATCH. Extend them with DELETE.
- `src/components/arrivo/reservation-row.tsx` has the sole delete caller; preserve its dialog, duplicate guard, error handling and accessibility. `tests/e2e/steps/reservations.steps.ts` has three deletion waits, including lock-race scenarios.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: extend `src/lib/services/reservations.test.ts`, `src/lib/services/expenses.test.ts`, `src/lib/services/trip-date-change.test.ts`, `src/lib/api/contract/reservations.test.ts`, `src/app/api/v1/reservations/[reservationId]/route.test.ts`, and `src/components/arrivo/reservation-row.test.tsx`. Cover the matrix, multiple expenses, lock/role races, ancestry mismatch, rollback, cleanup failure, retry and refresh. Adapt existing action tests rather than lose their coverage; verify deletion-to-create replay for both resource kinds.
- [x] `src/lib/services/reservations.ts` -- migrate delete into authorized service; queue files and record reservation and all expense IDs before cascade; clean up after successful commit.
- [x] `src/lib/services/trip-date-change.ts` -- record pruned reservation and expense IDs only when deleted, alongside existing document records.
- [x] `src/lib/api/contract/reservations.ts`, `src/app/api/v1/reservations/[reservationId]/route.ts` -- add DELETE using existing API wrapper and 204 semantics.
- [x] `src/components/arrivo/reservation-row.tsx` -- call API and refresh on success; retain existing UI behavior. Remove obsolete reservation action and its test after migrating coverage.
- [x] `tests/e2e/features/reservations.feature`, `tests/e2e/steps/reservations.steps.ts` -- await DELETE in all reservation deletion and race steps; extend attached-file scenario to reload and verify physical file removal. Keep promotion race coverage. Remove obsolete action mapping in `tests/e2e/feature-map.mjs`.
- [x] `docs/api-v1.md` -- document DELETE, authorization, idempotence and cleanup; check API reference parity.

**Acceptance Criteria:**

- Given an editor and a reservation with attached documents and expenses, when deleted and reloaded, then the reservation and files are gone and promoted documents remain.
- Given an already deleted reservation, when DELETE is retried, then it returns 204 without repeating effects.
- Given a reservation or expense deleted directly or by date pruning, when its create is replayed within retention, then it cannot be recreated.
- Given a viewer, a nonmember, or a role revoked before the locked write, when deletion is attempted, then no rows or files are deleted.

## Implementation Notes

## Plan Change Log

## Review Triage Log

- Promoted document test: false — reservation E2E verifies survival, including lock-order races.
- Lock ordering assertion: low — service executes lock before transaction role check; test does not pin exact order. Existing race coverage exercises lock behavior.
- Unresolved ancestry: low — same inequality guard handles undefined and foreign trip; foreign ancestry test covers rejection.
- Unexpected role error: low — service rethrows errors other than TripForbiddenError; no separate replacement test.
- Retry effects: low — missing-row test checks no effects and E2E verifies successful retry.
- Empty/null file URLs: low — filter excludes null and empty-list behavior follows queue helper; no user-visible defect demonstrated.
- Role response coverage: medium, patch — revoked-role test does not require TripNotFoundError, so 404 is not pinned.
- Keyed replay: low — existing service replay validation covers reservation and expense cached creates; new E2E exercises unkeyed replay.
- Multiple expenses: false — service test checks two IDs are recorded before cascade.
- Revoked-role 404 verification: medium, patch — strengthen service assertion to require TripNotFoundError.
- Edge-case lens: no findings.
- Intent alignment: ID replay is covered end-to-end; keyed replay is covered by service validation tests.

## Verification

- Targeted Vitest: 163 tests passed; reservation service review fix: 37 tests passed.
- Build-validator: lint, TypeScript, production build, coverage (8,414 tests; lines 98.16%, functions 97.7%, branches 94.16%) and affected E2E (875 scenarios) passed.
