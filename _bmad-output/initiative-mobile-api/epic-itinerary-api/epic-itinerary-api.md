---
type: epic
title: "Notes and itinerary through the API"
parent: initiative-mobile-api
covers: [R3, R7]
after: []
assignee: ""
risk: high
---

# Notes and itinerary through the API

## Description

Migrate trip and event notes, event and day operations, and full-list ordering. Own shared timeline positioning extraction after the checklist pilot; preserve existing linked-event and locking behavior.

## Outcome

Notes, events, days, and full-list ordering run through services and /api/v1 in the production build.

## Requirements

- I1 (R3): Extract shared timeline positioning (append, insert-with-shift across events, itinerary notes and checklists, full-day reorder validation) into one service module used under the trip lock by the checklist service and every itinerary service.
- I2 (R3): Events: create on a day (client UUID; afterEventId, insertAtPosition or append), partial PATCH (absent = unchanged, null = clear; the event `note` column included, so no separate `/events/:id/note`), and idempotent `DELETE /api/v1/events/:eventId` with a keep-or-delete documents decision and storage cleanup after commit. Covers unscheduled (day-less) events. Reservation-derived linked events (`linked-*` ids) are never written.
- I3 (R3): Day item order: `PUT /api/v1/days/:dayId/order` with the complete typed ordered list; a stale list is 409 `conflict`; per-day keyed serialization in the client.
- I4 (R3): Day notes: `POST /api/v1/days/:dayId/notes` with position and client UUID, `PATCH`/`DELETE /api/v1/itinerary-notes/:noteId` (content edit, idempotent delete).
- I5 (R3): Trip notes: `POST /api/v1/trips/:tripId/notes` (prepend, client UUID), `PATCH`/`DELETE /api/v1/notes/:noteId` (partial, idempotent), `PUT /api/v1/trips/:tripId/notes/order` with the full ID list; a blank note is 422.
- I6 (R3): Days: `PATCH /api/v1/days/:dayId` (label, subtitle, weather, travelSummary); `POST /api/v1/trips/:tripId/days` (append, client UUID, 45-day cap as 422, end-date sync); `DELETE /api/v1/days/:dayId` removes only the current last day (retry 204; 409 `confirmation_required` when it has content and `confirmDestructive` is not set; 409 `conflict` when it is not last or is the only day); storage cleanup after commit; `/trips` stays revalidated.
- I7 (R3, carry-in): Transport-neutral `ConflictError` in `src/lib/services/`, mapped to 409 by `errorResponse`; the pilot's HTTP-shaped throws (`collision()` in the checklist service, the 409s in `src/lib/api/idempotency.ts`) migrate to it. Services throw no `ApiError`.
- I8 (R3, carry-in retro A-5): The UI sends draft-stable client UUIDs, reused on retry, on checklist, checklist-item, event, day-note and trip-note creates; the packing-source picker has an in-flight guard; a draft re-arms when a commit resolves without growing the timeline (retro F-5). A same-ID retry after the day's positions shift is a replay, not a collision (retro F-3).
- I9 (R2 hardening, carry-in retro A-3): Client request timeout so a hung write cannot stall a keyed queue; field errors kept per resource; a throwing `onSuccess` after a committed write is not reported as a failed save; a no-op checklist-item PATCH publishes no activity or live-sync effects.
- I10 (R7): Colocated service, contract, route, client and component tests; API waits replace server-action waits in every touched step (including `app-activity.steps.ts` day-note waits); `api.feature` cases for each new route; feature-map registrations, including mapping `src/app/(app)/trips/[tripId]/actions.ts` so edits run every feature it serves (retro F-D4).

## Done when

1. Notes, events, days, and full-list ordering run through services and /api/v1 in the production build.
2. Web create, edit, move, reorder, and delete flows persist after reload and preserve mixed timeline positions.
3. Partial PATCH and resource authorization follow the pilot contract; affected unit, route, and E2E checks pass.

## Boundaries

