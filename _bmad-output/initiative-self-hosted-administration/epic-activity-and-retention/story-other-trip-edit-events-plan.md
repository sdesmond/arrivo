---
title: "Other trip edit events"
type: "feature"
ticket: "5"
created: "2026-10-26"
status: "built"
baseline_revision: "3cc26197b5459495ee9053d34c2b5c8e4e705508"
route: "full"
route_source: "auto"
risk: "medium"
review: "quick"
review_source: "pinned"
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/epic-activity-and-retention.md"
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/activity-producer-inventory.md"
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Documents, covers, reservations, budget and trip packing edits leave no Activity trail; only itinerary edits (2.4) feed the batching API.

**Approach:** Call the existing `recordTripUpdated(user.id!, tripId)` once after commit at each actual mutation owner of those flows, so bursts merge into the same batched "Updated trip" row with actor and trip ID only.

## Boundaries & Constraints

**Always:** Emit once per successful actual change, after commit and outside transactions, at the function that performs the mutation (not delegating wrappers). Never await the helper. No-op paths (missing row, empty input, nothing added) emit nothing; refusals, access denials and thrown errors emit nothing.

**Never:** Instrument standalone packing templates (`saveTripListAsTemplate`), invitations or contributor flows (2.6), `deleteTrip`/`leaveTrip`, or wrappers (`uploadDocument`, `uploadDocumentToEvent`, `uploadCoverImage` in `[tripId]/actions.ts`; the exported packing functions that only delegate to `*Impl`). No change to `trip-activity.ts`, `activity.ts`, `activity-batches.ts`; no migration, new event type, trip names or details in events, `any`.

## I/O & Edge-Case Matrix

| Scenario                                                                 | Expected outcome                               |
| ------------------------------------------------------------------------ | ---------------------------------------------- |
| Document/cover/reservation/expense/packing change succeeds               | One `recordTripUpdated(userId, tripId)` call   |
| Access denied, validation error, mutation throws                         | No call                                        |
| Target row missing (idempotent no-op), empty reorder, template pull adds 0 | No call                                        |
| `saveTripListAsTemplate` succeeds                                        | No call                                        |
| Activity scheduling or lookup fails                                      | Mutation result unchanged (helper swallows)    |

</intent-contract>

## Code Map

- `src/lib/trip-activity.ts` -- `recordTripUpdated(userId, tripId)`: sync, never throws; reuse as is.
- `src/app/(app)/trips/[tripId]/actions.ts` -- owners next to `publishItineraryChanged`: `setTripCoverWithAttribution`, `removeTripCover`, `addDocument`, `removeDocument`, `renameDocument`, `attachTripDocToEvent`, `promoteEventDocToTrip`. Import already present. Skip wrapper exports at end of file.
- `src/app/(app)/trips/[tripId]/cover-upload-actions.ts` -- `uploadCoverImage`: emit after try/catch, before `publishTripEvent`.
- `src/app/(app)/trips/[tripId]/document-upload-actions.ts` -- `uploadDocument`, `uploadDocumentToEvent`: emit after insert.
- `src/app/(app)/trips/[tripId]/budget/actions.ts` -- `createExpense`, `updateExpense`, `recalculateConversions`, `deleteExpense` (only after delete, not on missing row).
- `src/app/(app)/trips/[tripId]/reservations/actions.ts` -- `createReservation`, `updateReservation`, `deleteReservation` (not on missing row).
- `src/app/(app)/trips/[tripId]/reservations/reservation-document-actions.ts` -- `uploadReservationDocument`, `removeReservationDocument`, `renameReservationDocument`, `promoteReservationDocToTrip`, `attachTripDocToReservation` (not on missing doc).
- `src/app/(app)/trips/packing-actions.ts` -- `*Impl`: `addPackingItemImpl`, `updatePackingItemImpl`, `togglePackingItemImpl` (skip if locked row gone), `removePackingItemImpl`, `removePackingSectionImpl` (skip if locked section gone), `reorderPackingItemsImpl` (after the non-empty transaction), `pullTemplatesOntoTripImpl` (only when `added > 0`); `createPackingList`, `renamePackingList`, `deletePackingList`. Not `saveTripListAsTemplateImpl`.
- Tests mock `@/lib/trip-activity` with `vi.hoisted` `recordTripUpdated`, mirroring `[tripId]/actions.test.ts` L5 and `transit-actions.test.ts` L15-16.
- `tests/e2e/feature-map.mjs` -- `instance-activity` entry (L39): add the new source files.

