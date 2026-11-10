---
title: "Extract shared timeline positioning and reorder days through the API"
type: "feature"
ticket: "4"
created: "2026-11-10"
status: "built"
baseline_revision: "6a2c993efb8c1be307a7c0d3ba9a582e19f2e725"
route: "full"
route_source: "auto"
risk: "high"
review: "thorough"
review_source: "auto"
lenses_ran: ["blind-hunter", "edge-case-hunter", "verification-gap", "intent-alignment"]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Append, insert-with-shift and full-day reorder validation live inline in `actions.ts` and the checklist service, so entries 5 and 6 would copy them. Day drag-and-drop still calls the `reorderDayItems` server action, whose stale-list error is a string match (`CONCURRENT_MODIFICATION`).

**Approach:** One `timeline-positions` service module holds the three operations across events, itinerary notes and checklists; the checklist service adopts it now. `PUT /api/v1/days/:dayId/order` (Idempotency-Key opted in) applies a complete typed list under the trip lock, and a stale or foreign list is `ConflictError` (409 `conflict`). The day-card drag calls it as a per-day keyed mutation; `reorderDayItems` and its toast branch retire. Branch `story/2-4-timeline-positioning-and-day-order-api` from `feature/api-v1`; PR base `feature/api-v1`; switch back to `feature/api-v1` after the PR.

## Boundaries & Constraints

**Always:** Tests first. Authorize with `requireTripRole(editor)` before and after `lockTrip`; a day outside the trip is `TripNotFoundError`. A list is valid only when its set of `type:id` keys equals the day's current events, notes and checklists, with no duplicates; otherwise 409 with nothing written. Valid lists write positions `0..n-1`; a list already in stored order writes nothing and runs no effect. Linked reservation rows are never in the list or the DB, so they stay untouched. All writes in one drag queue under `day-order:<dayId>`.

**Never:** Rewire `createEvent`/`createNote` in `actions.ts` (entries 5, 6 own that; their local helpers stay). Add migrations, edit `src/lib/api/idempotency.ts` or `CHANGELOG.md`, or add retry/timer code. Throw `ApiError` from services. No push or PR without user confirmation.

## I/O & Edge-Case Matrix

| Scenario       | Input / State                                         | Expected Output / Behavior                      | Error Handling         |
| -------------- | ----------------------------------------------------- | ----------------------------------------------- | ---------------------- |
| Mixed reorder  | Day holds event, note, checklist; full list reordered | 200 `{ dayId, items }`; positions `0..2`        | —                      |
| Unchanged list | List equals stored order                              | 200; no write, no activity/live-sync effect     | —                      |
| Stale list     | Item added or removed since the client read           | 409 `conflict`; positions unchanged             | `ConflictError`        |
| Foreign item   | List holds an item of another day or trip             | 409 `conflict`; nothing written                 | `ConflictError`        |
| Duplicate key  | Same `type:id` twice                                  | 422 validation error                            | Contract `.refine`     |
| Other trip day | `dayId` of a trip the actor cannot edit               | 404                                             | `TripNotFoundError`    |
| Keyed retry    | Same `Idempotency-Key` and body                       | Stored response replayed; no second write       | —                      |
| Rapid drags    | Three drags before the first PUT settles              | Requests run in order; last list wins on reload | Failure refreshes page |

</frozen-after-approval>

## Code Map

