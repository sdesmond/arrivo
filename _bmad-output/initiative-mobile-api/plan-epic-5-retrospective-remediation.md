---
title: "Make trip snapshots, deletions and date changes safe before closing epic 5"
type: "bugfix"
ticket: ""
created: "2026-11-20"
status: "built"
baseline_revision: "42c5cffb"
route: "full"
route_source: "retrospective"
risk: "high"
review: "thorough"
review_source: "retrospective"
lenses_ran: []
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md, _bmad-output/initiative-mobile-api/epic-trips-packing-api/epic-trips-packing-api-retrospective.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The epic 5 retrospective found defects that no single story could see:
- **F1, F2:** GET `/trips/:id` hashes a payload whose row order isn't deterministic and whose reads aren't one snapshot. The ETag can change without any data change, or cover a torn state.
- **F3, F4:** Trips, packing items and packing lists accept client UUIDs but leave no deletion record. Date-change cascades record only events and days.
- **F5:** The date-change confirmation never mentions the reservation files it deletes.
- **F6:** A reversed date range in PATCH is silently swapped instead of rejected.
- **AV3:** `updateTrip` blocks its response on storage deletes.
- **F10:** A failed packing-list create throws away the typed name.
- **F11:** The dateless-overflow confirmation is never round-tripped through the contract.

**Approach:**
- Order every snapshot collection by a stable tiebreaker, and read the API snapshot in one read-only REPEATABLE READ transaction.
- Extend deletion records to `trip`, `packing-item` and `packing-list`, and to the children a date change cascades. Creates refuse a recently deleted id, as checklists and days already do.
- Count reservation documents in the confirmation and show the count in the dialog.
- Reject reversed effective ranges with 422.
- Defer post-commit file removal with `after()`, matching `deleteTrip`.
- Keep the list-create form open on failure.
- Add the missing contract and E2E coverage.

## Boundaries & Constraints

**Branch workflow:** Base branch: feature/api-v1. Build on a branch created from the latest `feature/api-v1` (proposed `fix/epic-5-retrospective`); open its PR with `feature/api-v1` as the base/target. Do not build or commit directly on `feature/api-v1`, and do not target main. After opening the PR, switch back to `feature/api-v1`.

**Always:**
- Write tests first.
- Preserve `requireTripRole` 404/403, `runTripWrite`/`withIdempotency` ordering (authorize before replay), the client-id-before-trip lock order (`adr-client-uuids-are-locked-before-the-trip-lock`), live events, and scenario-owned fixtures.
- Write deletion records inside the deleting transaction, using the existing `recordDeletions` / `refuseRecentlyDeleted` (records live in `idempotency_keys`, so no schema change).
- The pages' direct reads through `getTripDetail` keep their behavior. Only the API GET path gets the snapshot transaction.
- The ETag stays a sha256 of the serialized payload.
- Update `docs/api-v1.md` for every contract-visible change (new 409s on a deleted id, the `reservationDocumentCount` field, the 422 for a reversed range).

