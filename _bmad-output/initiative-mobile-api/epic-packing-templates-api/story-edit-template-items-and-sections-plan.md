---
title: "Edit template items and sections"
type: feature
ticket: 4
created: 2026-11-22
status: built
baseline_revision: "5c6dc7accea3d1f5f996fa53ab8cd83d95d7c793"
route: full
route_source: auto
risk: medium
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Template item and section creation, text edits and removal still run as web server actions (`[templateId]/actions.ts`), with no API, replay safety or deletion records.

**Approach:** Add owner-scoped `/api/v1` endpoints for item create (append, before, after), text update, item delete and section removal (delete or ungroup children), and move the editor's callers to them.

## Boundaries & Constraints

**Always:** Story branch `story/6-4-template-items-sections` starts from latest `feature/api-v1`; PR base is `feature/api-v1`, verified before opening; switch back after opening. Tests first. Client mints item IDs; creates and removals are idempotent. Every referenced ID (template, item, `labelId`, `beforeItemId`, `afterItemId`) must belong to a template the caller owns, and a `labelId` must be a section of the same template. Preserve text rules (trimmed, 1–30), ordering, and page refresh. Update `docs/api-v1.md`.

**Never:** Migrate reorder (`reorderTemplateItems`) or change schema. Commit to the integration branch or target main. Reveal foreign ownership.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Append | Owned template, new `id`, text | Item at end, returned | — |
| Before / after | Anchor item in template | Inserted adjacent, later items shift, order persists | — |
| Replay | Same `id` and content | Same item, no write | Different content: 409 |
| Update | Owned item, valid text | Text persisted, item returned | Foreign or missing: 404 |
| Delete item | Owned or already-gone item | 204, row removed | Foreign: 204, no write |
| Remove section | Mode `delete-items` / `move-items-to-ungrouped` | Section gone; children deleted or ungrouped | Non-section: 404 |
| Foreign reference | `labelId`, anchor or `id` in another template or owner | Rejected, nothing written | 404 or 422 as for trip packing |
| Replay after delete | Create replay for removed item or section child | Not resurrected | 409 |

</frozen-after-approval>

## Code Map

- `src/app/(app)/packing/[templateId]/actions.ts` -- current add/update/remove/removeSection logic and error text to port; leave `reorderTemplateItems` and its helpers.
- `src/lib/services/packing.ts` (`createPackingItem`, `removePackingSection`) -- model for anchor insertion, client-id locks, deletion records.
- `src/lib/services/packing-template-items.ts` (new, with colocated test) -- item services; `packing-templates.ts` is 242 lines, keep it untouched. Reuse `lockClientIds`, `withIdempotency`, `guardTransactionDeadline`, `lockPackingTemplateForUpdate`, `dbTemplateItemToType`.
- `src/lib/api/contract/packing-templates.ts` -- add four endpoints; text limit is `FIELD_LIMITS.packingItemText`.
- `src/lib/services/deletion-records.ts` (+ `.test.ts`) -- add a `packing-template-item` resource and message.
- `src/app/api/v1/packing-templates/[templateId]/items/route.ts`, `src/app/api/v1/packing-template-items/[itemId]/route.ts`, `.../[itemId]/section/route.ts` -- new routes, each with `route.test.ts`; follow `[templateId]/route.ts` (`idempotent: {}`).
- `src/app/(app)/packing/[templateId]/page-client.tsx` -- migrate with `useApiMutation` as the rename already does; `crypto.randomUUID()` for new IDs; keep `isAdding` and toasts.
- `tests/e2e/features/api.feature`, `tests/e2e/steps/api-packing-templates.steps.ts` -- HTTP scenarios; `template-items.feature` keeps the UI flows.
- `tests/e2e/feature-map.mjs` -- map new routes to `api` and `template-items`; `docs/api-v1.md`.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/api/contract/packing-templates.test.ts`, `src/lib/services/packing-template-items.test.ts` (new), `src/lib/services/deletion-records.test.ts`, three new `route.test.ts` -- failing tests for the matrix first (order, replay, foreign refs, both removal modes, deletion records).
- [ ] `src/app/(app)/packing/[templateId]/page-client.test.tsx` -- API calls, refresh, failure toasts, section-removal rejection rethrow.
- [ ] `tests/e2e/features/api.feature` + `api-packing-templates.steps.ts` -- scenario-owned fixtures for insertion order, replay, removal modes, foreign rejection; confirm `template-items.feature` still covers UI flows.
- [ ] Contract, deletion-record resource, services and routes -- implement under the template lock inside one transaction.
- [ ] `[templateId]/actions.ts` and `actions.test.ts` -- drop migrated actions and tests; update the page client.
- [ ] `docs/api-v1.md`, `tests/e2e/feature-map.mjs` -- document; map the new service file and routes to `api` and `template-items`.

**Acceptance Criteria:**

- Given an owned template, when items are added at the end, before and after anchors, then reload shows the order sent.
- Given an item edit or removal, when reloaded, then the change persists; a retried create returns one item.
- Given a section, when removed with each mode, then children are deleted or moved to ungrouped.
- Given another owner's template or item IDs in any field, when sent, then nothing changes and ownership stays hidden.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Failed-create retry reuses id after 409 | low | reject | Id is a fresh random UUID retried only with identical details; a 409 on it is unreachable. Fix adds branching. |
| isAdding stuck after lost-response replay | false | reject | useApiMutation calls router.refresh after every success, replay included. |
| Replay ignores a different anchor | low | reject | Same-id replay returns the stored row by design. |
| Anchor in other section than labelId | medium | defer | Old action had the same flaw; not caused by this change. |
| Position gaps after delete | low | reject | Gaps harmless; ordering is by position. |
| Foreign id 404 vs fresh id 200 | false | reject | Matrix allows 404 or 422 for foreign id. |
| Keyed replay skips deletion check | false | reject | Standard idempotent replay of the original response. |
| No onAuthLost on edit/delete | false | reject | Hook redirects to sign-in itself; onAuthLost is optional. |
| isLabel with labelId rejected in UI | false | reject | Section add form sends no labelId. |
| Item DELETE on a section untested | medium | patch | FK set null is real; added api.feature scenario. |
| Missing update/remove failure tests, mock fallback, route test style, docs detail, plan artifact, stale e2e steps | low/false | reject | Hook-level toasts covered elsewhere; template-items e2e passed 10/10; rest negligible. |

## Design Notes

Foreign item DELETE returns 204 like template delete (no ownership signal); PATCH, section on a non-section and unknown anchors return errors. Shift positions with `gte`/`gt` inside the locked transaction so the table stays gap-free.

## Verification

**Commands:**

- `npx vitest run src/lib/services/packing-template-items.test.ts src/lib/services/deletion-records.test.ts src/lib/api/contract/packing-templates.test.ts "src/app/(app)/packing" src/app/api/v1/packing-template-items src/app/api/v1/packing-templates` -- expected: pass
- `npm run test:e2e:affected` -- expected: pass
- `build-validator` after targeted tests pass.
