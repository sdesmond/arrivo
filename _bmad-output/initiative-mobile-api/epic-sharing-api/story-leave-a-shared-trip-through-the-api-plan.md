---
title: "Leave a shared trip through the API"
type: "feature"
ticket: "5"
created: "2026-11-18"
status: done
baseline_revision: "d8bcd8673e8cae10c00b708c46138ce8e52dad47"
route: "full"
route_source: "auto"
risk: "high"
review: "thorough"
review_source: "auto"
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Leaving a trip uses a server action rather than the API and reports absent membership as stale. Other clients need the same departure behavior without learning whether an unrelated trip exists.

**Approach:** Migrate self-departure to `DELETE /api/v1/trips/:tripId/collaborators/me`, using session identity, transactional membership checks and the existing API replay pattern. Move the leave hook to that endpoint.

## Boundaries & Constraints

**Always:** Work on `story/4-5-leave-shared-trip-api`, PR base `feature/api-v1`; switch back after an authorized PR. Return identical empty 204 for successful departure and absent membership, including foreign or missing trips. Under the trip lock recheck the session user's membership; refuse creator and manager departures with existing messages. Keep other memberships intact. In a successful mutation publish personal `MembershipLeft`, remove that user's trip subscribers, then publish trip `MembershipChanged`; revalidate trip and trips list after commit. No side effects for no-op, rollback or replay. Existing dialog keyboard, focus, pending, late-result and navigation behavior stays intact. Tests precede runtime changes.

