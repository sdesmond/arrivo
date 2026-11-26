---
title: "Create reservations through the API"
type: feature
ticket: 1
created: 2026-11-23
status: done
baseline_revision: f96829d63e9f423d3259400c47790aabfa89cb51
route: full
route_source: auto
risk: high
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Reservation creation still uses a server action, leaving mobile clients without the shared API and safe retry behavior.

**Approach:** Expose trip reservation GET and POST, move creation into an authorized service, and switch the existing drawer to that API while preserving reservation behavior.

## Boundaries & Constraints

**Always:** Preserve validation, trip locking and date widening, activity and revalidation, canonical mapping, existing drawer accessibility and direct server-rendered reads. Require a client UUID; support idempotency keys and safe same-ID replay. Branch: `story/7-1-create-reservations-api`; PR base: `feature/api-v1`. Verify base before opening a PR; after opening return to integration branch. Pull integration before starting another story.

**Never:** Migrate reservation edits, deletion endpoint, expenses, or trip date-pruning deletion records (later stories). Do not add a migration or change existing server-rendered reads.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Error handling |
| --- | --- | --- | --- |
| Create | Editor, valid UUID and reservation | One mapped reservation; trip range widens as needed, activity recorded once | Validation errors use API envelope |
| Replay | Same UUID and content, including idempotency-key retry | Return same reservation; no duplicate row, widening or activity | Different content conflicts; foreign resource remains concealed |
| Deleted | Previously deleted UUID in retention window | No recreation | 409 conflict |
| Access | Viewer writes; nonmember reads or writes | No mutation or information leak | 403 for viewer, 404 for nonmember |
| Dates | Required end missing, invalid range, or trip has no start date | No write or date widening | Validation error |
| Read | Trip member requests list | Mapped trip reservations with existing visibility and linked data semantics | Nonmember gets 404 |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/[tripId]/reservations/actions.ts` contains create, update and locked delete; preserve update and record deletion atomically in existing delete.
- `src/app/(app)/trips/[tripId]/reservations/reservation-date-range.ts` holds widening logic; `src/lib/services/days.ts` shows trip and client-ID locking, replay and authorization patterns.
- `src/lib/services/deletion-records.ts` stores recent deleted IDs; `src/lib/db-mappers.ts:dbReservationToType` and `src/lib/queries.ts` define mapping and existing list visibility/attachments.
- `src/lib/validation-schemas.ts:createReservationSchema` and `src/components/arrivo/reservation-type-badge.tsx:REQUIRES_END_AT` define create validation; move the latter to client-safe lib shared by callers.
- `src/app/api/v1/packing-templates/route.ts`, `src/lib/api/contract/packing-templates.ts` show GET/POST wrapper and replay conventions. Next.js backend-for-frontend guide keeps server reads direct.
- `src/components/arrivo/reservation-edit-drawer.tsx` owns create UI; `tests/e2e/steps/reservations.steps.ts` owns save waits.

## Tasks & Acceptance

**Execution:**

- [x] Start with tests: `src/lib/services/reservations.test.ts`, `src/lib/api/contract/reservations.test.ts`, `src/app/api/v1/trips/[tripId]/reservations/route.test.ts`, `src/components/arrivo/reservation-edit-drawer.test.tsx`, and `src/app/(app)/trips/[tripId]/reservations/actions.test.ts`: cover matrix, idempotency and authorization, linked list shape, drawer errors and deleted-ID recording. Move existing create-action cases to service tests.
- [x] `src/lib/reservation-date-range.ts` and colocated test: move existing helper, preserve widening behavior and update imports. `src/lib/reservation-types.ts` and colocated test: move required-end rule; update `reservation-type-badge.tsx` and its test, drawer and remaining action imports.
- [x] `src/lib/services/deletion-records.ts` and `.test.ts`; reservation `actions.ts` and `.test.ts`: add reservation kind and record delete in the locked transaction, alongside file cleanup.
- [x] `src/lib/api/contract/reservations.ts` and `.test.ts`; `src/lib/services/reservations.ts` and `.test.ts`: implement validated GET and create. Lock client ID before trip, recheck access under lock, detect existing ID and compare content before widening; reject deleted IDs, handle concurrent cross-trip IDs without leaking access, map rows and perform side effects only on real changes. Follow existing idempotency transaction and deadline patterns.
- [x] `src/app/api/v1/trips/[tripId]/reservations/route.ts` and `route.test.ts`: wire both methods through `apiRoute`, including POST replay. Remove only the old create action and update its callers/tests.
- [x] `src/components/arrivo/reservation-edit-drawer.tsx` and `.test.tsx`: send stable draft UUID through API, preserving validation, toast, close behavior, labels, keyboard and focus behavior. Verify retries and conflict handling using existing mutation patterns.
- [x] `tests/e2e/features/reservations.feature` and `tests/e2e/steps/reservations.steps.ts`: save through API, await POST and reload production app to confirm persisted reservation. Keep deletion waits. `tests/e2e/feature-map.mjs`: register new runtime files with relevant reservations/API features.
- [x] `docs/api-v1.md`: document both endpoints, body, response, errors and idempotency. Run API-reference parity check.

**Acceptance Criteria:**

- Given an editor and a valid reservation, when the drawer saves and the production app reloads, then the reservation remains visible with its entered details.
- Given a trip member, when GET is called, then it returns the trip's reservations with the existing visibility and mapping semantics.
- Given an authorized create retry, when the same UUID and content are sent again, then one row exists and trip dates and activity change only once.
- Given a deleted reservation ID or insufficient access, when creation is attempted, then the request fails as specified in the matrix without changing the trip.

## Implementation Notes

## Plan Change Log

- Review loop 1: preserve uncertain submissions and reconcile them before accepting edited retries; use the existing browser-safe UUID helper. Add authenticated GET visibility coverage, and normalize offset timestamps for trip widening consistently with stored instants. Avoid duplicate creates and wrong trip dates. KEEP: authorization, transaction locking, deletion retention, direct reads, keyed and same-ID replay, database-backed concurrency and widening tests, and API documentation.

## Review Triage Log

- medium; bad_plan: Direct `crypto.randomUUID` fails on plain HTTP; `createRandomId` provides the existing fallback.
- medium; bad_plan: A successful request with lost response followed by an edited retry conflicts, clears its ID, and a further save can create a duplicate.
- medium; bad_plan: Valid timestamps with offsets cross UTC dates, while widening slices the original string and persisted mapping uses UTC.
- medium; bad_plan: Authenticated GET visibility lacks integration coverage for viewer, editor, and nonmember despite returning sensitive linked expenses.
- Intent alignment: API and drawer are implemented; uncertain drawer responses and observable visibility need stronger end-to-end evidence.

## Verification

- Run targeted Vitest files named above, plus moved helper, type-rule, deletion-record and API-reference tests; expect all to pass.
- Run affected reservation E2E when practical, then invoke `build-validator` after targeted checks. Record its lint, typecheck, build, coverage and affected E2E result here; fix failures and rerun as directed.

- Final validation: lint, TypeScript and production build passed; coverage passed 8,386 tests (97.99% lines, 97.67% functions, 94.03% branches); affected E2E passed 855 scenarios. Review findings were fixed; none deferred.
