---
title: "Trip and itinerary events"
type: "feature"
ticket: "4"
created: "2026-10-26"
status: "built"
baseline_revision: "d682680c3cb9fe7d92c2bb20023c540673996582"
route: "full"
route_source: "auto"
risk: "medium"
review: "quick"
review_source: "pinned"
lenses_ran: [quick]
review_loop_iteration: 1
context:
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/epic-activity-and-retention.md"
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/activity-producer-inventory.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trip creation and itinerary edits leave no Activity trail. The batching service (2.2) has no producer.

**Approach:** Record an individual `trip_created` event at `createTrip`, and a batched `trip_updated` event at each successful trip, day, event, note, checklist and transit-mode mutation owner, after commit, carrying only actor and trip ID.

## Boundaries & Constraints

**Always:** Call `recordActivity` once per successful mutation, after commit and outside transactions, at the actual mutation owner. Actor username comes from a best-effort lookup that never throws; if it fails, skip the event. Event data is actor plus `tripId` only. Refusals, `confirmation-required` returns, access denials and thrown errors emit nothing.

**Never:** Instrument budget, reservations, documents, covers, packing, invitations or contributor flows (2.5, 2.6), or wrapper exports (`saveContributorChanges` in `[tripId]/actions.ts`, packing re-exports). No events for `deleteTrip` or `leaveTrip` (not in the approved event list). Read-only `route-actions.ts` is untouched. No migration, new columns, retries, trip names or details in events, `any`.

## I/O & Edge-Case Matrix

| Scenario                                                                                                 | Expected outcome                                                                         |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Trip created                                                                                             | One `trip_created` row with actor and new trip ID; cover work and days do not add events |
| Successful itinerary edit                                                                                | One batched `trip_updated` merge; bursts within 10 min share one row                     |
| `updateTripMetadata` returns `confirmation-required`, or `removeLastDay` returns `confirmation-required` | No event                                                                                 |
| Access denied, validation error, concurrent-modification throw                                           | No event                                                                                 |
| Username lookup fails, or Activity scheduling/write fails                                                | Mutation result and response unchanged                                                   |

</frozen-after-approval>

## Code Map

