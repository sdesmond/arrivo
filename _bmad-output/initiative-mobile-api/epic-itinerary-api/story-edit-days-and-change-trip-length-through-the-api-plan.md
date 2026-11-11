---
title: "Edit days and change trip length through the API"
type: "feature"
ticket: "8"
created: "2026-11-11"
status: "built"
baseline_revision: "fe042cd2aa2a904a48fad27e6b73cdfd3e01fecc"
route: "full"
route_source: "auto"
risk: "high"
review: 'thorough'
review_source: 'auto'
lenses_ran: ["blind-hunter", "edge-case-hunter", "verification-gap", "intent-alignment"]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Day edits, add-day and remove-last-day still run as server actions. Add-day sends no client UUID, so a retry can add two days, and mobile has no endpoint for any of the three. Remove-last-day deletes content and writes `trips.endDate`.

**Approach:** Day services on `PATCH /api/v1/days/:dayId`, `POST /api/v1/trips/:tripId/days` and `DELETE /api/v1/days/:dayId`, all opting in to `Idempotency-Key`. Two transport-neutral errors carry 409 `confirmation_required` and the 422 day cap. The day handlers and the remove-day dialog use the API; `updateDay`, `addDay` and `removeLastDay` retire. Branch `story/2-8-edit-days-and-change-trip-length-through-the-api` from the latest `feature/api-v1` (created); PR base `feature/api-v1`; switch back to `feature/api-v1` after the PR.

## Boundaries & Constraints

**Always:** Tests first. Authorize with `requireTripRole(editor)` before and after `lockTrip`; claim the add-day client UUID (`day:<id>`) with `lockClientIds` before the trip lock. Retry equality is entry 3's rule: same `id` and same trip replays the stored day (no write, no effect); an ID held by a trip the actor cannot see is 404. Add appends with the next `dayNumber`; a dated trip gets the day after the last date and `trips.endDate` follows it, a dateless one gets `date: null`; 45 days or more is 422. Delete takes `tripId` and optional `confirmDestructive` in the body; missing day is 204 with no effect; only the highest `dayNumber` can go (409 `conflict` otherwise, and for the only day); content without `confirmDestructive` is 409 `confirmation_required`; delete sets `endDate` to the preceding day's date when it has one, queues event-document files with `queueFileDeletions` in the transaction, and runs `removeQueuedFiles` after commit. Add and delete also revalidate `/trips`. PATCH is partial: absent keeps, `null` clears `subtitle`, `weather` and `travelSummary`; `label` cannot be null; an empty patch writes nothing. Services throw no `ApiError`.

**Never:** Touch `updateTripMetadata` or trip date shifting, event or note services, migrations or `CHANGELOG.md`. Add retries or timers. Push or open a PR without user confirmation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Partial edit | `PATCH {label}` | 200 day; other fields kept; subtitle `null` clears | Over-length or null label: 422 |
| Append, dated | Last day 2026-05-02 | New day 2026-05-03, `endDate` 2026-05-03 | — |
| Append, dateless | Trip without dates | New day, `date` null | — |
| Same-ID replay | Same `id`, same trip | 200 stored day, no write or effect | Other trip: 404 |
| Cap | 45 days | No write | 422 `validation_failed` with the cap message |
| Delete last, empty | Last day, no content | 204; `endDate` = preceding date | — |
| Delete with content | Content, no `confirmDestructive` | No write | 409 `confirmation_required` |
| Delete confirmed | Content, `confirmDestructive: true` | 204; rows and files gone after commit | — |
| Retry or absent | Day already gone | 204, no effect | — |
| Not last or only day | Earlier day, or one day left | No write | 409 `conflict` |
| Denied | Viewer / stranger / anonymous | No write | 403 / 404 / 401 |

</frozen-after-approval>

## Code Map

