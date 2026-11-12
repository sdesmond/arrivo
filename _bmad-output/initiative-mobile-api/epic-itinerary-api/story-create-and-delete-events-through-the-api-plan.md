---
title: "Create and delete events through the API"
type: "feature"
ticket: "5"
created: "2026-11-10"
status: done
baseline_revision: "4406beed803bc023697d29827cfb029eb321f97a"
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

**Problem:** Adding an event runs through `createEvent`, which sends no client UUID, so a retry can duplicate it, and deleting runs through two actions (`deleteEvent`, `deleteEventWithDocDecision`) that clean up storage with no replay safety. Mobile needs `POST /api/v1/days/:dayId/events` and `DELETE /api/v1/events/:eventId`.

**Approach:** An event create service on the shared positioning module (`afterEventId`, `insertAtPosition` or append; client UUID with the ADR's retry rule) and an idempotent delete service with `keepDocuments`; storage cleanup runs only after commit. Both routes opt in to `Idempotency-Key`. The draft's stable ID is sent on event creates, `delete-event-dialog` and `handleEventDelete` call the API, and `createEvent`, `deleteEvent`, `deleteEventWithDocDecision` retire. Branch `story/2-5-create-and-delete-events-api` from `feature/api-v1`; PR base `feature/api-v1`; switch back to `feature/api-v1` after the PR.

## Boundaries & Constraints

**Always:** Tests first. Authorize with `requireTripRole(editor)` before and after `lockTrip`; client UUIDs are claimed under the shared advisory lock before the trip lock. A same-ID create replays when the stored row has the same trip, day and content (name, times, location, confirmation, note); only `position` may differ, and the stored row is returned with no shift, write or effects; any other use of the ID is `ConflictError`. Delete is idempotent (missing row: 204, no effect); the body carries `tripId` (as the checklist delete does) so a retry after the row is gone is still authorized. `keepDocuments: true` detaches documents (`eventId` null); otherwise they are deleted. Storage URLs are removed only after the transaction commits and never on a replay; a cleanup failure is logged, not thrown. Unscheduled (day-less) events delete; the expense cascade stays the DB's. `linked-*` ids never reach the DB (UUID params → 422).

**Never:** Touch `getEventTripId` (document actions use it), `src/lib/validation-schemas.ts`, `idempotency.ts`, migrations or `CHANGELOG.md`. Add IDs to note or day-note creates (entries 6, 7), retries or timers. Throw `ApiError` from services. No push or PR without user confirmation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Insert after event | `afterEventId` of an event on the day | 200 `TripEvent` at that position + 1; later items shift | Unknown `afterEventId` falls back to `insertAtPosition`, then append |
| Insert at position | `insertAtPosition: 1` | Items at or above 1 shift down; event at 1 | — |
| Append | neither field | Position after the last item | — |
| Same-ID replay | Same `id`, same content, position shifted since | 200 stored row, no write or effect | — |
| ID reuse | Same `id`, other day or content, or an ID in a trip the actor cannot see | — | 409 `conflict`; foreign trip: 404 |
| Day removed mid-edit | Day gone between the pre-read and the trip lock | No write | `ConflictError` 409; a day already absent: 404 |
| Delete discarding docs | `keepDocuments` false or absent, event has docs | Event and docs removed; files deleted after commit | Cleanup failure logged only |
| Delete keeping docs | `keepDocuments: true` | Docs stay as trip documents; no file deleted | — |
| Delete retry | Row already gone, or same `Idempotency-Key` | 204; no effect, no cleanup | — |
| Linked or invalid id | `linked-<uuid>`, blank name | No write | 422 `validation_failed` |
| Viewer / stranger / anonymous | valid request | No write | 403 / 404 / 401 |

</frozen-after-approval>

## Code Map

- `src/lib/services/events.ts` -- add `createEvent(actor, dayId, input, replay?)` and `deleteEvent(actor, eventId, input, replay?)` beside `updateEvent`; reuse `readEvent`, `runTripWrite`, `lockTrip`.
- `src/lib/services/checklists.ts:53-57` -- private `lockClientIds`; move to `src/lib/services/client-ids.ts` for both services; mirror `createChecklist` (:129-227) for the claim, foreign-trip viewer check, replay compare and `markChanged`.
- `src/lib/services/timeline-positions.ts` -- `appendPosition`, `shiftFromPosition` (use as is).
- `src/app/(app)/trips/[tripId]/actions.ts:156-265` -- `createEvent`, `deleteEvent`, `deleteEventWithDocDecision`: delete; then drop imports, helpers and `CreateEventInput` that nothing else uses (`getEventTripId`, `getDayTripId`, `getAppendPosition`, `shiftItemsAtOrAbove` and `getStorageAdapter` are checked, not assumed). Later stories retire `createNote` and the rest.
- `src/lib/api/contract/events.ts` -- add `createEvent` (POST `/api/v1/days/:dayId/events`: `id?`, `name`, the `updateEvent` fields without `null`, `afterEventId?` UUID, `insertAtPosition?` via `itineraryPositionSchema`) and `deleteEvent` (DELETE `/api/v1/events/:eventId`, body `{ tripId, keepDocuments? }`, status 204). Read `src/lib/api/contract/checklists.ts` for the shape.
- `src/app/api/v1/days/[dayId]/events/route.ts` (new) and `src/app/api/v1/events/[eventId]/route.ts` (add `DELETE`) -- `apiRoute(..., { idempotent: {} })`.
- `src/components/arrivo/use-day-draft.ts:104-133` -- send `draftIdRef` as a 5th `onAddEvent` argument; `canRearm` becomes true for event drafts (notes stay false).
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts:44,116-170` -- `handleAddEvent` gets `clientId?` and calls `useApiMutation(createEvent)`, rejecting on failure like `handleAddChecklist` (`use-checklist-handlers.ts:200-240`); `handleEventDelete` calls the delete endpoint. Widen `onAddEvent` in `day-card.tsx`, `day-card-body.tsx`, `trip-itinerary-view.tsx`, `trip-detail-tab-body.tsx`.
- `src/components/arrivo/delete-event-dialog.tsx`, `place-row-dialogs.tsx:86` -- dialog uses `useApiMutation(deleteEvent)` with a new `tripId` prop (`place.tripId`); `place-row.tsx:326` keeps calling `onDelete(id)` for events without documents.
- `tests/e2e/feature-map.mjs` -- add `client-ids.ts` where `trip-write.ts` appears (api, day-planning, packing-lists, packing-tab, trip-live-refresh); `events/[eventId]/route.ts` and the new `days` route are already globbed.
- `tests/e2e/steps/api.steps.ts`, `day-planning.steps.ts:522`, `event-docs.steps.ts:94`; `tests/e2e/api-response.ts` -- API waits.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/services/client-ids.ts` + test, `checklists.ts` -- move `lockClientIds` unchanged; checklist tests still pass.
- [ ] `contract/events.test.ts` then `contract/events.ts` -- body caps, strict keys, lowercase UUIDs, `tripId` required on delete.
- [ ] `events.test.ts` then `events.ts` -- matrix rows: positioned inserts, replay, ID collision, day removed mid-edit, delete keep/discard with cleanup only after commit (not on rollback, replay or missing row), unscheduled delete, roles.
- [ ] `src/app/api/v1/days/[dayId]/events/route.test.ts`, `events/[eventId]/route.test.ts`, then routes -- both register `{ idempotent: {} }`.
- [ ] `use-day-draft.test.ts` then `.ts` -- one ID across a rejected event commit; event draft re-arms; note draft does not.
- [ ] `use-trip-detail-handlers.test.tsx` then `.ts`; `delete-event-dialog.test.tsx` then `.tsx`; `place-row-dialogs.test.tsx` then `.tsx` (passes `tripId`) -- API called with the draft ID, `afterEventId` or position, keep/discard flag; dialog sends `tripId`.
- [ ] Type-only `onAddEvent` widening in `day-card.tsx`, `day-card-body.tsx` (255 lines), `trip-itinerary-view.tsx` (273), `trip-detail-tab-body.tsx` (288), then `tsc` -- no JSX added, so no split of the already-large files (same call as story 2.3); `day-card-body.test.tsx` gains one case that an event draft's ID reaches `onAddEvent`.
- [ ] `actions.ts`, `actions.test.ts`, `src/data/types.ts` -- remove the three actions, their tests and dead helpers.
- [ ] `api.feature` + steps -- positioned insert, same-ID replay after a shift, delete keeping and discarding documents with stored file removed, idempotent repeat.
- [ ] `day-planning.feature`, `event-docs.feature` + steps -- add an event between two items; delete one keeping and one discarding documents, each persisting after reload, awaiting the API via `waitForApiResponse`.
- [ ] `feature-map.mjs` -- register `client-ids.ts`.

**Acceptance Criteria:**

- Given an event draft whose first commit failed, when the user commits again, then both requests carry the same `id`.
- Given an event between two items, when added and the page reloaded, then it sits between them.
- Given an event with documents, when deleted keeping them and again discarding them, then after reload the documents remain or are gone as chosen, and removed files are deleted only after commit.
- Given the change set, when `scripts/affected-e2e.mjs` runs, then it selects `api`, `day-planning` and `event-docs`.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| finding | lens | verdict | route | evidence |
| --- | --- | --- | --- | --- |
| Kept-document file read is pinned only by an `api` step the map skips on `src/lib/storage/**` edits | verification-gap | medium | patch | `STORAGE` was spread into `event-docs` only, which never fetches the file. Fixed: `...STORAGE` in the `api` entry, and the storage-scope test expectation gains `@feat:api`. |
| Stray blank line in the `event-docs` map entry | blind-hunter | low | patch | Real, from my edit; removed. |
| `tripId={place.tripId ?? ""}` makes both dialog choices 422 | blind-hunter, edge-case, verification-gap | low | rejected | `dbEventToType` always sets `tripId`; no runtime path leaves it undefined, and a guard adds a branch for an unreachable case. |
| Orphaned imports and helpers left in `actions.ts` | blind-hunter | false | rejected | Lint and `tsc` pass; every named helper still serves `createNote`. |
| Stale `afterEventId` silently appends | blind-hunter | false | rejected | The frozen matrix specifies it: unknown `afterEventId` falls back to `insertAtPosition`, then append. |
| `insertAtPosition` past the end leaves a position gap | blind-hunter | low | rejected | Same as the old action and `createChecklist`; order is unaffected by gaps. |
| `matchesDraft` may mis-compare coordinates | blind-hunter | false | rejected | `doublePrecision` columns return JS numbers, not strings. |
| DELETE needs a JSON body | blind-hunter, intent-alignment | false | rejected | Frozen boundary; same shape as the checklist deletes. |
| Files orphaned if the process dies between commit and cleanup | blind-hunter | low | deferred | Inherent in "cleanup after commit"; the old actions had the same window. |
| `documents.url` fallback: no index, exact-URL match, bare `Error` is a 500 | blind-hunter, edge-case | low | deferred | Only the `local` adapter is supported, and the unresolved-key 500 is pre-existing route behaviour. |
| Keyed create retried after its day was deleted returns 404 | edge-case | false | rejected | The frozen matrix says a day already absent is 404. |
| Retained draft ID with edited text returns 409 | edge-case | low | deferred | Same content-drift 409 already deferred for checklists; frozen boundary. |
| Event-after-event gap sends no position fallback | edge-case | low | rejected | The retired action sent the same arguments. |
| Silent resolve when the day is not found | edge-case | low | rejected | Pre-existing pattern from the retired action. |
| Direct delete discards documents attached since the last refresh | edge-case | low | deferred | Pre-existing: the retired `deleteEvent` discarded them too. |
| `createEventSchema` is dead code | edge-case, verification-gap | low | deferred | The plan forbids touching `validation-schemas.ts`. |
| Dialog `sm:max-w-md` / `sm:flex-wrap`, "unrelated" | blind-hunter, intent-alignment | false | rejected | A reported overflow fix, not a defect. |
| `handleAddEvent` generic error when neither callback fires | blind-hunter | false | rejected | Only on unmount, where nothing renders. |
| Hardcoded timeline index 6, reload before DB read | blind-hunter | low | rejected | Dev-only; the fixture's four-type shape is asserted in its Given. |
| `day-planning` not mapped to the day routes or `events.ts` | blind-hunter | false | rejected | The map already selects it for both. |
| Endpoints undocumented | blind-hunter | false | rejected | `docs/` holds ADRs and the plan, not a per-endpoint listing. |
| Plan's five-feature `client-ids.ts` list differs from the map | edge-case | false | rejected | `packing-tab` never listed `trip-write.ts`; `event-docs` does not reach `client-ids.ts`. |
| Retry not exercised through a UI-level retry | intent-alignment | low | rejected | Covered at API and hook level; a UI retry needs fault injection for no new defect class. |

## Design Notes

A day gone before the request cannot be authorized (the path carries only `dayId`), so that is 404; only a day that vanishes between the pre-read and the lock is the entry-1 `ConflictError`. Delete takes `tripId` in the body for the same reason the checklist delete does. `keepDocuments` absent means discard, matching the retired `deleteEvent`. Cleanup is a closure over URLs collected in `mutate` and run after `runTripWrite` returns, so a rollback or replay leaves it empty.

## Verification

**Commands:**

- `npx vitest run src/lib/services src/lib/api src/app/api/v1 src/components/arrivo/use-day-draft.test.ts src/components/arrivo/delete-event-dialog.test.tsx "src/app/(app)/trips/[tripId]" scripts/feature-map.test.mjs` -- expected: pass
- `node scripts/affected-e2e.mjs` -- expected: lists api, day-planning, event-docs
- `build-validator` -- expected: PASS