- `src/data/types.ts:56` -- add `ActivityEventType.TripCreated: "trip_created"`.
- `src/components/arrivo/instance-activity.tsx:8` -- `EVENT_LABELS` is a typed `Record`; add `{ type: "Trips", action: "Created trip" }`.
- `src/lib/trip-activity.ts` (new) -- `recordTripCreated(identity, tripId)`, `recordTripUpdated(userId, tripId)`: return synchronously, scheduling username lookup with `after()`; catch scheduling and callback failures, skip missing actors, then call `recordActivity` from the callback (nested `after` is supported). Bound lookup work to 5 seconds; ignore late resolution/rejection, never emit after timeout, clear timer, no retries. Never await this helper from mutation owners.
- `src/app/(app)/trips/actions.ts` -- `createTrip` (L292): emit after the transaction, before cover work; `userId` and `username` are already selected in-transaction. `updateTripMetadata` (L419): emit only on `"saved"`, before `revalidatePath`.
- `src/app/(app)/trips/[tripId]/actions.ts` -- emit next to `publishItineraryChanged(tripId)`, which marks commit: `createEvent` L182, `updateEvent` L233, `deleteEvent` L254, `deleteEventWithDocDecision` L278 (separate export, no double emission), `reorderDayItems` L310, `updateDay` L364, `addDay` L373, `removeLastDay` L420 (only `"removed"`), day notes L560/583/594, trip notes L605/628/653/664, checklists L694-L792, `addChecklistFromPackingSource` L851. `tripId` is in scope in each.
- `src/app/(app)/trips/[tripId]/transit-actions.ts` -- `updateTripTransitMode`: emit after `db.update`, before `{success:true}`.
- Do not change: `activity.ts`, `activity-batches.ts`, `route-actions.ts`, `saveContributorChanges`, packing wrappers, `deleteTrip`, `leaveTrip`.
- Tests mock `@/lib/auth-helpers` and `@/db`; mirror `profile/actions.test.ts` L107-114 (`vi.mock("@/lib/activity")`). Mock `@/lib/trip-activity` in trip action tests so existing `@/db` mocks stay valid.
- `tests/e2e/feature-map.mjs` -- `instance-activity` entry (L39): add the three trip action files and `trip-activity.ts`; existing `trips`/`create-trip`/`day-planning` entries keep their sources.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/trip-activity.test.ts`, `src/components/arrivo/instance-activity.test.tsx` -- write first: lookup success emits correct input; lookup throw or empty skips and never throws; scheduling failure and hung lookup never block the action; fake-timer timeout suppresses late emissions; new label -- helper contract
- [x] `src/app/(app)/trips/actions.test.ts`, `src/app/(app)/trips/[tripId]/actions.test.ts`, `src/app/(app)/trips/[tripId]/transit-actions.test.ts` -- write first: one emit per success path, none on denial, throw, `confirmation-required`; `deleteEvent` and `deleteEventWithDocDecision` each emit once -- matrix
- [x] `src/data/types.ts`, `src/components/arrivo/instance-activity.tsx`, `src/lib/trip-activity.ts` -- add type, label, helper
- [x] `src/app/(app)/trips/actions.ts`, `src/app/(app)/trips/[tripId]/actions.ts`, `src/app/(app)/trips/[tripId]/transit-actions.ts` -- wire synchronous scheduling per Code Map; never await Activity lookup on response path
- [x] `tests/e2e/features/instance-activity.feature`, `tests/e2e/steps/instance-activity.steps.ts`, `tests/e2e/feature-map.mjs` -- scenarios: create trip then Activity lists "Created trip" with the trip ID; edit itinerary twice then one "Updated trip" row; no trip names in the table. Use mothers, poll writes, await action POST before reload. Run `npm run test:e2e:affected`
- [x] `activity-producer-inventory.md` -- record 2.4 producers and the 2.5/2.6 renumbering (inventory still says trips are 2.5)

**Acceptance Criteria:**

- Given a user creates a trip, when an admin opens Activity, then one "Created trip" row shows the creator and trip ID.
- Given several itinerary edits within ten minutes, when Activity is read, then one "Updated trip" row covers them with no edit details.
- Given Activity scheduling, write or username lookup fails, when a trip mutation runs, then the mutation and its response are unchanged.

## Implementation Notes

- Added minimal trip creation and update producers. Update identity lookup runs after response with a five-second bound; scheduling, lookup and persistence failures leave mutation results unchanged.
- Plan review passed all five checks. Final quick review found no issues after correcting blocking lookup; nothing deferred.


## Plan Change Log

- Review iteration 1: revised helper contract to synchronous scheduling with bounded lookup inside after(), per epic nonblocking contract. Avoid awaiting Activity on mutation response path. KEEP: inventoried owner placements after commit; captured creation identity; exactly-once/refusal tests; creation/batched-edit/privacy browser scenarios; feature map and producer inventory. Automatic approval rejected broad rollback, so preserve existing work and correct in place.


## Review Triage Log

- high / bad_plan: Awaited username lookup could stall already-committed mutation indefinitely; singleton DB has no query timeout and recorder timeout starts only after lookup. Move lookup into bounded post-response work; preserve primary outcome.


## Design Notes

`recordTripUpdated` schedules one bounded post-response `users` read per mutation because `requireUser()` exposes only the ID. Both scheduling and lookup fail closed without blocking the response. Emitting beside `publishItineraryChanged` reuses the file's existing "committed" marker.

## Verification

Observed final results: 679 targeted Vitest tests passed; full coverage run passed 4,815 tests across 302 files. Coverage: lines 97.03%, functions 96.85%, branches 91.87%. Lint, TypeScript and production build passed; 17 static pages generated. Scoped Playwright passed 49 tests after dedicated E2E reset and migration.

Affected selector returned full due to shared event type. To honor project restriction on automatic full-suite gates, browser verification used direct Playwright CLI with --grep matching instance-activity, trips, create-trip and day-planning feature tags. Windows wrapper quotes interfere with regex; direct CLI succeeded. Validator recorded only this explicit scope, not full-suite validation.

Matrix audit: creation and batching/privacy browser scenarios passed; action tests cover confirmation-required and access/validation/concurrent-edit refusals. Real helper/recorder transit action tests cover scheduling failure, lookup rejection/hang and batch-write rejection while preserving success. Helper fake-timer tests cover timeout and late-result suppression.


**Commands:**

- `npx vitest run src/lib/trip-activity src/app/(app)/trips src/components/arrivo/instance-activity` -- expected: pass
- `npm run test:e2e:affected` -- expected: instance-activity and affected trip features pass
