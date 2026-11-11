---
title: "Move trip notes to the API"
type: "feature"
ticket: "7"
created: "2026-11-11"
status: "built"
baseline_revision: "55eb6b008ddf2cb31be6e209460924fbe2d4dd1b"
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

**Problem:** Trip notes still run through `createTripNote`, `updateTripNote`, `deleteTripNote` and `reorderTripNotes`. Create sends no client UUID, so a retry duplicates a note; reorder fails with a bare `CONCURRENT_MODIFICATION` throw; mobile has no endpoint for any of them.

**Approach:** A trip-note service with `POST /api/v1/trips/:tripId/notes` (prepend), `PATCH`/`DELETE /api/v1/notes/:noteId` and `PUT /api/v1/trips/:tripId/notes/order`, all opting in to `Idempotency-Key`. The sortable is first split, with no behavior change and in its own commit, into row, overlay, config and reorder-hook files. The editor, sortable and tab then call the API through `useApiMutation`, the editor's create draft keeps one client UUID across retries, the trip-notes steps wait on API responses, and the four actions retire. Branch `story/2-7-move-trip-notes-to-the-api` from the latest `feature/api-v1`; PR base `feature/api-v1`; switch back to `feature/api-v1` after the PR.

## Boundaries & Constraints

**Always:** Tests first. Authorize with `requireTripRole(editor)` before and after `lockTrip`; claim the client UUID under the shared advisory lock (`trip-note:<id>`) before the trip lock. Create shifts every trip note down one and inserts at position 0. Retry equality is entry 3's rule: same `id` with the same trip, title and body replays (stored row, no shift, write or effect; only `position` may differ); any other use of the ID is `ConflictError`, a foreign trip the actor cannot see is 404. Title and body are trimmed; a blank value is stored null. A note left with neither is 422. PATCH is partial (absent = unchanged, null or blank = cleared); an edit that changes nothing writes nothing and runs no effect. Delete takes `tripId` in the body and is idempotent (missing row: 204, no effect). Reorder takes the complete ID list; a stale, duplicated or foreign list is `ConflictError` with nothing written, and an unchanged order writes nothing. Reuse `ConflictError`, `runTripWrite` and `dbTripNoteToType`; services throw no `ApiError`. Field caps stay `FIELD_LIMITS.noteTitle` and `noteBody`.

**Never:** Touch day notes or event services, `idempotency.ts`, migrations or `CHANGELOG.md`. Add retries or timers. Push or open a PR without user confirmation.

## I/O & Edge-Case Matrix

| Scenario                      | Input / State                               | Expected Output / Behavior                    | Error Handling                            |
| ----------------------------- | ------------------------------------------- | --------------------------------------------- | ----------------------------------------- |
| Create                        | `{title?, body?}`                           | 200 `TripNote` at position 0; others shift +1 | —                                         |
| Blank create                  | Neither field, or both whitespace           | No write                                      | 422 `validation_failed`                   |
| Same-ID replay                | Same `id`, trip, title, body after a shift  | 200 stored row, no write or effect            | —                                         |
| ID reuse                      | Same `id`, other title or body              | —                                             | 409 `conflict`; foreign trip: 404         |
| Partial edit                  | `{title}` only; `{body: null}`              | 200 note; other field kept; null clears       | Would leave note blank: 422; missing: 404 |
| Delete                        | Existing; repeat; row gone                  | 204; repeat or gone: 204, no effect           | —                                         |
| Reorder                       | Full ID list, new order                     | 200 `{tripId, noteIds}`; positions 0..n-1     | —                                         |
| Stale reorder                 | A note added, deleted or foreign since load | No write                                      | 409 `conflict`                            |
| Invalid                       | Over-length, bad UUID, extra key            | No write                                      | 422 `validation_failed`                   |
| Viewer / stranger / anonymous | valid request                               | No write                                      | 403 / 404 / 401                           |

</frozen-after-approval>

## Code Map