**Never:**
- Change the schema, migrations or environment.
- Change `withIdempotency` semantics.
- Add `If-Match`.
- Touch pull-templates, cover generation, FX locking or other deferred findings.
- Auto-run the full E2E suite, edit `CHANGELOG.md`, or commit/push without authorization.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Tied positions | Two packing items or events share a position; reservations and expenses exist | Two GETs of an unchanged trip return the identical ETag; matching `If-None-Match` → 304 |
| Concurrent write | A trip write commits during the API GET | The payload reflects one committed state (before or after), never a mix |
| Packing item re-create | Item deleted, then a create with the same id within 24 h | 409 with the deleted message; no row |
| Packing list re-create | List deleted (items cascade), then a create with the list id | 409; no row. An item create into the deleted list keeps its existing not-found answer |
| Section removal | Remove a section in `delete-items` mode, then re-create the section or a removed item | 409. In `move-to-ungrouped` mode only the section id is recorded; moved items stay creatable/editable |
| Trip re-create | Trip deleted, then POST `/trips` with the same id within 24 h | 409 with the deleted message; no trip |
| Date-change cascade | `delete-events` or `keep-as-unscheduled` removes days that hold notes, checklists, checklist items or event documents | Each removed child has a record; re-creating any of them → 409 |
| Reservation files | Removed range holds a reservation with documents | Confirmation `reservationDocumentCount` = that count; the dialog shows it; the echo matches; apply deletes them |
| Reversed range | PATCH `endDate < startDate`, or `startDate` alone after the stored `endDate`, or `endDate` alone before the stored `startDate` | 422; trip and days unchanged |
| File removal timing | Date change deletes event or reservation documents | PATCH returns once committed; queued files are removed after the response (eventually absent from storage) |
| List create fails | `onCreateList` resolves `undefined` | Name and form stay; no navigation |
| Dateless overflow | Dateless trip with an event on Day 2; PATCH dates to one day | 409 `confirmation_required` with `removedDayLabels`; echoing it with `delete-events` → 200 and Day 2 gone |

</frozen-after-approval>

## Code Map

- `src/lib/queries.ts` (excluded from coverage, but has `queries.test.ts`):
  - `getTripDetail` gets an `id` tiebreaker on events (`:418`), packing items (`:432`), packing lists, notes, reservations, expenses (`:441-442`) and collaborators.
  - Add an optional executor parameter so the API path can pass a transaction. Pages keep calling it without one.
- `src/lib/services/trips.ts` `getTrip` (`:37-47`): run the read in `db.transaction(..., { isolationLevel: "repeatable read", accessMode: "read only" })` and pass the transaction to `getTripDetail`.
- `src/lib/services/deletion-records.ts`: add `trip`, `packing-item` and `packing-list` to `DeletionRecordResource` (`:16-17`) with `DELETED_MESSAGES`.
- `src/lib/services/packing.ts`: record deletions and refuse re-creates as follows.
  - **Records written by:**
    - `deletePackingItem`;
    - `removePackingSection`: the section always, its items only in delete mode;
    - `deletePackingList`: the list only. Its items cascade, and an item create aimed at a missing list already fails.
  - **`refuseRecentlyDeleted` called on the no-row branch of:** `createPackingItem` (resource by `isLabel`: `packing-item` for both items and sections, since sections are packing item rows) and `createPackingList`.
- `src/lib/services/trips.ts`:
  - `deleteTrip`: record `trip` only. Child creates need an existing trip, and the refused trip id cannot be re-created.
  - `createTrip`: refuse a recently deleted `trip` id on its no-row path.
- `src/lib/services/trip-date-change.ts`:
  - `summarizeRemovedDayContent` collects note, checklist, checklist-item and event-document ids for the removed days. The apply path records them next to `event`/`day` (`:292,304`).
  - Add `reservationDocumentCount` to `buildTripDateChangeConfirmation` and the returned confirmation.
  - Reject a reversed effective range (desired values merged with the stored ones) with `ValidationFailedError` before any write.
- `src/data/types.ts` `TripDateChangeConfirmation`: add `reservationDocumentCount: number`. `src/lib/api/contract/trips.ts` `dateChangeConfirmation` (`:8-31`): add `reservationDocumentCount: z.number().int().nonnegative()`. `src/lib/validation-schemas.ts` `updateTripSchema`: reject `endDate < startDate` when both are sent, matching create.
- `src/components/arrivo/trip-date-change-confirmation-dialog.tsx`: show the reservation document count with the existing event-document wording.
- `src/lib/services/trips.ts` `updateTrip` (`:112-125`): replace the awaited `removeQueuedFiles(queued)` with `after(() => removeQueuedFiles(queued))`, keeping `deleteTrip`'s fallback shape (`:337-349`).
- `src/components/arrivo/packing-list-overview.tsx` is 370 lines, over the 250-line component limit. Extract the create-list form into a new `"use client"` component, `src/components/arrivo/packing-list-create-form.tsx`, with an explicit `PackingListCreateFormProps` interface (`onCreateList`, `onCreated`, plus the empty-state flag the overview uses).
  - **Moves with it:** the `newListName`/`showNewForm`/`creating` state, `handleCreateList` (`:56-75`) and its form JSX.
  - **F10 fix:** return before clearing the name or closing the form when `newId` is falsy.
  - **Kept as is:** the input's existing label or `aria-label`, and the 44px controls fixed in 5.1.
  - **Registration:** add the new file to the `packing-lists` entry in `tests/e2e/feature-map.mjs`, which `scripts/feature-map.test.mjs` requires for every `src/components/arrivo/*` file.
  - **Size:** if the overview is still over 250 lines, also extract the delete `AlertDialog` (`:339-367`) into `packing-list-delete-dialog.tsx` with its own props interface and test.
