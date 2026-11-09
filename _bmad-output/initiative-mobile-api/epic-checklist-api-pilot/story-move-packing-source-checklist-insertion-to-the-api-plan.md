---
title: "Move packing-source checklist insertion to the API"
type: feature
ticket: 7
created: "2026-11-09"
status: built
baseline_revision: "402f554fa67b0dc507dbe19dced20565ca0409e1"
route: full
route_source: auto
risk: high
review: "thorough"
review_source: "auto"
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Packing-source checklist insertion still calls a server action, bypassing the checklist API.

**Approach:** Extend checklist creation with a packing source; migrate the packing handler and retire only its migrated action. Preserve authorized, ordered, atomic copies and refresh behavior.

## Boundaries & Constraints

**Always:** Branch `story/1-7-packing-source-checklist-api`; PR base `feature/api-v1`. Tests first. Reuse services/mappers/locks/replay/effects. Authorize source/target before replay/collisions. Preserve source text/title/order, unchecked items, empty sources and accessibility.

**Never:** Add migrations, columns/env, unrelated migration, broad cleanup or changelog edits. Push requires authorization. Return to integration after PR; pull before next story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Create | POST `/api/v1/trips/:tripId/checklists`, `{dayId,position,id?,source:{type,id}}`; `template` or `packing-list` | Source title; ordered unchecked non-label items | Invalid 422; source excludes title/firstItem |
| Empty source | Empty or label-only source | Titled empty checklist at requested mixed timeline position | No item insert |
| Access | Foreign/missing template, wrong-trip list/day, revoked role | No mutations | 401 unauthenticated; 403 viewer; 404 concealed source/ancestry |
| Retry | Client UUID; optional Idempotency-Key | Matching UUID content returns row; keyed replay returns original; effects once | Conflicting UUID/key 409; inaccessible collision concealed; reauthorize source before replay |
| Failure | Item insert, replay record or commit fails | Header/items/position shifts roll back together | No success effects |
| Refresh | Slow props, failure, missing day | Marker lasts until checklist appears; API errors; missing day no-op | No marker on failure/auth loss |

</frozen-after-approval>

## Code Map

- `src/lib/services/checklists.ts`: extend `createChecklist`, UUID locks/comparison, `withIdempotency`, mixed shifts and `afterTripWrite`.
- `src/app/(app)/trips/[tripId]/actions.ts:863`: migrate source reads into transaction. Templates must belong to actor; lists to target trip.
- Same folder `use-packing-handlers.ts`: expansion marker; use `useApiMutation` for errors/auth/refresh without duplicate toasts.
- Items sort by `createdAt` (`mappedChecklist`, `src/lib/queries.ts`). Batch timestamp ties lose source order; ensure durable ordering compatible with later appends.
- Preserve story 1.6 item queues/optimism and unrelated legacy exports/mocks.

## Tasks & Acceptance

**Execution:** Full route, over 100 lines. Tests first. Read bundled Next.js route/use-router docs before editing.

- [ ] `src/lib/api/contract/checklists.test.ts`, then source: both sources, UUID normalization, strict exclusive variants; existing creates remain valid.
- [ ] `src/lib/services/checklists.test.ts`, then source: matrix, source reauthorization, label exclusion, empty sources, mixed positions, rollback, UUID conflicts and effects once. Preserve stored text without new caps. Verify persisted order and later appends.
- [ ] `src/app/api/v1/trips/[tripId]/checklists/route.test.ts`: source/actor/replay forwarding; change route only if required.
- [ ] New `src/app/(app)/trips/[tripId]/use-packing-handlers.test.tsx`, then hook: generated checklist UUID, both payloads, missing day, delayed marker, failure/auth and refresh. Update same-folder `use-trip-detail-handlers.test.tsx` API delegation/marker test.
- [ ] Same folder `actions.test.ts`, then `actions.ts`: retire migrated source tests/export/imports; preserve other actions.
- [ ] `tests/e2e/features/packing-lists.feature` and `tests/e2e/steps/packing-lists.steps.ts`: template labels/order/reload; same-trip list and empty-source cases. Scenario-owned fixtures; arm exact POST wait before gesture, await before reload.
- [ ] `tests/e2e/features/api.feature` and `tests/e2e/steps/api.steps.ts`: UUID/key replay, foreign-template and wrong-trip list/day rejection with unchanged rows/positions. Reuse mothers; any fixture extensions require `tests/e2e/scenario-fixture.spec.ts` first.
- [ ] `scripts/feature-map.test.mjs`, then `tests/e2e/feature-map.mjs`: register packing handler/contract under packing-lists and assert service/route ownership.

