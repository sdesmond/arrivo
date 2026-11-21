---
title: "Delete a trip through the API"
type: feature
ticket: 10
created: 2026-11-20
status: done
baseline_revision: "fe8c5e6c70c3ffe95cb745e6a9650690b9f26d71"
route: full
route_source: auto
risk: high
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md", "{project-root}/docs/decisions/adr-api-service-boundaries.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trip deletion remains a server action and removes document files without crash-safe cleanup. API clients cannot delete trips.

**Approach:** Add manager-only DELETE `/api/v1/trips/:tripId`, migrate all three web callers, and preserve deletion notifications while queuing document cleanup transactionally.

## Boundaries & Constraints

**Always:** Existing trips require manager access; an editor gets 403 and a nonmember gets 404. Missing trips return 204, including retries. Lock and recheck authorization before deleting; queue all document files removed by the cascade, including legacy event- or reservation-only ancestry, in the same transaction. After successful commit publish `TripDeleted` to the trip and each non-actor collaborator's user channel, then purge the trip topic. Replays, missing rows, failures and rollbacks produce no duplicate effects. Use existing cleanup, API and idempotency patterns. Branch `story/5-10-delete-trip-api`; PR base `feature/api-v1`.

**Never:** Change schema, environment, unrelated trip actions, or issue generic trip-update events for a deleted trip. Do not delete files before commit.

## I/O & Edge-Case Matrix

| Scenario | State | Result |
| --- | --- | --- |
| Delete | Existing trip, manager | 204; rows deleted, files queued, events published after commit |
| Repeat | Missing trip or replayed request | 204; no repeated queue, events or purge |
| Denied | Existing trip, editor / stranger | 403 / 404; no changes |
| Failure | Transaction or authorization fails | No cleanup or live effects |
| Race | Concurrent deletes or access change | Recheck under lock; at most one set of effects |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/actions.ts` — move `deleteTrip`; retain template and location actions. Existing event order and actor exclusion define behavior.
- `src/lib/services/trips.ts`, `src/lib/file-cleanup.ts`, `src/lib/server-action-locks.ts`, `src/lib/api/idempotency.ts` — implement dedicated transaction using existing lock, role and idempotency helpers; `runTripWrite` emits inappropriate generic update effects. Queue URLs before cascade; call `removeQueuedFiles` after commit. Inspect document ancestry and cascade paths to capture legacy documents. Missing-row handling must not mask authorization or database errors.
- `src/lib/api/contract/trips.ts`, `src/app/api/v1/trips/[tripId]/route.ts` — add strict empty-body DELETE contract with normalized UUID and 204; route forwards actor, params, body and replay options.
- `src/app/(app)/trips/use-trips-page-handlers.ts`, `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`, `src/app/(app)/travel-history/use-travel-history-page-handlers.ts` — replace action with API mutation, retaining error handling, dialog behavior and detail redirect.
- `tests/e2e/steps/trip-delete.steps.ts` — replace action waits with armed API response waits; used by trip-delete, travel-history and live-refresh scenarios.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: extend `src/lib/services/trips.test.ts` for manager deletion, missing/replay, editor/stranger, race and rollback, post-commit event ordering and file queue including legacy ancestry; extend `src/lib/api/contract/trips.test.ts` and `src/app/api/v1/trips/[tripId]/route.test.ts` for validation and forwarding.
- [x] Update `src/app/(app)/trips/use-trips-page-handlers.test.tsx`, `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx`, `src/app/(app)/travel-history/use-travel-history-page-handlers.test.tsx`, and `src/app/(app)/trips/page-client.test.tsx` for API calls, success and failure; remove retired action tests in `src/app/(app)/trips/actions.test.ts`.
- [x] Extend `tests/e2e/features/api.feature` and add `tests/e2e/steps/api-trip-delete.steps.ts` for manager delete, editor 403, stranger 404, repeated/keyed 204 and queued cleanup; update `tests/e2e/features/trip-delete.feature`, `trip-live-refresh.feature` and matching steps to prove redirect and collaborator updates with scenario-owned fixtures.
- [x] Implement service, contract and route; migrate three handlers and retire action. Document endpoint in `docs/api-v1.md` and update `tests/e2e/feature-map.mjs` for API, deletion and affected live/dashboard flows.

**Acceptance Criteria:**

- Given a manager confirms deletion from any existing caller, when deletion succeeds, then the trip disappears and the detail page returns to trips.
- Given collaborators viewing the trip or dashboard, when a manager deletes it, then their open views update; one successful deletion produces one set of notifications.
- Given a document removed with its trip, when deletion commits, then its file is queued for crash-safe cleanup.

## Implementation Notes

## Plan Change Log

## Review Triage Log

- Medium, patch: Route Handler revalidation does not immediately refresh an already cached trips page; refresh after navigation and test it.
- Medium, defer: Publishing after commit allows a reused trip UUID to receive the old deletion event; the previous action also published after deletion, so this predates the change.
- Medium, defer: Uploaded trip covers are not queued on deletion; the previous deletion action also omitted them, and the approved intent specifies document cleanup.
- Medium, patch: Day-linked legacy documents lacked a test of their query ancestry; add an API fixture that verifies file removal.
- Low, reject: Storage-failure recovery is already owned by the existing cleanup queue; this change uses that queue, and its transaction is covered by service tests.
- Low, reject: Lock and role mocks do not simulate a real membership transaction; targeted tests verify authorization follows lock acquisition, while membership serialization is existing behavior.
- Low, reject: Concurrent HTTP deletion does not inspect notifications directly; service tests cover no effects on missing/replayed deletes and event ordering.
- Medium, patch: Detail navigation E2E checked URL only; unit coverage now checks refresh after navigation, addressing stale listing.
- Medium, patch: Verification-gap lens independently identified missing day-linked document coverage; addressed by the same fixture.

## Design Notes

Idempotency authorization normally precedes replay lookup, but membership disappears on deletion. Distinguish a genuinely missing trip from an existing inaccessible one, and serialize the check with deletion so retries return 204 without weakening role checks.

## Verification

- Validator: lint, TypeScript and production build passed; 8,225 tests passed with 98.03% lines, 97.55% functions and 93.98% branches; 886 affected E2E scenarios passed.

- Run targeted Vitest files and affected Playwright scenarios before broad validation.
- Invoke `build-validator` after implementation and targeted tests pass; run its affected E2E gate, not the full suite.