- `src/lib/services/itinerary-notes.ts` -- the template: client-ID claim, foreign-trip viewer check, replay, no-op update, delete auth. `src/lib/services/events.ts:215-260` for delete.
- `src/lib/services/trip-notes.ts` (new) -- `createTripNote`, `updateTripNote`, `deleteTripNote`, `reorderTripNotes`; reads by trip with `notes.tripId`; blank-after-merge throws a `z.ZodError` (`errorResponse` maps it to 422).
- `src/lib/api/contract/trip-notes.ts` (new) -- four `defineEndpoint`s: POST `{id?, title?, body?}` refined to one non-blank field; PATCH `{title?, body?}` nullable, at least one key; DELETE `{tripId}` status 204; PUT `/api/v1/trips/:tripId/notes/order` `{noteIds}` max 500, unique.
- `src/lib/validation-schemas.ts:126-131` -- replace `createTripNoteSchema`/`updateTripNoteSchema` with exported `tripNoteTitleSchema`/`tripNoteBodySchema` (same messages); `validation-schemas.test.ts:136-139` follows.
- `src/app/api/v1/trips/[tripId]/notes/route.ts`, `.../notes/order/route.ts`, `src/app/api/v1/notes/[noteId]/route.ts` (new) -- `apiRoute(..., { idempotent: {} })`; copy `itinerary-notes/[noteId]/route.ts` and `trips/[tripId]/checklists/route.ts`.
- `src/data/types.ts:1364-1377` -- drop the three input types, add `TripNoteOrder { tripId; noteIds }`.
- `src/components/arrivo/trip-notes-editor.tsx` -- `useApiMutation` for create and edit. Create draft holds one `useRef` UUID, replaced on a `conflict` error; edit sends only changed fields, key `trip-note:<id>`. The hook toasts, so drop the editor's own `toast.error`, keeping the inline error and Retry. Declare the unmount-commit effect above the hook calls so its cleanup runs before the hook marks itself unmounted.
- `src/components/arrivo/trip-notes-sortable.tsx` (447 lines) -- split first, no behavior change. Move `SortableTripNoteRow`, its props interface and `reorderHandleId` (:72-163) to `trip-notes-sortable-row.tsx`; the `DragOverlay` card (:395-444) to `trip-notes-drag-overlay.tsx` as `TripNotesDragOverlay` with a `TripNotesDragOverlayProps { note }` interface; `silentAnnouncements`, `screenReaderInstructions`, `verticalOnlyKeyboardCoordinates` and `sameNoteOrder` (:44-78) to `trip-notes-drag-config.ts`; the state, refs and drag and keyboard handlers (:174-363) to `use-trip-notes-reorder.ts`. The kept file composes `DndContext`, `SortableContext` and those pieces (~110 lines). The refs stay together in the hook, so no handler closes over a stale one. The row, overlay and hook files start with `"use client"`; the row keeps its `SortableTripNoteRowProps` interface.
- `src/components/arrivo/use-trip-notes-reorder.ts` (new, after the split) -- `handleDragEnd` (:287-330) reorders through `useApiMutation`, key `trip-notes-order:<tripId>`; keep the announcement and restore, drop the component toast, `router.refresh()` on a `conflict` error.
- `src/components/arrivo/trip-notes-tab.tsx:105-125` -- delete through the hook (body `{tripId}`, key `trip-note:<id>`); keep the inline dialog error.
- `src/app/(app)/trips/[tripId]/actions.ts:329-422` -- delete the four actions, `CONCURRENT_MODIFICATION_ERROR`, then imports nothing else uses (check `notes`, `sql`, `asc`, `lockTripForUpdate`, `parseInput`). `actions.test.ts:168-181,360-361,375-745` loses their cases.
- `tests/e2e/feature-map.mjs` -- add `src/components/arrivo/trip-notes-*.ts` and `src/components/arrivo/use-trip-notes-*.ts` to `trip-notes` (the existing glob matches `.tsx` only); add the service, `src/app/api/v1/notes/**` and `src/app/api/v1/trips/*/notes/**` to `api`; give `trip-notes` the files its steps now reach (`src/lib/api/**`, service, routes, `trip-write*.ts`, `client-ids.ts`, `tests/e2e/api-response.ts`). `scripts/feature-map.test.mjs` verifies.
- `tests/e2e/steps/trip-notes.steps.ts:216-270` -- `waitForServerActionResponse` becomes `waitForApiResponse` (PUT `/api/v1/trips/<id>/notes/order`; the id from `scenario`). Note ids for PATCH/DELETE waits come from the row's `trip-note-delete-<id>` element. `tests/e2e/steps/api.steps.ts` for the new API steps.

