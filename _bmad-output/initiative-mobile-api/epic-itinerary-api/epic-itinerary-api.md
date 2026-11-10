---
type: epic
title: "Notes and itinerary through the API"
parent: initiative-mobile-api
covers: [R3, R7]
after: []
assignee: ""
risk: medium
---

# Notes and itinerary through the API

## Description

Migrate trip and event notes, event and day operations, and full-list ordering. Own shared timeline positioning extraction after the checklist pilot; preserve existing linked-event and locking behavior.

## Outcome

Notes, events, days, and full-list ordering run through services and /api/v1 in the production build.

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

- Carry into story 2.1 (from the pilot retrospective, option 2 on the `ApiError` question): services must not throw HTTP-shaped errors. Add a typed `ConflictError` (transport-neutral, beside `TripNotFoundError`/`TripForbiddenError` in `src/lib/services/`), have `errorResponse` in `src/lib/api/errors.ts` map it to 409 `conflict`, and use it in the itinerary services instead of `ApiError`. Migrate the pilot's HTTP-shaped throws in the same story: `collision()` in `src/lib/services/checklists.ts` and the 409s in `src/lib/api/idempotency.ts`. Keep route-level tests asserting status 409. Source: `epic-checklist-api-pilot-retrospective.md`, Open questions.