## Tasks & Acceptance

**Execution:**

- [ ] Colocated tests: `[tripId]/actions.test.ts`, `cover-upload-actions.test.ts`, `document-upload-actions.test.ts`, `budget/actions.test.ts`, `reservations/actions.test.ts`, `reservations/reservation-document-actions.test.ts`, `trips/packing-actions.test.ts` -- write first: one call on each success path, none on denial/throw/missing-row/empty/zero-added; template save emits none
- [ ] The eight source files above -- add `recordTripUpdated` import and calls per Code Map
- [ ] `tests/e2e/features/instance-activity.feature`, `tests/e2e/steps/instance-activity.steps.ts`, `tests/e2e/feature-map.mjs` -- scenario: add an expense and a reservation, then Activity shows one "Updated trip" row with no names or amounts; register new sources in the map
- [ ] `activity-producer-inventory.md` -- record 2.5 producers and the 2.6-only remainder

**Acceptance Criteria:**

- Given a user changes a trip's budget, reservations, documents, cover or packing list, when Activity is read, then one batched "Updated trip" row covers the burst with no details.
- Given a standalone packing template is saved or a mutation fails, when Activity is read, then no event was added.
- Given Activity scheduling or lookup fails, when a trip mutation runs, then the mutation and its response are unchanged.

## Implementation Notes

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 7 findings — high 0, medium 0, low 3, false 3, maybe-false 1
- findings:
  - `[low]` `[patch]` recalculateConversions emits when zero rows are recalculated — emission now requires a non-empty result; zero-result unit test added.
  - `[low]` `[reject]` document rename/promote/attach emit without a rows-affected check — only a lookup-to-update concurrent-delete race; fix needs returning() checks across six owners, unlikely in everyday use.
  - `[low]` `[reject]` missing denial/throw/missing-doc negative tests for some document and expense owners — shared denial/throw paths are covered and these functions call the same guards before the emit; extra tests add no new branch.
  - `[false]` `[reject]` addPackingItemImpl may emit on a no-op — every branch inserts a row or throws before the emit.
  - `[false]` `[reject]` regression table in actions.test.ts weakened — the four document actions now correctly assert one call; the 2.4 expectation was stale.
  - `[false]` `[reject]` feature-map entries narrow coverage — the files are only added to instance-activity; the diff removes nothing and the files stay mapped to their own features (document-upload, packing, cover, budget).
  - `[maybe-false]` `[reject]` e2e poll compares client Date.now() to a server timestamp — would need CI flake evidence; scenario passed in the affected run; below medium if true.

## Design Notes

Reuse of `recordTripUpdated` keeps the nonblocking, bounded-lookup contract from 2.4; no new helper. Emitting next to `revalidatePath`/`publishItineraryChanged` marks the post-commit point.

## Verification

**Commands:**

- `npx vitest run "src/app/(app)/trips"` -- expected: pass
- `npm run test:e2e:affected` -- expected: instance-activity and affected trip features pass

## Auto Run Result

- Summary: `recordTripUpdated` now fires once after commit at the document, cover, reservation, budget and trip-packing mutation owners; no-op paths and standalone template saves emit nothing.
- Files: seven action modules under `src/app/(app)/trips/` (emit calls), their colocated tests, `tests/e2e/features/instance-activity.feature` and `.steps.ts` (budget+reservation burst scenario), `tests/e2e/feature-map.mjs` (new sources), `activity-producer-inventory.md`.
- Review: 1 patch applied (recalculateConversions zero-result), 0 deferred, 6 rejected with reasons in the triage log.
- Follow-up review recommended: false.
- Verification: `npx vitest run "src/app/(app)/trips"` 652 passed; budget suite 24 passed after patch; subagent reported tsc and eslint clean and `test:e2e:affected` 332 passed (ran broad suite; ECONNRESET warnings in web server log not investigated). `build-validator` not run by this workflow.
- Residual risks: rename/promote/attach document emits are not rows-affected guarded.
