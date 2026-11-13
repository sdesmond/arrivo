---
title: "Rename and remove documents through the API"
type: feature
ticket: "3"
created: "2026-11-12"
status: built
baseline_revision: "5fd462eacf5ad5130d12e04c750ae33ddead6284"
route: full
route_source: auto
risk: high
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - "_bmad-output/initiative-mobile-api/AGENTS.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Document rename and remove (trip, event, reservation scope) are server actions with no retry safety. Reservation rename skips name validation and reservation rename/remove skip live sync. Removal deletes the file before the row, so a failed delete loses the file.

**Approach:** Extend story 3.1's document service with `PATCH` and `DELETE /api/v1/documents/:documentId`, both `Idempotency-Key` opt-in. Switch the three row components to a per-document keyed mutation and retire the six actions. Branch `story/3-3-rename-and-remove-documents-through-the-api`; PR base `feature/api-v1`.

## Boundaries & Constraints

**Always:** Editor role checked before and again under the trip lock (`lockTrip`); resolve a legacy row's trip via `documents.tripId ?? event.tripId ?? reservation.tripId`. `documentNameSchema` in every scope. DELETE body carries `tripId` (events/checklists precedent) so a repeat delete after the row is gone still authorizes; a mismatched trip is 404. Queue the file with `queueFileDeletions` in the delete transaction and `removeQueuedFiles` only after commit. Writes run through `runTripWrite`/`afterTripWrite`, so reservation documents publish live sync. Rows use `useApiMutation` with `key: doc.id`.

**Never:** Attach, promote or `eventId`/`reservationId` PATCH fields (entry 4), covers, cleanup-drain changes, new migrations or env variables, `promote*`/`attach*` action changes, direct storage imports.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Behavior | Error |
| --- | --- | --- | --- |
| Rename | Editor, valid name | 200 mapped `Document`; one effect set | — |
| Empty patch | `{}` | 200 stored row; no write, no effect | — |
| Bad name | Blank or >200 chars, any scope | No write | 422 |
| Delete | Editor, row with file | 204; row gone, file queued, removed after commit | — |
| Delete rolled back | Transaction fails | Row stays, file stays, nothing queued | error |
| Repeat delete | Row gone, authorized `tripId` | 204; no effect | — |
| Access | Viewer; stranger; foreign `tripId`; unknown id | No write | 403; 404 |
| Rapid rename | A→B→A, one doc | Requests serialized per doc; A persists | — |
| Cross-site | No client header/foreign origin | No write | 403 |

</frozen-after-approval>

## Code Map