- `src/lib/services/events.ts:155-262`, `itinerary-notes.ts` -- mirror `createEvent` (claim, foreign-trip viewer check, replay) and `deleteEvent` (body `tripId`, queued file deletion, absent row succeeds). `src/lib/services/days.ts` (has `reorderDay`) gains `updateDay`, `addDay`, `deleteDay`.
- `src/lib/api/contract/days.ts` -- add `updateDay`, `addDay`, `deleteDay` beside `reorderDay`; reuse the day field limits from `updateDaySchema` in `src/lib/validation-schemas.ts` (export field schemas rather than copy).
- `src/lib/services/conflict-error.ts` (pattern), new `confirmation-required-error.ts` and `validation-failed-error.ts`; `src/lib/api/errors.ts` maps them to 409 `confirmation_required` and 422 `validation_failed` (message kept, optional fields).
- `src/lib/services/trip-write.ts`, `trip-write-effects.ts` -- optional extra paths revalidated after a changed, non-replayed write; add and delete pass `/trips`.
- `src/lib/db-mappers.ts`, `src/data/types.ts` -- `dbDayToType` and a `DayRecord` result type (day fields, no timeline items).
- `src/lib/api/use-api-mutation.ts` -- option for an expected failure the caller handles (no toast; `onError` still runs), so `confirmation_required` opens the dialog without a toast.
- `src/app/api/v1/days/[dayId]/route.ts`, `src/app/api/v1/trips/[tripId]/days/route.ts` (new) -- `apiRoute(..., { idempotent: {} })`; copy `events/[eventId]/route.ts`.
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts:160-175,306-330` -- `handleDayUpdate` keeps its promise contract (rejects on failure, key `day:<id>`), maps a present-but-undefined field to `null`; `handleAddDay` holds a draft-stable UUID in a ref, reused on retry, cleared on success, replaced on 409; `handleRemoveLastDay` sends `confirmDestructive`; `addingDay` and `removingDay` come from the mutations' `isPending`.
- `src/app/(app)/trips/[tripId]/actions.ts:30-234` -- delete the three actions and the helpers only they use (`MAX_TRIP_DAYS`, `nextCalendarDate`, `getDayTripId`; grep each). `UpdateDayPatch`, `RemoveLastDayResult` and `updateDaySchema` go only if unused. `actions.test.ts:299,727,833,998` and `use-trip-detail-handlers.test.tsx:46-48` lose their cases.
- `tests/e2e/feature-map.mjs` -- add `src/app/api/v1/trips/*/days/**` and the new service files wherever `src/app/api/v1/days/**` appears (`api`, `day-planning`, `trip-live-refresh`, `linked-events`).
- `tests/e2e/features/day-planning.feature:98-136`, `steps/day-planning.steps.ts:1066-1145`, `api.feature` + `steps/api.steps.ts`, `tests/e2e/api-response.ts` -- API waits.

## Tasks & Acceptance

**Execution:**

- [ ] `contract/days.test.ts` then `.ts` -- strict keys, lowercase UUIDs, field caps, `tripId` required on delete, 204.
- [ ] `validation-schemas.test.ts` then `validation-schemas.ts` -- exported day field schemas keep today's caps and messages.
- [ ] `db-mappers.test.ts` then `db-mappers.ts` -- `dbDayToType` maps nullable date, subtitle, weather and travel summary to absent fields.
- [ ] `confirmation-required-error`, `validation-failed-error`, `errors.test.ts` then `errors.ts` -- status, code, message.
- [ ] `trip-write.test.ts`, `trip-write-effects.test.ts` then source -- extra paths run once, not on replay or no-op.
- [ ] `use-api-mutation.test.tsx` then `.ts` -- expected failure: no toast, `onError` runs.
- [ ] `days.test.ts` then `days.ts` -- every matrix row, plus concurrent same-ID claim and day removed mid-edit.
- [ ] `days/[dayId]/route.test.ts`, `trips/[tripId]/days/route.test.ts`, then routes -- all register `{ idempotent: {} }`.
- [ ] `use-trip-detail-handlers.test.tsx` then `.ts` -- UUID reused across a failed add and replaced after 409; clear sends `null`; `confirmation_required` calls the callback with no toast.
- [ ] `actions.ts`, `actions.test.ts` -- remove the actions, tests and dead helpers.
- [ ] `api.feature` + `api.steps.ts` -- partial edit, append with replay and cap, end-date sync, keyed and repeated delete, both 409 codes, denied and invalid.
- [ ] `day-planning` steps -- rename a day, add one, remove a populated one through the dialog, each awaiting its API response, persisted after reload with the `/trips` end date updated.
- [ ] `feature-map.mjs` -- register the new files.

**Acceptance Criteria:**

- Given an add-day request whose response was lost, when the user clicks Add Day again, then both requests carry the same `id` and the trip has one new day.
- Given a populated last day, when removal is confirmed in the dialog and the page reloaded, then the day and its content are gone and the trips list shows the earlier end date.
- Given the change set, when `scripts/affected-e2e.mjs` runs, then it selects `api`, `day-planning` and `trip-live-refresh`.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding (lens) | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| `pendingSubtitleRef` reset in `DayCardHeader` catch not pinned by a test (verification-gap) | medium | patch | Filed evidence: failure test never re-renders with the new subtitle, so it passes without the reset. Add a test that rejects, re-renders with the same subtitle, and asserts the editor stays open. |
| Day-update test named "under its queue key" never asserts the key (blind) | low | patch | Test asserts endpoint and params only; add an ordering test for rapid edits to one day, like the event one at line 1016. Direct test addition. |
| DELETE carries a JSON body (blind, intent) | false | reject | Frozen Boundaries fix the body shape; `deleteEvent` already uses a body `tripId`. |
| Delete of a missing day returns 204 (existence oracle) (blind) | false | reject | Frozen matrix row "Retry or absent: 204"; caller must be editor on the supplied trip first. |
| Stale client targets a non-last day, gets 409 toast, no refresh (blind, edge-case) | low | reject | Real but rare: live sync refreshes the day list; fix adds a refresh branch. Unlikely in everyday use. |
| `MAX_TRIP_DAYS` duplicated (blind) | low | reject | Constant and message moved from the retired action unchanged; no new drift. |
| `onConfirmationRequired(true)` hard-coded (blind) | low | reject | Callback signature kept by plan; no behavior harm. |
| Clearing the label is a silent no-op (blind) | false | reject | UI edits only the subtitle; no path sends a cleared label. |
| Event-document URLs shared after promotion (blind) | false | reject | `promoteEventDocToTrip` sets `eventId` null, so promoted docs are not in the `eventId` query; old action behaved the same. |
| `confirmation_required` replay with same key (blind) | false | reject | Web client sends no `Idempotency-Key`; 409 is not stored; the confirmed retry passed in day-planning E2E. |
| Add-day no-days / bad-order mapped to 409 (blind) | low | reject | Was a plain throw; harm unclear, fix adds a new error class. |
| `addDayId` kept after 404/403/422 (blind, edge-case) | low | reject | A 404 needs a random UUID held by an unseen trip; 403/422 repeat identically regardless of id. |
| Weak E2E "response as stored", day-note scenario gaps, route test index access, `revalidate` branch (blind) | low | reject | Cosmetic or test-style; fixes are more than a direct correction. |
| `handleDayUpdate` rejects if the hook unmounts mid-write (edge-case) | low | reject | Needs unmount between commit and response; the editor is gone then anyway. |
| Keyed PATCH retry after day deleted returns 404 (edge-case) | false | reject | Frozen Design Notes: PATCH of a missing day is 404. |
| Double click on add/remove (edge-case) | false | reject | Add reuses the id (replay); remove of a gone day is 204; buttons disable on `isPending`. |
| Intent-alignment readings | n/a | none | Descriptive; no defect claimed. |

## Design Notes

A day gone before the request cannot be authorized from the path alone, so PATCH of a missing day is 404, and DELETE carries `tripId` so a retry after removal is still 204. The retired `subtitle` clear was a silent no-op (Drizzle ignores `undefined`); the API clears with `null`.

`use-trip-detail-handlers.ts` and `actions.ts` are long; this story edits in place and adds no splits.

## Verification

**Commands:**

- `npx vitest run src/lib/services src/lib/api src/app/api/v1 "src/app/(app)/trips/[tripId]" scripts/feature-map.test.mjs` -- expected: pass
- `node scripts/affected-e2e.mjs` -- expected: lists api, day-planning, trip-live-refresh
- `build-validator` -- expected: PASS