**Acceptance Criteria:**

- Given authorized source, when inserted and reloaded, then title, unchecked contents and order persist, including empty sources.
- Given denied access, conflict or failure, when creating, then no unauthorized data, duplicate or partial mutation persists.
- Given delayed props, when creation succeeds, then expansion marker lasts until server data arrives.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Lens | Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- |
| edge-case | `crypto.randomUUID()` undefined on plain-HTTP self-hosted | medium | patch | `use-packing-handlers.ts:223` calls it directly and throws before `mutate` runs; `src/lib/utils.ts` `createRandomId` exists for exactly this. Old action generated the id server-side, so this is a regression. |
| blind | Client-UUID comment claims retry idempotency, but a fresh UUID is minted per call | low | patch | Comment overstates; fix is a comment correction. |
| blind, edge | Double click mints two UUIDs and creates two checklists | low | defer | Old server action had no in-flight guard either; pre-existing. |
| blind | `packed` closure can be undefined in `mutate` | false | rejected | `withIdempotency` awaits `authorize` before `mutate` on every path (`idempotency.ts:127,136`). |
| blind | Verbatim text can exceed caps, empty title | false | rejected | Plan and intent require preserving source text with no new caps. |
| blind, edge | No cap on copied item count | low | rejected | No named harm; fix adds a branch and new public error. |
| blind | Stored create not replayed once source is gone | false | rejected | Matrix: reauthorize source before replay; deliberate. |
| blind, edge | Live-sync event dropped with the action | false | rejected | `afterTripWrite` publishes `ItineraryChanged`, records activity, revalidates; service tests assert it runs once. |
| blind | Header and items read non-atomically | low | rejected | Templates are single-owner; fix needs row lock. |
| blind | OpenAPI/docs and `.refine` schema shape | false | rejected | Verification-gap grep: nothing reads the body schema shape; no endpoint docs list. |
| blind | Seed helpers duplicated, bypass mothers | low | rejected | Baseline steps already insert packing lists via `withE2EDb`; template uses a mother with overrides. |
| blind | Keyed scenarios could pass vacuously | low | rejected | Unlikely; fix adds a guard branch to tests. |
| blind | Brittle test selectors/SQL-string assertion | low | rejected | Cosmetic. |
| blind | Feature map misses `api` tag | false | rejected | `feature-map.mjs:65-67`: `src/lib/api/**` and service under `api`. |
| edge | Matching-UUID retry 409 after source edit or checked item | false | rejected | Matrix: matching content returns row, mismatch 409; same as `firstItem`. |
| edge | Legacy writer using default `now()` could sort before copies | maybe-false | rejected | No such writer found; would be low. |
| intent | 422 not asserted at HTTP level; rollback only mocked | low | rejected | Contract and service tests cover validation; plan did not require HTTP/real-rollback tests. |
| verification-gap | No gaps | n/a | n/a | n/a |

## Verification

Run named Vitest suites, `src/lib/api/handler-coverage.test.ts`, feature-map tests and focused E2E. Then project-owned `build-validator`: lint/types/build, coverage alone, affected E2E alone. No automatic full E2E.

## Plan Review

All five checks PASS; zero blockers/warnings. Scope: story 1.7 only. Contract/service tests named. Hook: 241 lines, no JSX; no presentation changes. Existing fixture `.spec.ts` covers extensions.
