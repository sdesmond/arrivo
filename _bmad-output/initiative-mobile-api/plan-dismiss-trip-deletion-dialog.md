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

## Plan Change Log

## Review Triage Log

- Low, corrected: initiative convention calls for branch and PR base in the plan; both are now recorded.
- Medium, deferred: browser scenarios do not hold real file storage cleanup open. The service regression verifies cleanup is scheduled after response, but a controllably slow storage integration test would strengthen evidence.

## Verification

Targeted service and deletion E2E passed. Validator: lint, TypeScript, build, 8,226 tests with 98.03% lines / 97.55% functions / 93.96% branches, and 765 affected E2E scenarios passed.
