---
title: "Save the selected packing list as a template"
type: feature
ticket: 2
created: 2026-11-21
status: built
baseline_revision: "b1ea35918eb878dc6901aee7d6af4ec0f66c1ee2"
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

**Problem:** Save-as-template is a server action that copies every packing item on the trip, though the dialog counts only the open list, and API clients cannot save a list at all.

**Approach:** Add an idempotent `POST /api/v1/packing-lists/:listId/template` that copies only that list's ordered items into a new owned template with remapped section ids, and move the dialog caller to it with a draft-stable template id.

## Boundaries & Constraints

**Always:** Story branch `story/6-2-save-selected-list-as-template` from the latest `feature/api-v1`; PR base `feature/api-v1`, verify before opening, switch back afterward. Test first. Editor role on the list's trip, checked again on replay. Reuse the template name limit. No schema change.

**Never:** Migrate template rename, delete or items; change the `/packing` page reads; commit to the integration branch or target `main`; copy items of other lists, the default list or other trips.

## I/O & Edge-Case Matrix

| Scenario                  | Input / state                                 | Expected behavior                                                                                                 |
| ------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Save                      | Editor, `{tripId, id, name}`, list with items | Insert template `id`; copy that list's items in order, sections remapped, all unchecked; return `PackingTemplate` |
| Two lists                 | Trip has lists A and B                        | Only the selected list's items are copied                                                                         |
| Same id retry             | Same id and name                              | Return current template, no second copy                                                                           |
| Id conflict               | Same id, different name                       | 409 `conflict`                                                                                                    |
| Foreign template id       | Id owned by another user                      | 404 `not_found`                                                                                                   |
| Empty list                | Selected list has no items                    | 422 `validation_failed`, no write                                                                                 |
| Wrong trip / missing list | List not in `tripId`                          | 404 `not_found`                                                                                                   |
| Viewer or no access       | Role below editor                             | 404 `not_found`                                                                                                   |
| Keyed replay              | Same key and body                             | Stored response; denied after access is revoked                                                                   |
| Bad name                  | Blank or over limit                           | 422 `validation_failed`                                                                                           |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/packing-actions.ts` — only holds `saveTripListAsTemplate`; delete with `packing-actions.test.ts`. Re-export in `src/app/(app)/trips/actions.ts` (lines 7-15) and its tests in `actions.test.ts` go too.
- `src/lib/services/packing-templates.ts` — add `savePackingListAsTemplate(actor, listId, input, replay)`. Model on `renamePackingList` in `src/lib/services/packing.ts` (`runTripWrite`, `lockTrip`, `requireTripRole`, list-in-trip 404) and on `createPackingTemplate` here (`lockClientIds` `packing-template:<id>`, foreign id 404, same id/name returns row, conflict). Copy items ordered by `position`, insert sections first and map old to new ids as the deleted action did; reindex positions. Use `revalidate: ["/packing"]`, `markChanged` on write.
- `src/lib/api/contract/packing-templates.ts` — `savePackingListAsTemplate`: `POST /api/v1/packing-lists/:listId/template`, params `{listId: uuid}`, strict body `{tripId: uuid, id: uuid, name}` (name rules as create).
- New `src/app/api/v1/packing-lists/[listId]/template/route.ts` with `{ idempotent: {} }`; model on `packing-lists/[listId]/route.ts` and its `route.test.ts`.
- `src/app/(app)/trips/[tripId]/use-packing-handlers.ts` — `handleSaveAsTemplate(name, listId)` through `useApiMutation`; keep a draft-id ref keyed on `listId` + trimmed name, cleared on success; return the id on success else `undefined` (pattern of `handleCreatePackingList`). Update `use-packing-handlers.test.tsx`, `use-trip-detail-handlers.test.tsx`.
- `src/components/arrivo/packing-lists-view.tsx` line 175 — bind `activeListId`: `(name) => onSaveAsTemplate(name, activeListId)`, as `onPullTemplates` does. Widen the `onSaveAsTemplate` type in it and `trip-detail-tab-body.tsx` (96; a one-line type change, file already over 250 lines, no split here). `page-client.tsx` needs no edit. `PackingListView`, the dialog and `itemCount` (selected list) stay unchanged.
- `src/data/types.ts` 1472 — drop `SaveTripAsTemplateResult` once unused.
- `docs/api-v1.md` — add `### POST /api/v1/packing-lists/:listId/template` under Packing templates. `tests/e2e/feature-map.mjs` — in `save-trip-as-template` replace `packing-actions.ts` with the service, contract and route globs; remove the `packing-actions.ts` lines in the entries near 384 and 728.
- E2E: `tests/e2e/features/save-trip-as-template.feature` + `steps/save-trip-as-template.steps.ts` (its seeding makes one list; add a second), `api.feature` + `steps/api.steps.ts` (packing-list API fixtures near line 2549).

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/api/contract/packing-templates.test.ts`, `src/lib/services/packing-templates.test.ts`, `src/app/api/v1/packing-lists/[listId]/template/route.test.ts` -- write first: strict body and limits, selected-list-only copy with section remap and order, unchecked items, retry, conflict, foreign 404, wrong trip, empty 422, viewer 404, replay denied after revocation, route wiring -- covers the matrix
- [ ] `src/components/arrivo/packing-lists-view.test.tsx` -- update: save callback receives the active list id (not the default list or overview)
- [ ] `use-packing-handlers.test.tsx`, `use-trip-detail-handlers.test.tsx`, `actions.test.ts` -- update: endpoint call with list id, stable id across a failed retry, new id after a name edit, failure returns `undefined`; drop action tests
- [ ] `tests/e2e/features/save-trip-as-template.feature` + steps, `api.feature` + steps -- scenarios: trip with two lists saves only the open one and the dialog count matches; API keyed replay yields one template; wrong-trip and empty list rejected; replay denied after revocation; scenario-owned fixtures; await the POST before reload
- [ ] contract, service, route, handler, `packing-lists-view.tsx` and prop types -- implement; delete `packing-actions.ts`, the re-export and the unused type
- [ ] `docs/api-v1.md`, `tests/e2e/feature-map.mjs` -- document and register

**Acceptance Criteria:**

- Given a trip with two packing lists, when the user saves one in the web UI, then the template holds exactly that list's items and section links, once, and the original lists are unchanged.
- Given the dialog shows N items, when saved, then the template has N items.
- Given a retry with the same key or id, when it completes, then one template exists.
- Given access revoked, when a keyed request is replayed, then it is denied.
- Given template pull and checklist-from-template, when exercised, then they behave as before.

## Implementation Notes

## Plan Change Log

- Human-approved: matrix row "Viewer or no access" resolves as viewer → 403 `forbidden` (with `requiredRole`), no trip access → 404 `not_found`, matching `requireTripRole` and `errorResponse` used by every API endpoint. Frozen block left unchanged.

## Review Triage Log

- patch, medium: `markChanged()` in `savePackingListAsTemplate` runs `afterTripWrite`, which records a "trip updated" activity event and live-sync event for a template-only write (old action did neither). Fix: no trip activity; revalidate `/packing` and `/trips/${tripId}` directly, only when the template was created and not replayed.
- patch, medium: section remap never runs against real Postgres; no E2E fixture holds a section. Fix: add a section and a child item to the API "Doomed list" fixture and assert the stored child `labelId` equals the stored section row id.
- patch, low: API E2E "list of another trip" sends a random nonexistent `tripId`, so the `list.tripId !== tripId` branch is never reached end to end. Fix: use a real second trip the caller can edit.
- patch, low: `use-trip-detail-handlers.test.tsx` weakened to `toHaveBeenCalled()` and `expect.any(String)`. Fix: assert the failure message and the returned id.
- patch, low: `save-trip-as-template` feature-map entry omits `packing-lists-view.tsx`, which carries the active-list binding. Fix: add it to that entry.
- rejected, low: dangling `labelId` maps to null where the old action threw. FK is `onDelete: set null`, so a deleted section cannot leave a dangling id; fix adds a branch for an unreachable case.
- rejected, false: trip page not revalidated. `afterTripWrite` already revalidates `/trips/${tripId}`.
- rejected, false: `onSuccess` ordering and handler return. Same pattern as `handleCreatePackingList`; handler tests pass.
- rejected, false: dialog count vs template count with sections. Dialog counts non-label items and the template's displayed count follows the same rule; old action copied labels too.
- rejected, low: overlapping same-name saves reset the draft ref. Dialog blocks resubmit while pending; no demonstrated path.
- rejected, low: large-list bind-parameter limit and no item cap. No per-list item cap exists anywhere in packing contracts; not introduced here.
- rejected, low: same-id retry from a different list returns the first template. Matches matrix row "Same id retry".
- rejected, false: viewer 403 vs matrix. Resolved by human decision; see Plan Change Log.
- rejected, low: below-editor unit test mocks `TripNotFoundError`. 403 path is covered by the API E2E role outline.
- rejected, low: legacy raw-key idempotency rows linger. They expire by age under the retention sweep.
- rejected, false: plan artifact unfinished. Process artifact; completed at present step.
- rejected, low: `feature-map.test.mjs` assertion swap. Replaced assertion follows the removed file's mapping.

## Verification

**Commands:**

- `npx vitest run src/lib/services/packing-templates.test.ts src/lib/api src/app/api/v1/packing-lists "src/app/(app)/trips" src/components/arrivo/packing-list` -- expected: pass
- `npm run test:e2e:affected` -- expected: pass
- `build-validator` once after targeted checks pass.
