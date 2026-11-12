---
title: "Edit one event through the API"
type: "feature"
ticket: "1"
created: "2026-11-10"
status: done
baseline_revision: "be3213463c530502b888fdcd7fd4cf3374a3be1c"
route: "full"
route_source: "auto"
risk: "high"
review: "thorough"
review_source: "auto"
lenses_ran: ["blind-hunter", "edge-case-hunter", "verification-gap", "intent-alignment"]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md", "{project-root}/docs/plans/mobile-api.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Event edits run through the `updateEvent` server action, which nulls any time or location field not sent and cannot clear a note or confirmation number; mobile needs a partial `PATCH /api/v1/events/:eventId`. Services also still throw the HTTP-shaped `ApiError` for 409s (retro open question), and `actions.ts` edits run only `@feat:app-activity` (retro F-D4).

**Approach:** Tracer for epic 2: add a transport-neutral `ConflictError` mapped to 409 and migrate the pilot's 409 throws to it; map `actions.ts` to every feature it serves; ship an event service and partial PATCH route (Idempotency-Key opted in), switch `handleEventUpdate` to `useApiMutation`, and retire `updateEvent`. Branch `story/2-1-edit-one-event-api` from `feature/api-v1`; PR base `feature/api-v1`; switch back to `feature/api-v1` after the PR.

## Boundaries & Constraints

**Always:** Tests first. Services throw no `ApiError`; `errorResponse` maps `ConflictError` to 409 `conflict`; route-level tests still assert status 409. Lock trip, re-verify ancestry and editor role inside the transaction (pilot pattern); after-commit effects only when a row changed and the result is not a replay. Explicit column allow-list on update (never `id`, `tripId`, `dayId`, `position`, `displacedDate`). Day-less (unscheduled) events editable. Production-server E2E run per plan 1.10 (retro A-6).

**Never:** Touch create/delete/reorder actions, `getEventTripId` (still used by document actions), or `src/lib/validation-schemas.ts` / `SHARED_GLOBS` (forces the full suite). No migrations, no `CHANGELOG.md`, no client UUIDs, no timeout/field-error hardening (entry 2), no positioning extraction (entry 4). No push or PR without user confirmation.

## I/O & Edge-Case Matrix

| Scenario                      | Input / State                                          | Expected Output / Behavior                                  | Error Handling                                |
| ----------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------- |
| Partial edit                  | `{ name }` on event with location                      | 200 `TripEvent`; name changed, location/time/note untouched | —                                             |
| Clear                         | `{ locationName: null, …, note: null, startAt: null }` | Columns set to null; 200                                    | —                                             |
| Empty time                    | `{ startAt: "" }`                                      | Treated as null (existing event convention)                 | —                                             |
| Empty patch                   | `{}`                                                   | 200 current event; no write, no effects                     | —                                             |
| Day-less event                | event with `dayId` null                                | Edit persists                                               | —                                             |
| Linked id                     | `eventId = linked-<uuid>`                              | Never reaches DB                                            | 422 `validation_failed` (params are UUIDs)    |
| Viewer / stranger / anonymous | valid patch                                            | No write                                                    | 403 `forbidden` (+`requiredRole`) / 404 / 401 |
| Missing or other-trip event   | unknown UUID, or moved trip during lock                | No write                                                    | 404 `not_found`                               |
| Invalid body                  | blank name, unknown key, lat 91                        | No write                                                    | 422 `validation_failed` with fields           |
| Keyed retry                   | same `Idempotency-Key` + body                          | Stored response replayed, one write                         | Different body → 409 `conflict`               |

</frozen-after-approval>

## Code Map

