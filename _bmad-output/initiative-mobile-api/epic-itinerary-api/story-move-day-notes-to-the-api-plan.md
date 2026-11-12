---
title: "Move day notes to the API"
type: "feature"
ticket: "6"
created: "2026-11-10"
status: done
baseline_revision: "396a8d2d9b01c85c36632e0020e3b7d3f3bae39e"
route: "full"
route_source: "auto"
risk: "medium"
review: "thorough"
review_source: "auto"
lenses_ran: ["blind-hunter", "edge-case-hunter", "verification-gap", "intent-alignment"]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Day notes still run through `createNote`, `updateNote` and `deleteNote` server actions. `createNote` sends no client UUID, so a retry can duplicate a note, and mobile has no endpoint for any of the three.

**Approach:** A day-note service on the shared positioning module, with `POST /api/v1/days/:dayId/notes`, `PATCH /api/v1/itinerary-notes/:noteId` and idempotent `DELETE /api/v1/itinerary-notes/:noteId`, all opting in to `Idempotency-Key`. The note draft sends its stable ID, the day-note handlers and the app-activity day-note waits use the API, and the three actions retire. Branch `story/2-6-move-day-notes-to-the-api` from the latest `feature/api-v1`; PR base `feature/api-v1`; switch back to `feature/api-v1` after the PR.

## Boundaries & Constraints

**Always:** Tests first. Authorize with `requireTripRole(editor)` before and after `lockTrip`; the client UUID is claimed under the shared advisory lock (`itinerary-note:<id>`) before the trip lock. Retry equality is entry 3's rule: same `id` with the same trip, day and content replays (stored row, no shift, write or effect; only `position` may differ); any other use of the ID is `ConflictError`, a foreign trip the actor cannot see is 404. Position is `insertAtPosition` (shift via `shiftFromPosition`) else `appendPosition`. A PATCH with unchanged content writes nothing and publishes no effects. Delete takes `tripId` in the body and is idempotent (missing row: 204, no effect). Reuse `ConflictError`, `runTripWrite` and `dbNoteToType`; services throw no `ApiError`. Note content keeps `itineraryNoteContentSchema` rules.

**Never:** Touch trip notes (`createTripNote` and kin, entry 7), event services, `validation-schemas.ts`, `idempotency.ts`, migrations or `CHANGELOG.md`. Add retries or timers. Push or open a PR without user confirmation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Insert at position | `insertAtPosition: 1` among event, note, checklist | 200 `Note` at 1; items at or above 1 shift | — |
| Append | no position | Position after the last item | — |
| Same-ID replay | Same `id`, day and content, positions shifted since | 200 stored row, no write or effect | — |
| ID reuse | Same `id`, other day or content | — | 409 `conflict`; foreign trip: 404 |
| Day removed mid-edit | Day gone between pre-read and trip lock | No write | 409 `conflict`; day already absent: 404 |
| Edit content | `PATCH {content}` | 200 updated `Note`; same content writes nothing | Missing note: 404 |
| Delete | Existing note; repeat; row already gone | 204; repeat or gone: 204, no effect | — |
| Invalid | Over-length content, bad UUID, extra key | No write | 422 `validation_failed` |
| Viewer / stranger / anonymous | valid request | No write | 403 / 404 / 401 |

</frozen-after-approval>

## Code Map