## Tasks & Acceptance

**Execution:**

- [ ] `trip-notes-sortable.tsx` split, own commit, first -- add `trip-notes-sortable-row.test.tsx` (handle label, position text, key and blur forwarding), `trip-notes-drag-overlay.test.tsx`, `trip-notes-drag-config.test.ts` (`sameNoteOrder`, horizontal keys inert) and `use-trip-notes-reorder.test.ts` (pointer and keyboard drag end persist the new order, a no-move drop calls nothing, a failed persist restores the order, cancel and blur-cancel reset state), then move the code. `trip-notes-sortable.test.tsx` must pass unchanged before any API work, and `feature-map.mjs` gets its two `.ts` globs in the same commit.
- [ ] `contract/trip-notes.test.ts` then `.ts` -- strict keys, lowercase UUIDs, caps, blank POST rejected, PATCH needs a key, unique order IDs.
- [ ] `services/trip-notes.test.ts` then `.ts` -- every matrix row: prepend shift, replay after a shift, ID collision, foreign trip, partial and clearing edits, blank-after-merge, no-op edit, delete and repeat, stale reorder, no-op reorder, roles.
- [ ] `trips/[tripId]/notes/route.test.ts`, `notes/order/route.test.ts`, `notes/[noteId]/route.test.ts`, then routes -- all register `{ idempotent: {} }`.
- [ ] `trip-notes-editor.test.tsx`, `use-trip-notes-reorder.test.ts`, `trip-notes-sortable.test.tsx`, `-tab.test.tsx` then components -- mock `@/lib/api/client`; one ID across a failed create, fresh ID after a 409; changed-field PATCH; unmount save still sends; reorder keyed and restored on failure, refresh on 409; delete sends `tripId`.
- [ ] `actions.ts`, `actions.test.ts`, `validation-schemas.ts`, `.test.ts`, `types.ts` -- retire the actions and dead schemas and types.
- [ ] `api.feature` + `api.steps.ts` -- prepend order, same-ID replay, reuse 409, blank 422, partial PATCH, keyed replay, idempotent delete, stale reorder 409, denied and invalid cases.
- [ ] `trip-notes.feature` + steps -- create, edit, delete each await their API response and survive reload; two rapid reorders in a row persist.
- [ ] `feature-map.mjs` -- register the new files.

**Acceptance Criteria:**