- `docs/api-v1.md`: deleted-id 409 on POST `/trips`, packing item/section create and packing list create; `reservationDocumentCount`; reversed-range 422.
- `tests/e2e/feature-map.mjs`: no new runtime files expected. Register any new step file under `api`.

## Tasks & Acceptance

**Execution (tests first in each step):**

- [ ] **Snapshot (F1, F2).**
  - Expand `src/lib/queries.test.ts` (tiebreaker order clauses; the executor is used when passed) and `src/lib/services/trips.test.ts` (getTrip opens a read-only REPEATABLE READ transaction and passes it through).
  - Add `api.feature` scenario "Trip snapshot ETag is stable with tied positions" in `steps/api-trip-snapshot.steps.ts`: seed tied packing positions, tied event positions and several reservations and expenses; two GETs give an equal ETag; then 304.
  - Then change the source.
- [ ] **Deletion records (F3, F4).**
  - Expand `deletion-records.test.ts` (new resources and messages), `services/packing.test.ts` (records per delete path and mode; refuse on create), `services/trips.test.ts` (delete records the trip; create refuses) and `services/trip-date-change.test.ts` (child ids recorded for both resolutions).
  - Extend `api.feature` with `steps/api-deleted-client-ids.steps.ts`: re-create after delete → 409 for a packing item, a section (delete-items mode), a packing list, a trip, and a note on a day removed by a date change. Move mode leaves moved items editable.
  - Then change the source.
- [ ] **Confirmation and range (F5, F6, F11).**
  - Expand `contract/trips.test.ts` (round-trip a confirmation with `removedDayLabels` and `reservationDocumentCount`) and `src/lib/validation-schemas.test.ts` (`updateTripSchema` rejects `endDate < startDate` when both are sent, and accepts either date sent alone).
  - Expand `trip-date-change.test.ts`: the count, the stale check with the count, and the reversed effective range in all three shapes.
  - Expand `trip-date-change-confirmation-dialog.test.tsx`: the count renders, and nothing renders when it is zero.
  - Extend `api.feature` in `steps/api-trip-dates.steps.ts`:
    - the preview carries `reservationDocumentCount` and apply removes those files;
    - the reversed-range PATCH is 422 with nothing changed;
    - the dateless overflow previews `removedDayLabels`, then applies on echo.
  - Then change the source.
- [ ] **Deferred file removal (AV3).**
  - Expand `services/trips.test.ts`: `updateTrip` schedules `removeQueuedFiles` through `after` and doesn't await it inline.
  - Update the `api-trip-dates.steps.ts` file-removal assertions to poll until each file is absent and its `pending_file_deletions` row has drained (mirroring `api-trip-delete.steps.ts:99-126`).
  - Then change the source.