- `src/lib/services/timeline-positions.ts` (new) -- `appendPosition(executor, dayId)`, `shiftFromPosition(executor, dayId, from)`, `applyDayOrder(executor, dayId, items)` throws `ConflictError`. Port from `actions.ts:130-159` (append, shift) and `actions.ts:272-325` (validate, write). Takes `Pick<DbTransaction,"select"|"update">`.
- `src/lib/services/checklists.ts:186-191` -- replace the inline three-table shift loop with `shiftFromPosition`.
- `src/lib/services/days.ts` (new) -- `reorderDay(actor, dayId, input, replay?)`: read day's trip via `db`, `requireTripRole`, `runTripWrite` with `lockTrip` in authorize; mirror `updateChecklistTitle` (`checklists.ts:235-269`). Same-order check skips `markChanged`.
- `src/lib/api/contract/days.ts` (new) -- `reorderDay` PUT `/api/v1/days/:dayId/order`; body `strictObject({ items: array of strictObject({ type: enum event|note|checklist, id: lowercase uuid }) })`, max 500, `.refine` unique keys. Reuse `DayItemType` (`src/data/types.ts:1319`); add a `DayItemOrder` result type there.
- `src/app/api/v1/days/[dayId]/order/route.ts` (new) -- `PUT = apiRoute(reorderDay, ..., { idempotent: {} })`; copy `checklists/[checklistId]/route.ts`.
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts:121-137` -- `useApiMutation(reorderDay)`; `handleDayItemsReorder` calls `mutate` with key `day-order:<dayId>` and `onError: () => router.refresh()`. The hook already toasts the 409 message, so the string-match branch is deleted, not re-toasted.
- `src/app/(app)/trips/[tripId]/actions.ts:272-325` -- delete `reorderDayItems` and `buildDayItemKey`; keep `CONCURRENT_MODIFICATION_ERROR` (line 678 uses it), `shiftItemsAtOrAbove`, `getAppendPosition`. Drop `ReorderDayItemsInput` from `src/data/types.ts` if unused.
- `src/components/arrivo/day-card-dnd.tsx:115` -- already omits linked events from the list; no change.
- `tests/e2e/feature-map.mjs:66-77` -- add `timeline-positions.ts`, `days.ts`, `src/app/api/v1/days/**` to `api`. `use-trip-detail-handlers.ts` and `day-card-dnd.tsx` are mapped; confirm with `node scripts/affected-e2e.mjs`.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/services/timeline-positions.test.ts` then source -- append over mixed types and empty day; shift across all three tables; `applyDayOrder` mixed write, stale, foreign and removed-item lists.
- [ ] `checklists.test.ts` -- existing insert tests still pass through the module; assert shift via `shiftFromPosition`.
- [ ] `days.test.ts` then `days.ts` -- matrix rows: reorder, unchanged (no effect), 409s, other-trip 404, role denied, keyed replay.
- [ ] `contract/days.test.ts`, `api/v1/days/[dayId]/order/route.test.ts` -- body caps, duplicate keys, lowercase UUIDs; route registers PUT with `{ idempotent: {} }`.
- [ ] `use-trip-detail-handlers.test.tsx` -- replace the two reorder tests: PUT sent with day key; a 409 and a network failure each refresh the route once; success does not.
- [ ] `actions.test.ts` -- remove `reorderDayItems` tests and `createReorderTransactionMock`.
- [ ] `api.feature` + `api.steps.ts` -- mixed-type PUT persists and replays; stale and foreign lists 409 and leave order unchanged.
- [ ] `day-planning.feature` + steps; `linked-events.feature` -- three-event mother; rapid drags then reload show the final order; the linked Check-in row remains. Await the PUT with `waitForApiResponse` before any reload.
- [ ] `feature-map.mjs` -- register new files.

**Acceptance Criteria:**

- Given a day with an event, note and checklist, when a full reordered list is PUT, then reload shows that order.
- Given two PUTs for one day started back to back, when both settle, then the second list is the stored order.
- Given the change set, when `scripts/affected-e2e.mjs` runs, then it selects `api`, `day-planning` and `linked-events`.

## Design Notes

Equality uses keys, so a same-size list with one foreign item fails. The no-op check compares each item's stored position to its index, so a retried drag after a refresh is a quiet success. A day deleted mid-edit surfaces as 404 (the day row is gone), not 409.

## Verification

**Commands:**

- `npx vitest run src/lib/services src/lib/api "src/app/api/v1/days" "src/app/(app)/trips/[tripId]"` -- expected: pass
- `node scripts/affected-e2e.mjs` -- expected: lists api, day-planning, linked-events
- `build-validator` -- expected: PASS

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Success refresh mid-queue flickers optimistic order (blind, edge) | false | rejected | `day-card-body.tsx:91-139` keeps `optimisticOrder` until props equal it, so an intermediate refresh does not revert the view; rapid-drag E2E passes. |
| Failure mid-queue cascades 409 toasts | low | rejected | Needs a `useApiMutation` change; later lists carry the full set, so they 409 only if the set truly changed. |
| Revalidation/live-sync parity not asserted | false | rejected | `afterTripWrite` runs `recordTripUpdated`, `publishTripEvent(ItineraryChanged)` and `revalidatePath`; covered by `trip-write-effects.test.ts`. |
| Shift test ignores `where` predicate (blind, edge) | low | rejected | Logic ported verbatim; real SQL covered by the existing checklist-insert E2E scenarios. |
| `appendPosition` unused, duplicate in `actions.ts` (blind, edge) | false | rejected | Plan forbids rewiring `createEvent`/`createNote`; entries 5 and 6 adopt it. |
| E2E fixture coupling: `foreign` undefined, `untouchedDay` | low | patch | `untouchedDay` is set by the Background; added `expect(foreign).toBeDefined()` guard. |
| Third reorder seed not in `e2e-seed-data.ts` | low | rejected | Editing that file is a SHARED change and forces the full suite; kept local to its one step file. |
| Day with over 500 items always 422 | low | rejected | The 500 cap is in the frozen plan. |
| Unchanged drag would time out on PUT wait | false | rejected | Every scenario using the step changes the order. |
| Up to 500 serial UPDATEs under the trip lock | low | rejected | Only rows whose position differs are written; same shape as the retired action. |
| Plan tasks unchecked, no release note | low | rejected | Fix edits the plan; release note goes in the PR description. |
| `dayItemUuid` name reused for params | low | patch | Renamed `uuidLower`. |
| Response returns body, not stored order | false | rejected | After a successful apply, stored order equals the list, including the unchanged and gap cases. |
| Queued drags dropped if the component unmounts | maybe-false, medium if real | defer | Pre-existing hook behavior; logged in `deferred-work.md`. |
| Success now refreshes the route (test comment says it does not) | low | rejected | Matches the hook's keyed-write behavior; plan wording was loose. |
| E2E order step reads all trip events | low | rejected | Every scenario using it holds exactly three events. |
| Intent-alignment lens | descriptive | n/a | Diff implements the intended readings; no divergence requiring action. |
| Verification-gap lens | none | n/a | No gaps found. |