- `src/lib/services/events.ts:105-215` -- mirror `createEvent` (client-ID claim, foreign-trip viewer check, `matchesDraft`-style replay, day-removed `ConflictError`) and `deleteEvent`'s body-`tripId` auth; `src/lib/services/checklists.ts:224-258` for the update shape.
- `src/lib/services/itinerary-notes.ts` (new) -- `createDayNote`, `updateDayNote`, `deleteDayNote`; reads join `days` for the trip; `lockClientIds`, `appendPosition`, `shiftFromPosition` as is.
- `src/lib/api/contract/itinerary-notes.ts` (new) -- three `defineEndpoint`s; body `{ id?, content, insertAtPosition? }`, PATCH `{ content }`, DELETE `{ tripId }` status 204; read `contract/events.ts` for the shape.
- `src/app/api/v1/days/[dayId]/notes/route.ts`, `src/app/api/v1/itinerary-notes/[noteId]/route.ts` (new) -- `apiRoute(..., { idempotent: {} })`; copy `events/[eventId]/route.ts`.
- `src/components/arrivo/use-day-draft.ts:117-155` -- pass `draftIdRef` as `onAddNote`'s 4th arg; `canRearm` true for every kind; the 409 ID refresh covers notes.
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts:210-237` -- `handleAddNote` gains `clientId?` and follows `handleAddEvent` (:169-208); update/delete call `useApiMutation` with key `note:<id>`; delete body carries `trip.id`.
- `onAddNote` type, widen with `clientId?` only (grep `onAddNote`): `day-card.tsx`, `day-card-body.tsx` (255 lines), `trip-itinerary-view.tsx`, `trip-detail-tab-body.tsx`, `use-trip-detail-handlers.ts`; no JSX added, no file splits.
- `src/app/(app)/trips/[tripId]/actions.ts:375-424` -- delete the three actions, then drop imports and helpers nothing else uses (`getAppendPosition`, `shiftItemsAtOrAbove`, `assertDayExistsInTrip`, `itineraryNoteContentSchema`, `itineraryPositionSchema`: check each, don't assume). `actions.test.ts:168-183,363-364,1409-1444` and `use-trip-detail-handlers.test.tsx:5,48-52,318-332` lose their note-action cases.
- `tests/e2e/feature-map.mjs` -- add the new service and `src/app/api/v1/itinerary-notes/**` beside `events.ts`/`events/**` in `api`, `day-planning`, `trip-live-refresh`; give `app-activity` the files its note steps now reach (`src/lib/api/**`, the service, routes, `trip-write*.ts`, `api-response.ts`). `scripts/feature-map.test.mjs` verifies.
- `tests/e2e/steps/api.steps.ts`, `day-planning.steps.ts:733-769`, `app-activity.steps.ts:~410,~1225`; `tests/e2e/api-response.ts` -- API waits (`waitForApiResponse`, first day's id as at `day-planning.steps.ts:556`).

## Tasks & Acceptance

**Execution:**

- [ ] `contract/itinerary-notes.test.ts` then `.ts` -- strict keys, lowercase UUIDs, content cap, `tripId` required on delete.
- [ ] `itinerary-notes.test.ts` then `.ts` -- every matrix row: positioned insert among mixed items, replay after a shift, ID collision, foreign trip, day removed mid-edit, edit, no-op edit, delete and repeat, roles.
- [ ] `days/[dayId]/notes/route.test.ts`, `itinerary-notes/[noteId]/route.test.ts`, then routes -- all register `{ idempotent: {} }`.
- [ ] `use-day-draft.test.ts` then `.ts` -- one ID across a rejected note commit; note draft re-arms; a 409 refreshes the ID.
- [ ] `use-trip-detail-handlers.test.tsx` then `.ts`; `day-card-body.test.tsx` -- API called with draft ID and position, edit and delete keyed and sent with `tripId`; the draft's ID reaches `onAddNote`; type widening then `tsc`.
- [ ] `actions.ts`, `actions.test.ts` -- remove the three actions, their tests and dead helpers.
- [ ] `api.feature` + `api.steps.ts` -- positioned insert among event, note and checklist; same-ID replay after a shift; edit; keyed and repeated delete; denied and invalid cases.
- [ ] `day-planning.feature`, `app-activity.feature` steps -- add, edit and delete a note among events and checklists, each awaiting its API response and visible after reload.
- [ ] `feature-map.mjs` -- register the new files.

**Acceptance Criteria:**

- Given a note draft whose first commit failed, when the user commits again, then both requests carry the same `id`.
- Given a note between an event and a checklist, when added, edited and deleted and the page reloaded, then each state persists and the other items keep their order.
- Given the change set, when `scripts/affected-e2e.mjs` runs, then it selects `api`, `day-planning` and `app-activity`.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding (lens) | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Edit-then-delete not ordered: update and delete use separate `useApiMutation` instances, so key `note:<id>` does not serialize across them (edge-case x2, verification-gap) | low | rejected | Real: `queues` is a per-hook `useRef` (`use-api-mutation.ts:42`). Overtake needs the DELETE to beat a PATCH sent about a click earlier, and the trip lock serializes the server side; the worst outcome is a 404 toast on a deleted note. Same shape as event update/delete from story 2.5. Fix needs a cross-hook queue (shared infra), more than a direct correction. |
| Failed note PATCH/DELETE does not refresh the route (blind, edge-case) | low | rejected | Matches the shipped event/checklist handlers, whose tests assert toast and no refresh on failure (`handleEventDelete toasts a failure and does not refresh`). A deliberate house pattern, not new in this change. |
| `handleAddNote` resolves silently when the day has no id (blind) | false | rejected | Same guard as `handleAddEvent`; persisted days always carry an id. |
| `draftIdRef.current ?? undefined` dead fallback (blind) | false | rejected | `draftIdRef` is set at `use-day-draft.ts:101` before any commit can run; the fallback only satisfies the type. |
| Retry after a collaborator edit gives 409 then a new ID (blind) | low | rejected | Specified behavior: entry 3's retry equality in the frozen Boundaries (same id, trip, day and content replays). Needs a lost response plus a concurrent edit; changing it is a design decision outside this story. |
| DELETE carries `tripId` in the body (blind) | false | rejected | Frozen plan decision, same as event and checklist deletes. |
| Duplicate `it.each(["viewer","stranger"])` role tests (blind) | low | rejected | True (parameter ignored), but dev-only and cosmetic; the denial path itself is covered. |
| Redundant note reads in update/delete, `firstDayId` copied, magic `5001`, brittle xpath, 5s to 10s timeout, mock leakage via `clearAllMocks` (blind) | low | rejected | Cosmetic or dev-only; no failing test or user-visible harm shown. |
| `handleAddNote` generic error when the hook is unmounted or auth was lost (edge-case) | false | rejected | Identical to `handleAddEvent`; the draft stays open and a retry replays by ID. |
| Test gaps: concurrent same-ID create, live-sync effects, cross-trip e2e, UI lost-response e2e (blind) | low | rejected | Same coverage level as the event create story; the service unit tests and `api.feature` cover the claim, replay and cross-trip rules. |
| No API registry/docs entry (blind) | false | rejected | The diff has no registry to update; docs are not in this story's scope. |
| Intent alignment: diff implements the full-stack reading, no divergence (intent-alignment) | none | none | Descriptive report; branch and PR steps are not code. |

## Design Notes

A day gone before the request cannot be authorized (the path carries only `dayId`), so that is 404; only a day that vanishes between the pre-read and the lock is a `ConflictError`, as in `createEvent`. Delete carries `tripId` for the same reason the event and checklist deletes do. A PATCH of a vanished note is 404 (the retired action returned silently); only DELETE is idempotent on a missing row.

`day-card-body.tsx` (261), `trip-itinerary-view.tsx` (279) and `trip-detail-tab-body.tsx` (294) already pass 250 lines. This story adds only an optional parameter to one prop type in each and no JSX, so splitting them is left out, the same call stories 2.3 and 2.5 made; the split belongs to its own refactor.

## Verification

**Commands:**

- `npx vitest run src/lib/services src/lib/api src/app/api/v1 src/components/arrivo/use-day-draft.test.ts src/components/arrivo/day-card-body.test.tsx "src/app/(app)/trips/[tripId]" scripts/feature-map.test.mjs` -- expected: pass
- `node scripts/affected-e2e.mjs` -- expected: lists api, day-planning, app-activity
- `build-validator` -- expected: PASS
