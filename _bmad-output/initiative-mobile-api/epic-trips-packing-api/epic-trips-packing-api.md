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

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R4, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Inception: Story breakdown and exact test intent are completed when this epic is selected.
