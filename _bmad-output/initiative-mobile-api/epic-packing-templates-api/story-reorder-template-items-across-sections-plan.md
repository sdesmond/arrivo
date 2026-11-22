---
title: "Reorder template items across sections"
type: feature
ticket: 5
created: 2026-11-22
status: built
baseline_revision: "1b8143703b53ee803d42f28eaa7030b92a820505"
route: full
route_source: auto
risk: medium
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 1
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dragging template items still runs the web server action `reorderTemplateItems` (`[templateId]/actions.ts`). It silently skips unknown IDs, has no replay safety, and accepts a partial or stale list.

**Approach:** Add an owner-scoped `PUT /api/v1/packing-templates/:templateId/order` that replaces the template's complete order and section assignments atomically, mirroring trip `packing/order`, and move the editor's drag caller to it.

## Boundaries & Constraints

**Always:** Story branch `story/6-5-reorder-template-items` starts from latest `feature/api-v1`; PR base is `feature/api-v1`, verified before opening; switch back after opening. Tests first. Body includes desired `items: [{ id, labelId }]` and `expectedItems: [{ id, position, labelId }]` representing the last confirmed server snapshot; desired position is the array index. Validate the whole list before writing; one transaction under the template lock. Ownership failures are 404 and never reveal foreign templates. Keep optimistic UI rollback and failure toast. Update `docs/api-v1.md`.

**Never:** Change schema. Commit to the integration branch or target main. Touch trip packing order. Keep `reorderTemplateItems` or its helpers after migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Reorder within / across sections | Every stored ID once, valid `labelId`s | Positions and sections persist; body returned | — |
| Concurrent change | Same IDs but stored position or section changed since the submitted snapshot | Original order intact | 409 `conflict` |
| Same order again | Order already stored | Quiet success, no write | — |
| Replay | Same `Idempotency-Key` and body | Stored response, no write | — |
| Missing, extra or foreign ID | List differs from stored set | Original order intact | 409 `conflict` |
| Duplicate ID | An ID twice | Nothing written | 422 |
| Bad label | `labelId` not a section of this template (foreign, non-section, or the item itself) | Nothing written | 422 |
| Foreign or missing template | Another owner's or unknown template | Nothing written | 404 |

</frozen-after-approval>

## Code Map

- `src/lib/services/packing.ts` (`applyPackingOrder`, `reorderPackingItems`) -- model: exact-set check to `ConflictError`, label check to `ValidationFailedError`, skip unchanged rows.
- `src/lib/api/contract/packing.ts` (`reorderPackingItems`) -- model for body schema and unique-ID refine; template creation has no corresponding 1000-item limit.
- `src/lib/api/contract/packing-templates.ts` -- add `reorderPackingTemplateItems` (PUT, `templateParams`) without imposing an item count lower than the creation path allows; add its response type beside `PackingItemOrder` in `src/data/types.ts`.
- `src/lib/services/packing-template-items.ts` -- add service reusing private `lockOwnedTemplate`, `withIdempotency`, `guardTransactionDeadline`, `revalidatePath`; do not touch other functions.
- `src/app/api/v1/packing-templates/[templateId]/order/route.ts` (new) -- follow `.../items/route.ts` (`idempotent: {}`).
- `src/app/(app)/packing/[templateId]/page-client.tsx` -- `handleReorderItems` to `useApiMutation`; drop `useTransition` if unused. Map `ordered` to `{ id, labelId }`.
- `src/app/(app)/packing/[templateId]/actions.ts` + `actions.test.ts` -- remove reorder action and tests (file likely empties; delete it and its mocks in `page-client.test.tsx`).
- `tests/e2e/features/template-items.feature` (drag scenario exists), `api.feature` + `tests/e2e/steps/api-packing-templates.steps.ts` -- API scenarios.
- `tests/e2e/feature-map.mjs` -- `src/app/api/v1/packing-templates/*/order/**` is covered by existing `packing-templates/**` globs; verify with `feature-map.test.mjs`. `docs/api-v1.md` Ordering section.

- `src/components/arrivo/template-editor-view.tsx`, `packing-list-sortable.tsx`, `packing-list-row.tsx` and section row callers -- expose accessible drag disabled state while an order is unresolved; preserve other controls and keyboard accessibility.
- `src/lib/api/use-api-mutation.ts` -- `isPending` and refresh behavior; on conflict refresh the server snapshot and prevent new drags until it arrives.

## Tasks & Acceptance

**Execution:**