**Never:** Schema or environment changes, UI redesign, other sharing operations, automatic full E2E, CHANGELOG or ticket edits, unauthorized push or PR. Never require trip membership before the empty-success check or expose trip data in a no-op.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Leave | Editor or viewer | 204; only own membership removed; ordered postcommit events | None |
| No membership | Already left, foreign or missing trip, with or without key | Identical 204; no replay read/write or effects | None |
| Protected | Creator or manager membership | Membership intact, existing refusal message | API validation error |
| Replay | Same keyed departure, including retry after removal | 204; no repeated effects | Different request with a reused key follows API conflict rules when membership exists |
| Rejoined | Old key reused after a new membership | Replay does not remove new membership; new intent uses a fresh key | None |
| Concurrent/deadline | Membership or trip removed concurrently; transaction deadline | No-op for absence; deadline rolls back mutation and replay | Deadline 503 |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/actions.ts` `leaveTrip`: retire action and port its tests and postcommit sequence.
- `src/lib/membership-writes.ts` `leaveTripWrite`: extract in-transaction path; preserve wrapper semantics for `tests/e2e/steps/deletion-concurrency.steps.ts`.
- `src/lib/services/sharing.ts`, `src/lib/api/idempotency.ts`: use `guardTransactionDeadline`/`withIdempotency`; actor/key lock precedes authorization and replay. In authorization lock trip, recheck membership and protected roles. Catch a private absence sentinel outside the transaction to return 204 before replay access. Preserve lock order.
- `src/lib/api/contract/sharing.ts`, new route: strict empty body, UUID trip param, `defineEndpoint<null>` with 204, `idempotent: {}`. API client supports 204.
- `src/app/(app)/trips/[tripId]/use-leave-trip.ts`: sole UI caller; `page-client.test.tsx` covers dialog and navigation. Replace action mock with API mock.
- `tests/e2e/steps/leave-trip.steps.ts`, `trip-sharing.steps.ts`: replace server-action waits with exact DELETE waits. `use-trip-live-refresh` handles personal redirect.

## Tasks & Acceptance

**Execution:**

- [ ] First expand `src/lib/membership-writes.test.ts`, `src/lib/services/sharing.test.ts`, `src/lib/api/contract/sharing.test.ts`, new `src/app/api/v1/trips/[tripId]/collaborators/me/route.test.ts`, and `src/app/(app)/trips/[tripId]/page-client.test.tsx`: cover matrix, locked recheck, manager/creator refusal, other membership preservation, ordered events, keyed replay and no-op privacy including reused keys, rollback/deadline, API arguments and dialog races.
- [ ] `src/lib/membership-writes.ts`, `src/lib/services/sharing.ts`, `src/lib/api/contract/sharing.ts`, new route: implement the guarded self-delete, 204 contract and transaction/replay composition. Preserve concurrency-test wrapper.
- [ ] `src/app/(app)/trips/[tripId]/use-leave-trip.ts`, `src/app/(app)/trips/actions.ts`, `src/app/(app)/trips/actions.test.ts`, `src/data/types.ts`: migrate caller and retire unused action/result.
- [ ] `tests/e2e/features/{leave-trip,trip-sharing}.feature`, `tests/e2e/steps/{leave-trip,trip-sharing}.steps.ts`: await exact DELETE before reload, add another-tab departure redirect and verify remaining members.
- [ ] `tests/e2e/features/api.feature`, new `tests/e2e/steps/api-leave-trip.steps.ts`: scenario-owned fixtures verify editor/viewer leave, protected manager, foreign/missing/previously-left identical 204, repeat/keyed requests and membership persistence.
- [ ] `tests/e2e/feature-map.mjs`, `src/lib/api/idempotency-expiry-cap.test.ts`, `docs/api-v1.md`: register runtime and test paths, replay cap and contract. Run targeted tests before validator.

**Acceptance Criteria:**

- Given an editor or viewer on a shared trip, when they leave and reload, then their membership is gone, other members remain, the current tab returns to trips, and other open trip tabs redirect.
- Given a manager or creator, when they attempt the API departure, then it is refused without changing membership; given any trip without the caller's membership, when departure is requested, then the same empty success reveals no trip data.
- Given a completed departure, when retried, then no activity or live event is repeated; given the finished tree, when targeted and affected validation runs, then the retired action has no callers and checks pass without new migrations or settings.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
| --- | --- | --- |
| `leaveTripWrite` dead code (blind, gap) | false | `tests/e2e/steps/deletion-concurrency.steps.ts:198` calls it; plan requires keeping the wrapper. |
| Malformed tripId yields validation error, not 204 (edge, intent) | false | Intent's 204 covers absent membership on foreign/missing trips; route param validation rejecting non-UUIDs is the plan's contract (`UUID trip param`). |
| Missing trip detected by `TRIP_NOT_FOUND_MESSAGE` compare (blind, intent) | false | Same pattern already used in `membership-writes.ts`, `account-deletion.ts`, reservations actions. |
| Post-commit publish/revalidate throw returns 500 (edge) | low, rejected | Same postcommit pattern as sibling services; fix adds a guard branch for an unlikely case. |
| No-op key not consumed, later rejoin + same key leaves (edge) | false | Intended: Design Notes and matrix state absence bypasses replay and a rejoined member uses a fresh key. |
| 401 not redirected to login in hook (edge) | low, rejected | Cosmetic; fix adds branch outside the story's boundaries. |
| Missing UI tests for 503/non-422 errors; missing e2e 401/409/503 (blind, edge) | low, rejected | Service/contract unit tests cover the paths; fix adds tests only. |
| `trip-sharing.feature` not edited (edge claim) | false | Its steps changed; existing scenario passes; other-tab coverage sits in `leave-trip.feature`. |
| Lock order vs manager batch (edge claim) | false | `withIdempotency` key lock precedes trip lock, as plan's Code Map prescribes. |
| Docs say `Idempotency-Key`: yes (blind) | low, rejected | Wording matches sibling endpoint docs; no behavior impact. |
| `LeaveTripResult` leftover importers (blind) | false | `tsc --noEmit` clean. |
| feature-map breadth, thin route test, other-tab not closed (blind) | low, rejected | Cosmetic; no named harm. |

## Design Notes

Absence bypasses replay reads to conceal trip existence even for reused keys. A rejoined member uses a fresh key to leave again.

## Verification

**Commands:**

- `npx vitest run src/lib/membership-writes.test.ts src/lib/services/sharing.test.ts src/lib/api/contract/sharing.test.ts src/app/api/v1/trips "src/app/(app)/trips"` -- targeted tests pass.
- `node scripts/run-e2e.mjs --grep="@feat:(leave-trip|trip-sharing|api)"` -- targeted scenarios pass.
- `build-validator` -- final gate passes; no automatic full E2E.
