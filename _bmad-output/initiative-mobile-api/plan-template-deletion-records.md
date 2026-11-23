---
title: "Record packing template deletions so a late create cannot bring a template back"
type: "bugfix"
ticket: ""
created: "2026-11-23"
status: "built"
baseline_revision: "21064866"
route: "full"
route_source: "retrospective"
risk: "medium"
review: "standard"
review_source: "retrospective"
lenses_ran: []
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md, _bmad-output/initiative-mobile-api/epic-packing-templates-api/epic-packing-templates-api-retrospective.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Retrospective finding F1 (epic 6). `createPackingTemplate` and `savePackingListAsTemplate` accept a client UUID, but `deletePackingTemplate` leaves no deletion record and `deletion-records.ts` has no `packing-template` resource. A create retried with that id after the delete (no `Idempotency-Key`, or a key past its replay window) inserts a fresh template under the deleted id. Trips, lists, packing items and template items already return 409 in that case. This is the one epic 6 resource that does not.

**Approach:** Add the `packing-template` resource to `deletion-records.ts`. Record the id inside the delete transaction. Refuse a recently deleted id in both create paths, after the existing-row check and before the insert, as `createPackingTemplateItem` does. Also record the ids of the template items the delete cascades, so an item create cannot reuse them under another owned template. Document the 409 and add the tests listed below.

**Test intent:** A create or a selected-list save with a just-deleted template id returns 409 and writes nothing. A delete records the template id and its item ids. A same-id retry of a live template, a keyed replay after deletion (still 404), and a delete of a missing or foreign template are unchanged.

## Boundaries

**Always:** Record inside the deleting transaction, so the record commits or rolls back with the delete. Check `refuseRecentlyDeleted` only when no row holds the id, so a same-id retry of a live template still returns the row. Keep the 24-hour window from `IDEMPOTENCY_RETENTION_MS`. Branch workflow: base `feature/api-v1`; build on a branch from the latest `feature/api-v1`; open the PR into `feature/api-v1`, not `main`; switch back to `feature/api-v1` after opening it.

**Never:** No schema change or migration (records are `idempotency_keys` rows, as for other resources). No change to keyed-replay behavior (`validateReplay` still returns 404 after deletion). No record for a delete that matched no row. No new contract fields or endpoints.

## Impact

**Contract:** `docs/api-v1.md`. Add to `POST /api/v1/packing-templates` and `POST /api/v1/packing-lists/:listId/template`: the `id` of a template deleted within the last 24 hours returns 409 `conflict` and creates nothing. Add to `DELETE /api/v1/packing-templates/:templateId`: the template id and its items' ids are not recreated for 24 hours. `api-reference.test.ts` does not check field details, so edit by hand.

**Coverage:** `deletion-records.ts` maps to several features in `tests/e2e/feature-map.mjs` (line 128 and others), so the affected E2E run includes each of them plus the template features.

</frozen-after-approval>

## Code Map

- `src/lib/services/deletion-records.ts` — add `"packing-template"` to `DeletionRecordResource` and a message in `DELETED_MESSAGES`: "This template was deleted. Create it again to start a new template."
- `src/lib/services/packing-templates.ts` — `createPackingTemplate.mutate` (after the `existing` branch, before the insert); `savePackingListAsTemplate.mutate` (after the `existing` branch, before reading items); `deletePackingTemplate` (select the template's item ids, delete, then record the template id and item ids when a row was deleted).
- `src/lib/services/packing-templates.test.ts` — mocked-transaction tests; the `deleteReturning` and `selectResults` queue pattern is already there.
- `src/lib/services/deletion-records.test.ts` — existing resource cases; add `packing-template` the same way as its siblings.
- `tests/e2e/features/api.feature` — near "Deleted templates stay deleted on keyed replay" (~line 2953) and "Saved template replay after deletion stays deleted" (~line 2965).
- `tests/e2e/steps/api-packing-templates.steps.ts` — new steps go here, not in `api.steps.ts` (retrospective F3). The "Saved template" scenario's steps live in `api.steps.ts`; reuse them and add only the unkeyed-retry step.
- `docs/api-v1.md` — lines ~476-482, ~502-506, ~540-546.

## Tasks & Acceptance

**Execution (tests first):**

- [ ] `src/lib/services/packing-templates.test.ts` — add failing tests: create with a recently deleted id rejects with `ConflictError` and does not insert; same for `savePackingListAsTemplate`; `deletePackingTemplate` records `packing-template` for the id and `packing-template-item` for its item ids when a row is deleted, and records nothing when no row is deleted; a same-id retry of an existing template does not call `refuseRecentlyDeleted`.
- [ ] `src/lib/services/deletion-records.test.ts` — add the `packing-template` case.
- [ ] `tests/e2e/features/api.feature` and `api-packing-templates.steps.ts` — add two scenarios: (1) create a template, delete it, create again with the same id and no key, expect 200, 204, 409 and no row; (2) save a list as a template, delete it, save again with the same id under a fresh key, expect 200, 204, 409 and no row.
- [ ] `src/lib/services/deletion-records.ts`, `src/lib/services/packing-templates.ts` — implement until the tests pass.
- [ ] `docs/api-v1.md` — document the 409 and the delete behavior.
- [ ] Run `npx vitest run src/lib/services/packing-templates.test.ts src/lib/services/deletion-records.test.ts src/lib/api`, then `npm run test:e2e:affected`, then `build-validator` once.

**Acceptance Criteria:**

- Given a template deleted within 24 hours, when a create or selected-list save sends its id, then the response is 409 `conflict` and no template or item rows exist.
- Given a live template, when the same id and name are sent again, then the current row returns and nothing is written (unchanged).
- Given a keyed create or rename replayed after deletion, when it is sent, then the response is still 404 (unchanged).
- Given an owned template with items, when it is deleted, then the template id and each item id have a deletion record in the same transaction.
- Given a delete that matches no row (missing or foreign), then it returns 204 and records nothing.

## Design Notes

Item ids are recorded too, one extra select, because item creates are accepted under any owned template: after the owner deletes template A, a late item create with one of A's item ids sent to template B would otherwise insert it. Template item creates already refuse recorded ids, so only the delete needs to record them. This is the same shape epic 5 used for trip children. If the select proves a problem for very large templates, fall back to recording only the template id and note the gap in `deferred-work.md`; do not skip the template record.

## Implementation Notes

- The mocked transaction in `packing-templates.test.ts` serves `select().from().where()` from the `selectResults` queue, empty by default, so the new item-id select returns `[]` in the existing delete test (`refreshes the library when an owned template is deleted`) and needs no change. The new record test queues `[{ id: itemId }]`.

## Plan Change Log

## Review Triage Log

## Verification

**Commands:**

- `npx vitest run src/lib/services/packing-templates.test.ts src/lib/services/deletion-records.test.ts src/lib/api` — expected: pass
- `npm run test:e2e:affected` — expected: pass, including the two new `api.feature` scenarios
- `build-validator` skill — expected: PASS; record the result and counts here

- Result (2026-11-23, `fix/template-deletion-records`): lint, tsc and production build pass. Coverage: 505 files, 8,390 tests; lines 98.08%, functions 97.65%, branches 94.17%. Affected E2E (`@feat:api`, `documents`, `event-docs`, `reservations`, `save-trip-as-template`, `template-reuse`, `templates`): 755 passed, including the two new `api.feature` scenarios. The save-template scenario's steps sit in `api.steps.ts` because `sendSaveTemplate` is private to it.