- `src/lib/services/documents.ts` — add `renameDocument`/`removeDocument` beside the uploaders; reuse `readDocument`, `lockTrip`, `requireTripRole`, `runTripWrite`. Model on `deleteEvent` (`events.ts`, queue + `removeQueuedFiles` after) and `deleteChecklistItem` (repeat delete).
- `src/lib/api/contract/documents.ts` — add `updateDocument` (PATCH, `name: documentNameSchema.optional()`, strict) and `deleteDocument` (DELETE, `{ tripId }`, 204). Entry 4 extends the PATCH body.
- `src/app/api/v1/documents/[documentId]/route.ts` — new; `apiRoute(..., { idempotent: {} })` like `events/[eventId]/route.ts`.
- `src/components/arrivo/doc-row.tsx`, `event-doc-row.tsx`, `reservation-doc-row.tsx` — replace actions with `useApiMutation(updateDocument/deleteDocument)`, `key: doc.id`; add `tripId` prop (rows lack it). Keep the optimistic name, 44px targets, delete dialog and `inFlightRef`. Pattern: `use-checklist-handlers.ts`, `delete-event-dialog.tsx`.
- `src/components/arrivo/docs-block.tsx`, `reservation-docs-block.tsx`, `trip-docs-tab.tsx` — pass `tripId`; callers `place-row.tsx` (`place.tripId`) and `reservation-row.tsx` (`reservation.tripId`).
- `src/app/(app)/trips/[tripId]/actions.ts` — delete `addDocument`, `removeDocument`, `renameDocument`, and imports only they use (`addDocumentSchema`, `AddDocumentInput`, `assertValidDocumentUrl`); `reservations/reservation-document-actions.ts` — delete remove/rename. Then drop now-dead `addDocumentSchema`, `AddDocumentInput` if unreferenced.
- `tests/e2e/feature-map.mjs` — register the route and rows; `steps/api-documents.steps.ts`, `features/api.feature` — extend.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/api/contract/documents.test.ts`, `src/lib/services/documents.test.ts`, new `src/app/api/v1/documents/[documentId]/route.test.ts` -- tests first: matrix rows incl. reservation name 422, queued-file-after-commit, rollback keeps file, repeat delete 204, live sync for reservation scope, legacy null `tripId` -- proves contract before code
- [ ] `doc-row.test.tsx`, `event-doc-row.test.tsx`, `reservation-doc-row.test.tsx` -- rapid A→B→A sends two ordered PATCHes and ends on A, delete error keeps dialog, auth loss, no action imports -- row behavior
- [ ] `docs-block.test.tsx`, `reservation-docs-block.test.tsx`, `trip-docs-tab.test.tsx`, `place-row.test.tsx`, `reservation-row.test.tsx` -- assert `tripId` reaches each row (blocks and tab) and each caller passes `place.tripId`/`reservation.tripId` -- the new prop is the DELETE authorization input
- [ ] contract, service, route, three rows, blocks, tab, callers -- implement; retire six actions and their tests (`actions.test.ts`, `reservation-document-actions.test.ts`)
- [ ] `api.feature`, `api-documents.steps.ts` -- PATCH/DELETE: success, 422, viewer 403, stranger 404, cross-site 403, replay, repeat delete, file removed after delete
- [ ] `documents.feature`, `event-docs.feature`, `reservations.feature` + steps -- rename and delete a document, assert after reload; swap touched waits to armed `waitForApiResponse`
- [ ] `tests/e2e/feature-map.mjs` -- map `src/app/api/v1/documents/**` to api, documents, event-docs, reservations; row components to their features

**Acceptance Criteria:**

- Given an editor renames then deletes a document in each scope, when the page reloads, then the name persisted and the document and its file are gone.
- Given a rolled-back delete, when it fails, then the file still exists and no queue row remains.
- Given the retired actions, when searched, then no definition or caller remains.

## Implementation Notes

- Plan review against original story 3.3: scope and architecture pass; tests require `src/lib/validation-schemas.test.ts` updates when removing `addDocumentSchema`. Name that test before production edits, and remove its obsolete cases alongside the schema. Domain type removal belongs in `src/data/types.ts`.
- Preserve existing typed props and client boundaries. Row controls must meet 44px targets, rename inputs need accessible names, trip rename must be keyboard accessible, and existing Dialog primitives retain Escape and focus behavior. Include these cases in the three row tests. No broad UI redesign.
- Existing large caller components have the explicit one-prop-only scope exception recorded in Design Notes; avoid unrelated splitting. Row implementation should replace existing logic without growing files.
- Before editing Next.js routes, read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`. Follow repository AGENTS.md and `.agents/memories/` context. Tests first as listed above; run targeted tests before returning. Do not run build-validator: parent owns final validation.
- Actual branch: `story/3-3-rename-and-remove-documents-through-the-api`; PR base: `feature/api-v1`. User selected current branch. Baseline HEAD matches recorded revision; pre-existing untracked file is this plan only.

## Plan Change Log

## Review Triage Log

Iteration 0. No intent_gap or bad_plan entries; five patches, one defer.

| Finding | Lens | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- |
| Rename `onError`/`onAuthLost` reset to closed-over `doc.name`; after A→B ok, B→A failing shows A while server holds B | edge-case, blind, verification-gap | medium | patch (applied) | `doc-row.tsx:54-55` reads the prop captured at save time; no test rejects a rename or raises 401 on rename |
| Delete retry after a failed first attempt untested (`inFlightRef` reset moved into `onSettled`) | verification-gap | medium | patch (applied) | Code resets correctly; no row test clicks Delete twice after a rejection |
| Plan-required row cases missing: 44px on name button/rename input (doc-row, reservation-doc-row), keyboard rename, Escape | blind, verification-gap | low | patch (applied) | Implementation Notes list them; only event-doc-row updates its size assertion |
| Keyed PATCH/DELETE replay in `api.feature` cannot tell replay from re-execution | blind, verification-gap | medium | patch (applied) | Repeats the same name, so a re-run is a no-op; step only compares status and body |
| `assertValidDocumentUrl`/`DocumentUrlOwner` unreferenced outside `url-policy.test.ts` | edge-case | low | patch (applied) | Only caller (`addDocument`) was retired; direct deletion |
| Upload retry with a client id after the doc was deleted re-inserts it | edge-case | maybe-false (medium if real) | defer | `uploadDocument` inserts when no row exists, same as events; needs a decision on tombstones, not this story |
| Rename in flight while deleting: separate hooks, PATCH may 404 | edge-case | low | rejected | Result is an error revert on a row that is leaving; fix adds cross-hook state |
| Orphan legacy doc undeletable | edge-case, blind | false | rejected | `dbDocToType` already throws on orphans, so they never render; pre-existing |
| 204 vs 404 reveals id existence to an editor | edge-case | low | rejected | Plan design, matches `deleteEvent`/`deleteChecklistItem`; ids are UUIDs |
| `removeQueuedFiles` failure/`afterTripWrite` throw leaves a 500 | blind, edge-case | false | rejected | `removeQueuedFiles` catches per file and requeues; `afterTripWrite` is sync and fire-and-forget; drain covers leftovers |
| `place.tripId!` | blind, edge-case, verification-gap | low | rejected | Places come from stored events and always carry `tripId`; guard adds a branch |
| Live-sync asserted by count only | blind | low | rejected | `afterTripWrite` has one fixed payload; exact payload covered in the upload test |
| Rollback e2e trigger DDL on `documents` | blind | low | rejected | Trigger is row-scoped on one id and dropped in `finally`; uuid comes from the DB |
| DELETE body for mobile; docs update | blind | low | rejected | Precedent in events/checklists |
| Link documents lost with `addDocument` | blind | false | rejected | Plan Code Map retires `addDocument`; no caller remained |
| Cosmetic: route test aliases, tautological aria-label assert, duplicated mocks, blank lines, `findScenarioDocument` by name | blind | low | rejected | No named harm |
| Plan shows empty review state | blind | false | rejected | Review was in progress; edits to this plan are out |
| "Six actions" vs five exports | intent-alignment | false | rejected | AC met: no definition or caller remains |

## Design Notes

DELETE takes `tripId` in the body rather than only the path id: after the row is gone nothing else ties a repeat call to a trip, and answering 204 for any caller would let a stranger probe ids. Same contract as `deleteEvent`, `deleteChecklistItem`.

`place-row.tsx` (398 lines) and `reservation-row.tsx` (647 lines) already exceed 250 lines. This story changes one prop pass in each (no new JSX or logic), so splitting them stays out of scope; the implementer must not add code there beyond that line. The three row components (230–241 lines) must not grow: the hook replaces the action calls.

## Verification

**Commands:**

- `npx vitest run src/lib/services/documents.test.ts src/lib/api/contract/documents.test.ts "src/app/api/v1/documents" src/components/arrivo/doc-row.test.tsx src/components/arrivo/event-doc-row.test.tsx src/components/arrivo/reservation-doc-row.test.tsx scripts/feature-map.test.mjs` -- expected: all pass
- `npm run test:e2e:affected` via build-validator after final change -- expected: PASS