- `src/lib/api/errors.ts` -- `errorResponse`: add `ConflictError` → `ApiError(409, "conflict", message)` beside the `TripNotFoundError` branch.
- `src/lib/api/idempotency.ts:101,147` -- two 409 `ApiError` throws → `ConflictError`; the 422 in `parseIdempotencyKey` stays (transport layer).
- `src/lib/services/checklists.ts` -- `collision()` (:59) → `ConflictError`; drop `ApiError` import. `lockTrip` (:32) and `runChecklistWrite` (:90) move to a shared module for reuse.
- `src/lib/services/trip-access.ts` -- home of `TripNotFoundError`/`TripForbiddenError`; pattern for the new error class.
- `src/app/(app)/trips/[tripId]/actions.ts:216-240` -- `updateEvent` to delete, with its now-unused `updateEventSchema`/`UpdateEventPatch` imports.
- `src/lib/validation-schemas.ts:103-124` -- `updateEventSchema.shape.*` fields reusable via `.unwrap().nullable().optional()` (read-only; do not edit).
- `src/lib/db-mappers.ts:115` -- `dbEventToType` for the response.
- `src/lib/api/contract/checklists.ts`, `src/app/api/v1/checklist-items/[itemId]/route.ts` (+ tests) -- contract and route templates (`defineEndpoint`, `lifecycleUuid`, `z.strictObject`, `{ idempotent: {} }`).
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts:86-100` -- `handleEventUpdate` sends the full event; `place-row.tsx:134,346,358` clears fields by setting them `undefined`, so the handler must send `null` for absent optional fields.
- `src/app/(app)/trips/[tripId]/use-checklist-handlers.ts:57` -- `useApiMutation` usage pattern; handler test mocks `@/lib/api/client` (`use-trip-detail-handlers.test.tsx:643`).
- `tests/e2e/feature-map.mjs:264-305` -- `actions.ts` sits only in `app-activity` (FEATURE_MAP wins over its `SHARED_GLOBS` line). Callers: day-planning (handlers, `delete-event-dialog`), documents/event-docs (`doc-row`, `event-doc-row`, `add-doc-dialog`, `trip-docs-tab`), trip-cover-overflow (cover picker, hero), trip-notes, trip-sharing and revocation-modal (share dialog, `saveContributorChanges`), trip-live-refresh (event rename).
- `tests/e2e/steps/api.steps.ts:63-118` -- scenario-owned trip with events, `headers(page)`, role switching; `e2e-seed-data.ts:43` supports `dayNumber: null`.
- `tests/e2e/steps/day-planning.steps.ts:390-455` -- event name/location/time steps; `tests/e2e/api-response.ts` for API waits.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/services/conflict-error.ts` + `.test.ts` -- `ConflictError(message)`, `name = "ConflictError"`.
- [ ] `src/lib/api/errors.test.ts`, `idempotency.test.ts`, `src/lib/services/checklists.test.ts` -- first: assert 409 mapping and `ConflictError` instances (replace `{ status: 409 }` matchers); then edit `errors.ts`, `idempotency.ts`, `checklists.ts`.
- [ ] `src/lib/services/trip-write.ts` + `.test.ts` -- move `lockTrip` and `runChecklistWrite` (renamed `runTripWrite`) unchanged; checklists imports them.
- [ ] `src/lib/api/contract/events.ts` + `.test.ts` -- `updateEvent` endpoint: PATCH `/api/v1/events/:eventId`, UUID params, strict body, every field optional, all but `name` nullable.
- [ ] `src/lib/services/events.ts` + `.test.ts` -- `updateEvent(actor, eventId, input, replay?)` covering the matrix; returns `TripEvent`.
- [ ] `src/app/api/v1/events/[eventId]/route.ts` + `.test.ts` -- `PATCH = apiRoute(updateEvent, …, { idempotent: {} })`.
- [ ] `use-trip-detail-handlers.test.tsx` then `.ts` -- `handleEventUpdate` → `useApiMutation(updateEvent)` keyed `event:<id>`, absent optional fields as `null`; remove the `updateEvent` action mock.
- [ ] `actions.ts`, `actions.test.ts`, `src/data/types.ts` -- delete `updateEvent`, its tests and `UpdateEventPatch`.
- [ ] `tests/e2e/feature-map.mjs` -- add `actions.ts` to day-planning, documents, event-docs, trip-cover-overflow, trip-notes, trip-sharing, revocation-modal, trip-live-refresh; add `conflict-error.ts`, `trip-write.ts`, `events.ts` and `src/app/api/v1/events/**` beside the existing service/route globs (api, day-planning, trip-live-refresh; packing-lists/packing-tab for the two shared modules).
- [ ] `api.feature` + `api.steps.ts` -- editor partial PATCH (absent unchanged, null clears, note included) on a scheduled and a day-less event persisting after reload; denied outline viewer 403 / stranger 404 / anonymous 401 unchanged; linked id 422.
- [ ] `day-planning.feature` + `day-planning.steps.ts` -- scenario: edit name, time and location, each awaiting `PATCH /api/v1/events/<id>` via `waitForApiResponse`, then reload and see all three; existing name/time steps await the PATCH.

**Acceptance Criteria:**

- Given an editor on day-planning, when they edit an event's name, time and location and reload, then all three show.
- Given the pilot's collision, replay-key reuse or key-lock timeout, when hit through a route, then the response is still 409 `conflict` and `grep ApiError src/lib/services` is empty.
- Given `actions.ts` changes, when `scripts/affected-e2e.mjs` classifies it, then every feature listed above is selected.
- Given the production build under `next start`, when `@feat:api|@feat:day-planning|@feat:trip-live-refresh` run, then all pass.

## Implementation Notes

- Implemented directly (no implementer subagent). All Execution tasks done; targeted Vitest (services, api, api/v1, trip `[tripId]`, `feature-map.test.mjs`) passes: 42 files, 828 tests.
- Production-server run (`@feat:api|@feat:day-planning|@feat:trip-live-refresh`): first run 159 pass, 3 fail. The 3 failures were `trip-live-refresh` scenarios (contributor demoted to viewer, manager demoted to editor, contributor sees trip deleted); they passed on the dev server. Cause: `src/lib/trip-events.ts` installed its `globalThis` topic maps only when `NODE_ENV !== "production"`, so a server action and the SSE route could hold separate maps under `next start`. Fixed here at the user's direction: the maps are now `globalThis` singletons in every environment, with two tests that load the module twice under `NODE_ENV=production`. After a rebuild, `@feat:trip-live-refresh` on the production server passes 6/6. The `api` and `day-planning` features passed on the production server before this fix, and the fix touches neither. `.next-prod/` is now in `.gitignore`.
- Review (step-04) ran four lenses; triage is in `## Review Triage Log`. One patch applied (contract validation cases). `build-validator` not yet run.