- [x] Extend `packing-templates.test.ts`, `packing-template-items.test.ts`, `order/route.test.ts` and `tests/e2e/features/api.feature` with matching steps: two snapshots with identical IDs but changed positions or section; stale PUT returns 409 and preserves winner, replay succeeds despite changed snapshot, gaps/ties in positions are compared exactly.
- [x] Extend `page-client.test.tsx`, `template-editor-view.test.tsx`, `packing-list-sortable.test.tsx`, `packing-list-row.test.tsx` and `tests/e2e/features/template-items.feature` with matching steps: prevent overlapping pointer/keyboard drags, retain rollback/toast on failure and auth loss, refresh after conflict, then permit drag with fresh baseline.
- [x] Contract, service and editor: compare expected snapshot under lock before writes, after replay lookup; maintain confirmed snapshot across successes, block concurrent drags synchronously until mutation and any conflict refresh complete. Keep other edits available and ensure accessible disabled state.

- [x] `src/lib/api/contract/packing-templates.test.ts`, `src/lib/services/packing-template-items.test.ts`, new `order/route.test.ts` -- failing tests for the matrix first (within/across sections, no-op, replay, stale/foreign/duplicate IDs, bad labels, foreign template; original order intact on each rejection).
- [x] `src/app/(app)/packing/[templateId]/page-client.test.tsx` -- API call shape, rollback and toast on failure.
- [x] `tests/e2e/features/api.feature` + steps -- scenario-owned fixture: reorder across sections, reload, rejected stale/foreign list leaves order; keep UI drag scenario in `template-items.feature`.
- [x] Contract, type, service, route -- implement under the template lock in one transaction.
- [x] `page-client.tsx`, `actions.ts`, `actions.test.ts` -- migrate caller, remove the action.
- [x] `docs/api-v1.md` -- document endpoint, 409/422 cases.

**Acceptance Criteria:**

- Given a template with sections, when an item is dragged within and across sections, then reload shows the new order and section.
- Given a list with a duplicate, missing, extra or foreign ID, or a foreign label, when sent, then the stored order is unchanged.
- Given another owner's template, when sent, then the answer is 404 and nothing changes.

## Implementation Notes

## Plan Change Log

- Review identified same-membership stale snapshots and overlapping drags; user chose conflict detection. Require exact position/section preconditions and prevent overlapping drags. Preserve atomic ID validation, replay, ownership, rollback, and existing successful tests.

## Review Triage Log

- Intent alignment: medium, intent gap; identical-ID stale snapshot previously overwrote newer order. User chose conflict detection.
- Blind and edge: medium, bad plan; overlapping drags may commit out of order; revised plan prevents concurrent drags.
- Blind: medium, bad plan; same-membership stale change not detected; revised plan adds exact precondition.
- Blind: medium, verification gap; failure toast assertion removed; revised tests cover it.
- Gap: medium, patch; authentication-loss rollback not exercised; revised tests cover it.
- Blind: medium, verification gap; HTTP invalid bodies not exercised; add contract/service/route coverage for matrix.
- Blind: medium, bad plan; overlapping failure can roll back newer state; revised plan prevents overlapping drags.
- Blind: medium, bad plan; template creation has no 1000-item limit, so the prior reorder limit prevents large templates from being reordered. Cover and remove that mismatch.
- Blind: maybe-false, deferred; arbitrary section ordering may display differently; inspect existing ordering semantics before implementation.


Second review:
- Medium, patched: recovery now fetches an authoritative snapshot, remains locked through unrelated refreshes, and offers retry after a failed fetch.
- Medium, patched: uncertain reorder failures reconcile the server state; ordinary failure toast is tested.
- Medium, patched: invalid-ID E2E uses a current snapshot, and pending-drag E2E attempts both pointer and keyboard input.
- Low, deferred: a noncanonical section ordering can be accepted and grouped differently by the existing editor; the canonical drag caller supplies grouped ordering. Further API ordering semantics need separate investigation.
- Low, deferred: very large templates may hit transaction deadline due to per-item updates; no observed failure at an established supported size.
- False: same-membership stale snapshots are rejected by exact position and section comparison under lock; reverting to identical state leaves no conflicting current order.
## Design Notes

Whole-list replace (not move-one) matches trip packing, so the web and phone clients share one ordering semantic and a stale view gets 409 instead of overwriting another session's edit.

## Verification

**Commands:**

- `npx vitest run src/lib/services/packing-template-items.test.ts src/lib/api/contract/packing-templates.test.ts "src/app/(app)/packing" src/app/api/v1/packing-templates` -- expected: pass
- `npm run test:e2e:affected` -- expected: pass
- `build-validator` after targeted tests pass.