- [ ] **List create failure (F10) and split.** Move the create-form cases out of `packing-list-overview.test.tsx` into a new colocated `packing-list-create-form.test.tsx`, and add one there: a failed create keeps the name and the open form and doesn't call `onCreated`. Keep the overview's cases covering how it composes the form. Then extract the component and apply the fix. Run the `packing-lists` feature to confirm creating a list still works end to end.
- [ ] **Docs and records.**
  - Update `docs/api-v1.md` and run `api-reference.test.ts`.
  - Record results in this plan.
  - Add F7 (accepted), F8 and the other deferred findings to `deferred-work.md` with retro references.
  - Run targeted Vitest, then `node scripts/run-e2e.mjs --server=kill "--grep=@feat:api|@feat:packing-tab|@feat:packing-lists|@feat:trips|@feat:trip-delete"`, then `build-validator` once on the final tree.

**Acceptance Criteria:**

- Given an unchanged trip with tied positions, when the API GET runs twice, then both responses carry the same ETag and a conditional GET returns 304.
- Given a deleted trip, packing list, packing item or section, or content removed by a date change, when a create reuses its id within 24 hours, then the API answers 409 and nothing is recreated.
- Given a date change that removes reservations with files, when the preview is shown, then the dialog states how many reservation files will be deleted, and applying the echoed confirmation succeeds.
- Given a PATCH whose effective end date precedes its start date, when it is sent, then the API answers 422 and the trip is unchanged.
- Given a date change that deletes files, when it commits, then the response doesn't wait on storage and the files are eventually gone.
- Given a failed packing-list create, when the error toast shows, then the typed name and form remain.

## Out of scope (deferred in the retrospective)

- F7: keyed retry after delete answers 404 (accepted: authorize-before-replay is the `withIdempotency` contract).
- F8: create replay compares mutable fields.
- F9: no-op date fields still renumber days.
- F12: cover generation.
- F13, F14: pull-templates bounds and name namespaces.
- F15: FX lookup under the trip lock.
- F16: separate client queues.
- F17: ETag `If-Match`.
- F19: minor items.
- AV1: `src/lib` → `src/app` imports.
- AV2: split `api.steps.ts`.
- Previous retro's invitation F3.

## Plan Change Log

- Plan-reviewer (2026-11-20): three BLOCKING findings, all fixed in place. The overview component was over 250 lines, so the create form is split out with its own test and feature-map registration. `reservationDocumentCount` is added to `src/data/types.ts`. A `validation-schemas.test.ts` step is added. One accessibility WARNING was addressed: the extracted form keeps its label and 44px targets. Scope check passed: every item traces to a retro finding. Original request: "Plan out fixes that need to happen now before the epic closes."
- Implementation (2026-11-21): dropped the `updateTripSchema` reversed-range refine and its `validation-schemas.test.ts` step. Zod 4 refuses `.extend()` on a refined object, and the schema is extended downstream; the service already rejects a reversed effective range (it must, since an omitted date takes the stored value), covered by `trip-date-change.test.ts` and the "rejects an end date before the start date" scenario.
- Implementation (2026-11-21): F7 reclassified from fix to accept. `withIdempotency` runs `authorize` before reading a stored result by contract, so the 404 reflects current state.
- Implementation (2026-11-21): the overview was still over 250 lines after the create-form split, so the delete dialog moved to `packing-list-delete-dialog.tsx` with its own test (overview now 215 lines). No `feature-map.mjs` edit: `src/components/arrivo/packing-list*.tsx` already covers both new files.

## Review Triage Log

## Verification

**Results (2026-11-21, branch `fix/epic-5-retrospective`, PR base `feature/api-v1`):**

- Targeted Vitest (queries, services, `src/lib/api`, `src/app/api`, packing-list and date-change components, feature-map, trips pages): 125 files, 2354 tests pass.
- build-validator on the final tree: LINT PASS, TSC PASS, BUILD PASS, COVERAGE PASS (497 files, 8266 tests; lines 98.04%, functions 97.56%, branches 94.03%), E2E PASS (1295 scenarios, full suite because shared source changed).
- One E2E failure on the first validator run: "Dating a dateless trip confirms and removes its overflow days by label". The base trip seed already holds "API untouched event" on day 2, so the confirmation correctly listed both day-2 events; the step asserted only one. Fixed the assertion (`arrayContaining`) in `api-trip-dates.steps.ts`; no service change.