- Given a note create that failed, when the user commits again, then both requests carry the same `id`.
- Given three notes, when two reorders are dropped in a row and the page is reloaded, then the final order persists.
- Given the change set, when `scripts/affected-e2e.mjs` runs, then it selects `api` and `trip-notes`.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding | Lens | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- |
| Create draft id not reset after a saved create | blind | low | patch | Create success always calls `onClose`, so the real flow remounts, but a same-mount second commit reused the id. Reset to null on success; same-mount test added. |
| Unmount save: hook skips toast, `onSuccess` and refresh once unmounted; failure is silent | blind, edge, gap | maybe-false (medium if true) | defer | Shared `useApiMutation` behavior from stories 2.3-2.6, and the plan's Design Notes assume the live-sync publish refreshes the page. Needs an E2E tab-switch-after-edit check. |
| Retry after edited text and lost response gets 409, then a duplicate | blind, edge | low | rejected | Id reuse until a `conflict` is the plan's rule and matches sibling stories; the fix adds state and branches. |
| Create-by-id after delete re-inserts the note | blind | low | rejected | Replay only while the row exists is the entry 3 retry-equality rule. |
| Reorder `.max(500)` with no cap on create | blind, edge | low | rejected | Plan fixes the cap, same as day order; a trip with 500+ notes is not an everyday case. |
| DELETE carries a JSON body | blind | low | rejected | Plan and sibling endpoints define it; fix edits the plan. |
| PATCH blank-after-merge error has a root path, couples to the create contract; stored fields re-validated | blind, edge | low | rejected | Plan Design Notes choose a `z.ZodError`; stored data already obeys the same limits. |
| `getNow()` stamps createdAt/updatedAt | blind | false | rejected | Same convention as `itinerary-notes.ts`; AGENTS.md routes "now" through `getNow()`. |
| Sortable split bundled with the API swap | blind | false | rejected | The split is its own commit `df759463`. |
| No UI E2E for 409, failed delete or viewer | blind | low | rejected | Covered by unit tests and API scenarios; extra UI scenarios are outside the plan. |
| Route tests mock `apiRoute`, alias imports | blind | false | rejected | Identical to the existing route tests. |
| Failed-reorder announcement reads stale `notesRef` on 409 | blind, edge | low | rejected | Rare path; deferring the announcement adds complexity. |
| Reorder unmounted or auth lost reads as failure | edge | low | rejected | The component is gone or the user is being redirected. |
| `deletedIndex` -1 sends focus to `notes[0]` | edge | false | rejected | The refresh that removes the note also clears the dialog target and expanded state first. |
| PATCH on a note deleted elsewhere leaves a Retry that 404s | edge | low | rejected | Live-sync refresh removes the note and collapses its editor. |
| Keyboard-move and collapse steps require a PUT or PATCH | edge, gap | low | rejected | Every scenario using them makes a real change. |
| Armed wait promise can reject unhandled | edge | low | rejected | Same pattern as existing steps. |
| Failed delete of an expanded note with a neighbour: focus-ref reset unpinned | gap | low | patch | Test added: refresh removing the note lands focus on New Note, not the neighbour. |
| Web never sends `Idempotency-Key`; editor tests never assert id stability | intent | false | rejected | Plan scopes the header to the server; `sends the same id on a retry after a failed create` exists. |

## Design Notes

PATCH can leave a note blank only by clearing its last field, which the contract cannot see, so the service checks the merged row and throws a `z.ZodError` rather than an HTTP-shaped error. Edit and delete use separate `useApiMutation` instances, so key `trip-note:<id>` does not order them across hooks, the same limit story 2.6 accepted. After an unmount save the hook is gone and skips `router.refresh()`; the live-sync publish from `afterTripWrite` is assumed to refresh the page, so check that tab-switching after an edit shows the saved note.

`trip-notes-sortable.tsx` (447 lines) is split before the API swap, in its own commit, so the swap touches only the small reorder hook. `trip-notes-editor.tsx` (279) is only 29 lines over and gains a hook call and one ID ref with no new JSX, so it is left whole, the call stories 2.3, 2.5 and 2.6 made; `trip-notes-tab.tsx` is at 249.

## Verification

**Commands:**

- `npx vitest run src/lib/services src/lib/api src/app/api/v1 src/components/arrivo/trip-notes-editor.test.tsx src/components/arrivo/trip-notes-sortable.test.tsx src/components/arrivo/trip-notes-sortable-row.test.tsx src/components/arrivo/trip-notes-drag-overlay.test.tsx src/components/arrivo/trip-notes-drag-config.test.ts src/components/arrivo/use-trip-notes-reorder.test.ts src/components/arrivo/trip-notes-tab.test.tsx "src/app/(app)/trips/[tripId]/actions.test.ts" src/lib/validation-schemas.test.ts scripts/feature-map.test.mjs` -- expected: pass
- `node scripts/affected-e2e.mjs` -- expected: lists api, trip-notes
- `build-validator` -- expected: PASS
