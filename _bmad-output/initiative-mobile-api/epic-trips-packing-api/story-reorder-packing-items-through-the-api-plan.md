---
title: "Reorder packing items through the API"
type: feature
ticket: 2
created: 2026-11-19
status: done
baseline_revision: "e3cb0e916cd79343896fc510c1c190d12fa2d3b7"
route: full
route_source: auto
risk: high
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Packing drag-reorder uses a server action that accepts partial or stale lists and overwrites another editor's changes.

**Approach:** Add `PUT /api/v1/trips/:tripId/packing/order` taking one packing list's full ordered `[{id, labelId}]`; reject mismatched lists with 409 and no writes. Switch the trip packing drag caller to it, keeping the web experience.

## Boundaries & Constraints

**Always:** Story branch `story/5-2-packing-reorder-api`; PR base `feature/api-v1` (verify before opening; afterwards switch back and pull). Trip lock, `requireTripRole` before and inside the lock, existing activity/live events via `runTripWrite`, idempotent replay with access recheck, optimistic rollback and toast. Positions are the array index. Test first. No schema or env changes.

**Never:** Touch the template editor reorder (`packing/[templateId]`), packing create, section removal, lists, pull-templates or page reads. No commits to `feature/api-v1` or `main`. Do not retire `packing-list-sortable` props shared with templates.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Error handling |
| --- | --- | --- | --- |
| Reorder | Full list for `listId` (or null = default list), new order and `labelId`s | Position = index, `labelId` stored; 200 with `{listId, items}` | — |
| No-op | Same order and labels as stored | 200, no writes, no activity or events | — |
| Partial / stale / extra | Id set differs from stored items of that list | 409, no writes | UI rolls back and toasts |
| Foreign item | Id from another trip or list | 409, no writes, no leak | Same as stale |
| Bad label | `labelId` not a label of the same list | 422, no writes | Validation error |
| Duplicate ids / bad shape | Repeated id, non-UUID, extra field | 422 | API validation error |
| Access | Viewer / non-member | 403 / 404 | No mutation |
| Replay / overlap | Repeated key; two quick drags | Cached replay rechecks access; drags run in order | Later drag wins |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/packing-actions.ts:250` `reorderPackingItemsImpl` and its `actions.ts` forward -- retire by export name; `validateLabelId` (same file) stays for other actions.
- `src/lib/services/packing.ts`, `src/lib/api/contract/packing.ts`, `src/app/api/v1/packing-items/[itemId]/route.ts` -- 5.1 patterns (`runTripWrite`, `lockTrip`, `requireTripRole`, strict contracts, `apiRoute` with `idempotent: {}`).
- `services/days.ts` `reorderDay`, `contract/days.ts` `reorderDay`, `ConflictError`, `ValidationFailedError` -- reorder, 409 and unique-id refine to mirror.
- `use-packing-handlers.ts` -- `queueItemWrite`/`packingItemWrites` keyed chain, `useApiMutation`; `handleReorderPackingItems` is the caller. Trip handler gets only `ordered`; derive `listId` from the first item in `detail.packingItems`.
- `packing-list-view.tsx`, `packing-list-sortable.tsx` -- send the whole active list incl. labels with `position`; UI types stay, handler drops `position`.
- `tests/e2e/feature-map.mjs` -- every entry listing `src/app/api/v1/packing-items/**` (lines 69, 338, 681 packing-tab, 696 packing-lists, 864) gets `src/app/api/v1/trips/*/packing/**` beside it.
- `use-packing-handlers.ts` is 273 lines; keep the new reorder code compact (reuse `queueItemWrite` with a `${trip.id}:order:${listId}` key) and do not grow it past about 300.

## Tasks & Acceptance

**Execution:**

- [ ] Tests first: `src/lib/api/contract/packing.test.ts`, `src/lib/services/packing.test.ts`, new `src/app/api/v1/trips/[tripId]/packing/order/route.test.ts`, `use-packing-handlers.test.tsx`, `use-trip-detail-handlers.test.tsx`; update `packing-actions.test.ts`, `actions.test.ts`. Cover every matrix row, no-write on rejection, serialized rapid reorders, and rollback.
- [ ] `tests/e2e/features/packing-tab.feature` + `steps/packing-tab.steps.ts` -- drag within and across sections, await the PUT before reload; `packing-lists.feature` -- reorder in a non-default list; `api.feature` + `api.steps.ts` -- 409 stale/partial, viewer 403, non-member 404 with scenario-owned fixtures.
- [ ] `src/lib/api/contract/packing.ts` -- `reorderPackingItems` PUT contract (params `tripId`, body `{listId, items}`, max 1000, unique ids).
- [ ] `src/lib/services/packing.ts` -- locked full-set comparison, label validation, minimal writes, `markChanged` only on change.
- [ ] `src/app/api/v1/trips/[tripId]/packing/order/route.ts` -- idempotent PUT.
- [ ] `use-packing-handlers.ts` -- call API through a per-trip-list serialized chain, `router.refresh()` after; retire the action and forward.
- [ ] `docs/api-v1.md`, `tests/e2e/feature-map.mjs` -- document fields, 409/422/403/404, replay; register route glob.

**Acceptance Criteria:**

- Given an editor drags an item within or across sections, when they reload, then the order and section persist.
- Given a stale, partial or foreign list, when the client PUTs it, then it gets 409 and the stored order is unchanged.
- Given two quick drags, when both settle, then the second order is final.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Silent return when first dragged item unknown/empty list | medium | patch | Optimistic drag never rolls back; no toast or refresh. Fix: call `onError` and `router.refresh()`. |
| No keyed-replay test for the order PUT | medium | patch | No test passes `replay`; dropping `payload`/`replay` from `runTripWrite` options would ship unnoticed. |
| List scoping (`listId` clause) unobserved by tests | medium | patch | `storeRows` ignores `where`; add API E2E with a second list proving cross-list item id returns 409 and other list untouched. |
| 409 compares id set only (same ids, new order succeeds) | false | rejected | Matrix defines stale/partial as id-set mismatch; last write wins is intended. |
| Unknown `listId` with `items: []` returns 200 | low | rejected | No harm (no rows exist); fix adds a query and branch. |
| Later queued drags still fire after a failure | low | rejected | Each is a full-list PUT, server stays safe; cancel logic adds complexity. |
| Reorder races an in-flight add | maybe-false | rejected | Would be low at worst (spurious 409, rollback, refresh). |
| Revalidate only `/trips` | false | rejected | Matches 5.1 routes (`packing.ts` lines 36, 81, 153); client calls `router.refresh()`. |
| Queue key lacks trip id | false | rejected | `queueItemWrite` prefixes `${trip.id}:`. |
| Dead imports in packing-actions.ts | false | rejected | Lint passed in implementer's validation. |
| Views may send partial lists | false | rejected | Pointer-drag E2E requires a 2xx PUT. |
| Within-section pointer drag lacks scenario; mixed-list payload; 1000 sequential UPDATEs; test cast; `catch {}` retries; 422 and no-op API scenarios | low | rejected | Cosmetic or unlikely; fixes add scope. |

## Design Notes

List scope: `listId: null` means the default list (items with null `listId`). Compare the id set against `buildPackingListItemScope(tripId, listId)`. Response echoes the saved order so API clients need no refetch.

## Verification

**Commands:**

- `npx vitest run src/lib/services/packing.test.ts src/lib/api/contract/packing.test.ts "src/app/api/v1/trips/[tripId]/packing"` -- expected: pass
- `npm run test:e2e:affected` -- expected: pass
- `build-validator` once after targeted tests -- expected: PASS
