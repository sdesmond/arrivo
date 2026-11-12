---
title: "Upload event and reservation documents through the API"
type: feature
ticket: "2"
created: "2026-11-12"
status: built
baseline_revision: "c24c82c8df3ce59e343b86c7ce9c194ac50dfe05"
route: full
route_source: auto
risk: medium
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Event and reservation document uploads still use server actions. Reservation uploads omit live sync, and neither flow has client-id replay.

**Approach:** Extend story 3.1's document service and multipart contract with POST `/api/v1/events/:eventId/documents` and `/api/v1/reservations/:reservationId/documents`; migrate both upload dialogs and retire their upload actions. Branch `story/3-2-event-reservation-document-uploads`; PR base `feature/api-v1`.

## Boundaries & Constraints

**Always:** Editor authorization before storage; resolve target's owning trip and recheck target existence/ownership under trip lock. Claim `document:<id>` before trip lock. Return mapped `Document`; apply upload policy and storage adapter; run changed writes through `runTripWrite`/`afterTripWrite`. Replay requires same trip, target scope, name, kind and size; emits no effects. Preserve trip upload behavior. Browser retries retain client id for same pending file/target until success. Use existing `useApiMutation` for refresh, errors and auth loss.

**Never:** Multipart Idempotency-Key, new migrations/env variables, cover/rename/delete/attachment migration, cleanup fairness work, new transport abstraction, direct storage imports. Existing document-picking actions remain.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Result | Error |
| --- | --- | --- | --- |
| Upload | Editor, valid file, real target | 200; one scoped document/file; activity, sync, refresh after commit | — |
| Retry | Same id, target and metadata | Existing row; discard new file; no extra effects | — |
| Conflict | Same id, different scope/metadata | Discard new file; no insert | 409 |
| Hidden id | Id belongs to inaccessible trip | Never disclose row; discard new file | 404 |
| Target/access | Missing/foreign target; viewer | No storage or row | 404; 403 |
| Invalid | linked-* event id, invalid UUID, missing file | No storage or row | 422 |
| Policy | >25 MB; disallowed/mismatched type | No storage or row | 413; 422 |
| Storage/insert failure | Adapter put or DB insert fails | No row; discard file on rollback; retain file if effects fail after commit | 500 |
| Cross-site | Missing client header/foreign origin | No write | 403 |

</frozen-after-approval>

## Code Map

- `src/lib/services/documents.ts` — trip uploader owns policy, client-id locks, replay and cleanup; extend shared internals for event/reservation scope without duplicating storage lifecycle. `events.ts` demonstrates target re-read under trip lock; `trip-write-effects.ts` already publishes ItineraryChanged.
- `src/lib/api/contract/documents.ts` — add two UUID-target multipart contracts; reuse existing max bytes and optional client id. New routes live in `src/app/api/v1/events/[eventId]/documents/route.ts` and `src/app/api/v1/reservations/[reservationId]/documents/route.ts`, built with `apiRoute`.
- `src/components/arrivo/add-doc-dialog.tsx`, `add-reservation-doc-dialog.tsx` — existing client dialogs, explicit Props interfaces, upload and pick modes; migrate upload only. Preserve dialog Escape/focus handling, keyboard file chooser, labels and 44px targets. Both contain fewer than 250 JSX lines; no component extraction needed.
- `src/components/arrivo/trip-docs-tab.tsx` — client-id retry and mutation-hook pattern to reuse.
- `src/app/(app)/trips/[tripId]/document-upload-actions.ts` — delete final event upload action/module; remove wrapper/import from `actions.ts`. Reservation action module retains four non-upload actions.
- `tests/e2e/steps/api-documents.steps.ts` — multipart HTTP fixtures and policy cases from 3.1; extend using scenario-owned mothers.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: extend `src/lib/services/documents.test.ts` and `src/lib/api/contract/documents.test.ts`; add colocated `route.test.ts` beside each new route. Cover matrix for both scopes, target disappearing/changing during upload, sibling-scope conflicts, trip-upload regression, cleanup and one post-commit effect including reservation live sync.
- [x] Update `src/components/arrivo/add-doc-dialog.test.tsx`; create `src/components/arrivo/add-reservation-doc-dialog.test.tsx`: successful multipart upload/close, error keeps dialog and pending file, same-id retry, new file/target gets new id, pending disables repeat submission, invalid file rejected locally, auth-loss handling, existing pick flow unchanged.
- [x] Extend contracts/service, create routes, migrate dialogs; remove old upload actions/wrapper and obsolete upload tests from `document-upload-actions.test.ts` and `reservations/reservation-document-actions.test.ts`. Remove stale mocks wherever search finds them.
- [x] Extend `tests/e2e/features/api.feature` and `steps/api-documents.steps.ts`: each route's success, replay, viewer, stranger, policy and cross-site cases. Extend `features/event-docs.feature`, `features/reservations.feature` and matching `steps/event-docs.steps.ts`, `steps/reservations.steps.ts`: upload persists after reload. Replace waits for touched uploads with armed `waitForApiResponse`; leave waits for surviving actions.
- [x] Update `tests/e2e/feature-map.mjs`: both routes and document service map to api, event-docs, reservations and existing documents consumers.

