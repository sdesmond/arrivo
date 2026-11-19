---
type: epic
title: "Trips and trip packing through the API"
parent: initiative-mobile-api
covers: [R4, R7]
after: []
assignee: ""
risk: medium
---

# Trips and trip packing through the API

## Description

Migrate trip lifecycle, trip packing items and ordering, and trip-list operations; provide GET trip snapshot with payload ETag. Preserve pack-list/template interactions and ownership.

## Outcome

Trip lifecycle and packing operations use /api/v1 in the production build.

## Done when

1. Trip lifecycle and packing operations use /api/v1 in the production build.
2. GET trip detail returns TripDetailPayload with an ETag derived from serialized payload, while pages keep direct reads.
3. Packing absolute-state edits, full ordered lists, UUID creates, replay, and trip lifecycle pass affected checks.

## Boundaries

Migrate trip lifecycle, trip packing items and ordering, and trip-list operations; provide GET trip snapshot with payload ETag. Preserve pack-list/template interactions and ownership. R7 ownership covers tests and feature-map registration for this epic's own changes; the pilot owns shared API test infrastructure and cleanup owns final enforcement. No native phone UI.

Own updateTripTransitMode from transit-actions.ts as trip metadata. Packing-templates owns migration of saveTripListAsTemplate and its caller; this epic consumes that operation during coexistence and does not duplicate its migration.

Packing lists (trip_packing_lists) and pullTemplatesOntoTrip are this epic's: the source inventory assigns `packing-actions.ts` here and only `packing/actions.ts` and `packing/[templateId]/actions.ts` to packing-templates. Cover stays with documents-covers (`/trips/:id/cover`); PATCH /trips/:id carries no coverImageUrl, and trip creation consumes the existing cover search/tile code unchanged. Location search actions in trips/actions.ts belong to locations-routing.

## Requirements

- T1 (R4): Packing item edits use absolute state — PATCH /packing-items/:id {name?, isPacked?} replaces togglePackingItem/updatePackingItem; DELETE of a missing item returns 204.
- T2 (R4): Packing item and section creates accept client UUIDs and before/after placement; a replayed create returns the existing row; section removal takes an explicit mode (delete items or move to ungrouped).
- T3 (R4): Packing order is a PUT of the full ordered list for one packing list carrying each item's section (labelId); partial or stale lists are rejected.
- T4 (R4): Packing lists (create, rename, delete with item cascade) and pulling owned templates onto a trip run through the API; saveTripListAsTemplate stays with packing-templates and is consumed unchanged.
- T5 (R4): Trip create (client UUID, generated cover tile once), GET /trips list for API clients, partial metadata PATCH (name, destination, budget/currency conversion, tags, transitMode; dead updateTripTransitMode retired), date change with confirmation-required 409 preview, conflict resolution and stale-confirmation rejection, and manager-only DELETE (204 when missing) with live events; file removal in date-change deletion and trip delete goes through the crash-safe file-cleanup queue.
- T6 (R4): GET /trips/:id returns TripDetailPayload with ETag = hash of the serialized payload and 304 on matching If-None-Match; pages keep direct reads.
- T7 (R4, R7): requireTripRole 404/403, afterTripWrite activity, existing live events, withIdempotency replay and lockTripForUpdate ordering are preserved.
- T8 (R7): Colocated service/contract/route/client/component tests, API and feature E2E, docs/api-v1.md, feature-map repointing (including app-activity globs for trips/actions.ts, transit-actions.ts and packing-actions.ts), retirement of migrated actions by export name, production-build verification, and no schema or environment changes.

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R4, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main. After opening the PR, switch back to feature/api-v1; before creating the next story branch, pull the latest feature/api-v1.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Inception: Story breakdown and exact test intent are completed when this epic is selected.
- Decision (2026-11-18): Tracer is entry 1, pack/edit/remove one packing item through PATCH/DELETE /packing-items/:id, proving service, contract, route, client and reload end to end.
- Decision (2026-11-18): One lane. Trip-lifecycle and packing stories all edit trips/actions.ts, feature-map.mjs, docs/api-v1.md and shared API steps, so each entry waits on the one before it.
- Decision (2026-11-18): Packing reorder follows the tracer as the least-certain story; its contract sends ordered [{id, labelId}] per list instead of the source's {itemIds}, because section moves change labelId.
- Decision (2026-11-18): Trip metadata is split into field edits (entry 6) and date changes (entry 7); one session cannot carry both.
- Decision (2026-11-18): Date-change event deletion and trip delete move file removal onto the crash-safe file-cleanup queue that events/days already use (behavior change, tested).
- Decision (2026-11-18): GET /trips stays in this epic (entry 9) though it is API-only; per adr-api-service-boundaries, web pages keep reading through services and never call it.
- Decision (2026-11-18): Refactor sweep (entry 11) and a closing end-to-end verification (entry 12) are kept.