Migrate trip and event notes, event and day operations, and full-list ordering. Own shared timeline positioning extraction after the checklist pilot; preserve existing linked-event and locking behavior. R7 ownership covers tests and feature-map registration for this epic's own changes; the pilot owns shared API test infrastructure and cleanup owns final enforcement. No native phone UI.

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R3, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main. After opening the PR, switch back to feature/api-v1; before creating the next story branch, pull the latest feature/api-v1.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Inception: Story breakdown and exact test intent are completed when this epic is selected.
- Decision: 2026-11-10 — User approved the ten-entry breakdown as written.
- Decision: 2026-11-10 — Epic incepted into ten entries in `tickets.toml`. Entry 1 (edit one event through the API) is the tracer; it keeps ConflictError, the F-D4 feature-map fix and a production-server E2E run (retro A-6) in one session.
- Decision: 2026-11-10 — Client-hardening story (retro A-3) is in this epic, right after the tracer, so later keyed queues (day order, note order) are built on the timeout and per-resource field errors. Its covers id I9 maps to R2.
- Decision: 2026-11-10 — Draft-stable client IDs start early: entry 3 sets up the stable ID in `use-day-draft` for checklist creates, the picker guard and the draft re-arm; each later create story sends its own ID. This is the retro A-5 intent, placed after the tracer and hardening rather than first.
- Decision: 2026-11-10 — Remove last day becomes `DELETE /api/v1/days/:dayId` (only the current last day, idempotent), with 409 `confirmation_required` distinct from 409 `conflict`; the 45-day add cap is 422. `confirmation_required` is an additive v1 error code.
- Decision: 2026-11-10 — Single lane. Every entry edits `actions.ts`, `tests/e2e/feature-map.mjs` and `api.feature`/`api.steps.ts`, so each entry waits on the one before it; no parallel builds.
- Assumption: Day notes use `/days/:dayId/notes` and `/itinerary-notes/:noteId`; trip notes use `/notes/:noteId` (table names `itinerary_notes` and `notes`). `DELETE /api/v1/events/:eventId` with `keepDocuments` replaces both `deleteEvent` and `deleteEventWithDocDecision`.
- Source conflict: Endpoint inventory — lists 10 itinerary actions vs 8 in code (createEvent, updateEvent, deleteEvent, deleteEventWithDocDecision, reorderDayItems, updateDay, addDay, removeLastDay); transit mode belongs to epic-trips-packing. Inventory lists `/events/:id/note` vs the note being an event column edited through updateEvent; covered by `PATCH /api/v1/events/:eventId`.
- Source conflict: Done when 2 says "move" — no cross-day event move exists in code; "move" means within-day reorder.
- Boundary: add and remove day write `trips.endDate` as an itinerary side effect; trip metadata edits (`updateTripMetadata`, its event shifting) stay with epic-trips-packing. `getEventTripId` in `actions.ts` stays for document actions (epic-documents-covers-api) when event actions retire.
- Handoffs: entry 1's `ConflictError` is reused by entries 4, 7 and 8, and entry 4 replaces the `CONCURRENT_MODIFICATION` toast branch in `use-trip-detail-handlers.ts` with a 409-code check. Entry 3 decides retry equality for client-ID creates (F-3: position drift is a replay) and updates `adr-client-uuids-are-locked-before-the-trip-lock.md` or the idempotency ADR; entries 5–8 adopt it. Entry 4's positioning module is adopted by the checklist service in entry 4 and by entries 5 and 6 as they migrate createEvent and createNote (assumption from the set check: entry 4 does not rewire actions that 5 and 6 retire). Each route story names whether its route opts in to `Idempotency-Key` (`apiRoute` `idempotent` option); every mutation route does unless the story records why not. A day removed mid-edit is a `ConflictError`.

- Carry into story 2.1 (from the pilot retrospective, option 2 on the `ApiError` question): services must not throw HTTP-shaped errors. Add a typed `ConflictError` (transport-neutral, beside `TripNotFoundError`/`TripForbiddenError` in `src/lib/services/`), have `errorResponse` in `src/lib/api/errors.ts` map it to 409 `conflict`, and use it in the itinerary services instead of `ApiError`. Migrate the pilot's HTTP-shaped throws in the same story: `collision()` in `src/lib/services/checklists.ts` and the 409s in `src/lib/api/idempotency.ts`. Keep route-level tests asserting status 409. Source: `epic-checklist-api-pilot-retrospective.md`, Open questions.