**Acceptance Criteria:**

- Given editor access, when each dialog uploads then reloads, then file remains attached to intended event/reservation.
- Given a failed response, when same upload retries, then client id stays stable and only one document remains.
- Given successful reservation upload, when transaction commits, then activity, live sync and revalidation fire once.
- Given retired upload actions, when searched, then no callers or wrappers remain.

## Implementation Notes

- Implementation revision: `247412745fd08e5c4d771958761fc52fdd378dc9`.

- Both scoped uploads reuse the trip uploader lifecycle; retired upload actions removed, pick actions retained.
- Matrix audit: upload/replay/conflict/hidden-ID/access/invalid/policy/cross-site cases passed in focused API E2E; storage, rollback, effects failure and target races passed in parameterized service tests. Root rerun: 100 targeted tests passed across seven files.
- Focused E2E: 28 scoped API cases plus event and reservation upload reload checks passed. Reservation live-sync refresh may collapse its section; reload check explicitly expands it.

## Plan Change Log

## Review Triage Log

- B1 — medium, defer: formatted-size replay identity permits byte-size rounding collisions. Shared uploader already used formatted size before this change; preserving story 3.1 behavior introduces no new identity policy.
- B2 — false: replay contract explicitly compares document kind, not exact MIME or bytes. Image MIME variants sharing kind satisfy that stated identity.
- B3 — medium, defer: file chooser can change selection while earlier upload completes and closes dialog. Same enabled chooser and unconditional success close existed in both server-action dialogs before migration.
- B4 — medium, defer: cancel/reopen during pending upload can receive stale close callback. Existing dialog code already closed unconditionally after awaiting upload; migration preserves this behavior.
- B5 — medium, defer: existing picker and upload can both commit when switching modes during pending request. Enabled picker/mode controls and asynchronous close existed before this change.
- B6 — medium, defer: reservation deletion enumerates files without shared trip lock, so concurrent upload can leave an orphan. Previous reservation uploader likewise inserted without coordinating deletion; new locked uploader does not create this race.
- B7 — medium, patch: concurrent same-id behavior lacks real-DB scoped coverage. Add concurrent requests with one row/file and replay identity assertions.
- B8 — low, patch: real-DB conflicts lack cross-target/scope checks. Add direct cases retaining original attachment and cleaning losing uploads.
- B9 — low, patch: target-validation E2E replaces fixture target, weakening storage assertions and cleanup. Preserve fixture target independently of requested target.
- B10 — low, patch: scoped routes omit existing early-body-limit, strict-field and keyed multipart E2E cases. Add matrix rows using existing request helpers.
- V1 — medium, patch: removed reservation upload test verified image MIME despite misleading PDF filename. Restore valid PNG classification coverage through both scoped services.
- I1 — false: receiving-client live-sync observation is a surface difference, not demonstrated defect; unchanged event consumer receives shared ItineraryChanged producer event.
- I2 — false: integrated lost-response browser retry is not directly exercised, but component ID retention and real HTTP replay separately verify required behavior; no contrary behavior established.
- I3 — false: byte identity and retry across closed dialog sessions are not promised. Intent and contract define metadata replay within pending file/target attempt.
- I4 — false: branch verified directly as story/3-2-event-reservation-document-uploads; no PR operation requested or performed, so PR-base verification is pending any future PR creation.

## Verification

- Review patches completed: valid PNG classification, immutable fixture targets, all shared multipart policy cases, concurrent replay, cross-target/scope conflicts. Service tests: 30 passed; focused scoped API: 40 passed plus auth.
- First affected run: 517 passed, one picker selector regression; corrected dialog-close wait and exact provider-button locator. Reservation feature: 13 passed.
- Final validator: lint, TypeScript, production build PASS; 7,599 tests PASS; coverage lines 97.95%, functions 97.54%, branches 93.85%; affected E2E 518 PASS. TypeScript was rerun after build to avoid generated-type replacement race.
- All review patch findings resolved; four pre-existing concerns recorded in deferred-work.md.


- Run targeted Vitest files listed above before broad validation; include surviving action tests.
- Run feature-map contract tests and affected upload E2E coverage using scenario-owned fixtures and API waits.
- Invoke build-validator after final implementation: lint/TypeScript/build, then coverage alone, then affected E2E alone. Never auto-run full E2E.
