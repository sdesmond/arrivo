---
title: "Dismiss trip deletion dialog after success"
type: bugfix
ticket: ""
created: 2026-11-20
status: built
baseline_revision: "ccac0cb28e805b2025a5d737504f1e85da64e522"
route: oneshot
route_source: auto
risk: medium
review: 'quick'
review_source: 'auto'
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After a trip is deleted, its confirmation dialog can remain visible with a spinning confirm button.

**Approach:** Ensure deletion finishes its user-visible flow and dismisses the dialog reliably, while retaining error handling and durable file cleanup.

</frozen-after-approval>

## Implementation Notes

Oneshot: narrow bug fix. Branch `story/5-10-delete-trip-api`; PR base `feature/api-v1`. Investigate the actual request and dialog lifecycle before choosing the smallest fix. The service commits and publishes deletion before awaiting queued file cleanup; slow cleanup can delay the 204. Both Trips and Travel History handlers keep the dialog pending until the API resolves. The detail edit sheet has its own dialog. Preserve transactional queueing, error feedback and collaborator updates. Add regression coverage before production changes: `src/lib/services/trips.test.ts` for any service behavior changed, `src/app/(app)/trips/use-trips-page-handlers.test.tsx` and `src/app/(app)/travel-history/use-travel-history-page-handlers.test.tsx` for changed pending/success/failure behavior, and `tests/e2e/features/trip-delete.feature` with `tests/e2e/steps/trip-delete.steps.ts` to assert dialog dismissal after successful deletion. Update other matching colocated tests if their source changes.

The default Iceland trip has no documents. A two-session development-mode regression reproduced the owner stuck on the trip after its DELETE returned 204; production mode did not reproduce it. Defer the actor's own deletion event while its request is pending to avoid competing navigation; process it if the request finishes without leaving the page. Collaborator delivery stays unchanged.

Review identified two event-order races in the first coordination attempt. The current implementation tracks request outcome synchronously; early events defer during the request, late events after success stay suppressed, and an event after failure redirects normally. Independent re-review found no remaining concrete defect.

## Plan Change Log

## Review Triage Log

- Low, corrected: initiative convention calls for branch and PR base in the plan; both are now recorded.
- Medium, deferred: browser scenarios do not hold real file storage cleanup open. The service regression verifies cleanup is scheduled after response, but a controllably slow storage integration test would strengthen evidence.

## Verification

- Development-mode two-session regression and user confirmation passed. Targeted unit tests passed; lint, TypeScript, build and coverage passed (8,230 tests; lines 98.03%, functions 97.55%, branches 93.97%). Final affected E2E: 1,284 passed, two timed out; both passed on targeted retry. The user subsequently ran the full E2E suite and reported all 1,286 scenarios passed.


Targeted service and deletion E2E passed. Validator: lint, TypeScript, build, 8,226 tests with 98.03% lines / 97.55% functions / 93.96% branches, and 765 affected E2E scenarios passed.