## Plan Change Log

## Review Triage Log

| Finding | Source | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- |
| Contract tests dropped the old action's name-length, malformed `endAt`, location-length and longitude cases | blind-hunter | medium | patch | Old `actions.test.ts` cases were deleted; `events.test.ts` only had lat 91, lng -181, malformed `startAt`. Added four cases to `contract/events.test.ts`. |
| Full-snapshot PATCH can revert a field edited in a second quick edit | blind-hunter, edge-case-hunter | low | defer | The retired action also sent the full event and nulled absent fields, so this is not new. `place-row` calls `onUpdate` with the whole local place, and the keyed queue keeps one event's edits in order. |
| No rollback of the row draft when the PATCH fails | blind-hunter, edge-case-hunter | low | defer | The retired action had no revert either (it threw unhandled); the toast is new. Fix is a refresh-on-error design choice. |
| `useApiMutation` drops queued edits when the hook unmounts | edge-case-hunter | low | defer | Shared pilot behavior (`use-api-mutation.ts:51`), not event-specific; only a queued edit during navigation is lost. |
| `startAt` after `endAt` accepted by a partial patch | blind-hunter, edge-case-hunter | low | defer | Old action and `updateEventSchema` had no ordering check either; pre-existing. |
| No-op patch still writes, bumps `updatedAt` and publishes | blind-hunter, edge-case-hunter | low | rejected | A UI edit changes at least one field; the pilot's `updateChecklistItem` behaves the same. Fix adds comparison logic for a rare case. |
| Keyed `{}` patch stores a stale replay body | edge-case-hunter | low | rejected | Replay returning the first response is the specified behavior; `{}` with a key is rare. |
| Uppercase event UUID changes the replay path and causes a false 409 | edge-case-hunter | false | rejected | `route.ts` builds the replay path with `concretePath(endpoint.path, params)` from the validated params, which `z.uuid().toLowerCase()` already normalized. |
| `trip-events.ts` change is outside the plan and "untouched" note | blind-hunter, edge-case-hunter, intent-alignment, verification-gap | false | rejected | The user asked for the live-refresh failures to be fixed in this story. Plan notes updated; production re-run recorded (6/6). |
| Plan file out of sync (notes, unchecked tasks, no prod re-run) | blind-hunter, verification-gap | low | rejected | Implementation Notes now record the fix and the 6/6 re-run. |
| Three event reads per request | blind-hunter | low | rejected | Same shape as the pilot's services; the third read serves the empty-patch return. |
| `it.each(["viewer","stranger"])` ignores its parameter; error class not asserted for 422 cases | blind-hunter | low | rejected | Copied from the pilot test shape, and the 403/404/422 mapping is asserted in `errors.test.ts` and e2e. |
| Keyed e2e does not assert a single write | blind-hunter | low | rejected | Identical JSON on replay plus unit coverage that a replay writes nothing; adding an audit trigger is out of proportion. |
| No test that an API PATCH reaches another open client; `revalidatePath` and activity not asserted | blind-hunter | false | rejected | `trip-live-refresh` "itinerary edit in a second tab" now exercises the API path and passes on dev and prod; `afterTripWrite` effects have their own test. |
| Docs and API reference for the new endpoint | blind-hunter | low | defer | No API reference exists for the pilot endpoints in this repo. |
| Partial semantics tested only at API level; no UI scenario clears a note | intent-alignment | low | rejected | Descriptive finding. Handler unit test asserts the `null` mapping; API e2e asserts `null` clears. |

## Design Notes

`runTripWrite` extraction is a move, not a redesign: entry 4 owns the positioning module, and later itinerary services reuse this helper. The handler keeps no optimistic overlay: `place-row` already shows its local draft, and the keyed queue orders rapid edits to one event. Sending every field (absent → `null`) also fixes today's silent failure to clear a note or confirmation number.

## Verification

**Commands:**

- `npx vitest run src/lib/services src/lib/api src/app/api/v1 "src/app/(app)/trips/[tripId]" scripts/feature-map.test.mjs` -- expected: pass
- `node scripts/affected-e2e.mjs` -- expected: lists the mapped features
- Production run (plan 1.10): `NEXT_DISTDIR=.next-prod npm run build`; `next start -p 3001` on `arrivo_e2e` with `playwright.config.ts` env plus `AUTH_TRUST_HOST=true`; `node scripts/run-e2e.mjs --server=reuse "--grep=@feat:api|@feat:day-planning|@feat:trip-live-refresh"`; remove `.next-prod` -- expected: pass
- `build-validator` -- expected: PASS
