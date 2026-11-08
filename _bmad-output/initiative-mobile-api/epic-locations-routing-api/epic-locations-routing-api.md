---
type: epic
title: "Location search and routing through the API"
parent: initiative-mobile-api
covers: [R4, R7]
after: []
assignee: ""
risk: medium
---

# Location search and routing through the API

## Description

Move location search/retrieve and existing routing handlers under /api/v1. Preserve search contracts, routing concurrency, and map integration behavior.

## Outcome

Location and routing client calls use versioned endpoints in the production build.

## Done when

1. Location and routing client calls use versioned endpoints in the production build.
2. Concurrent route requests preserve intended navigation and do not reintroduce the server-action queue problem.
3. Provider failures, validation, authorization, and affected map/search/routing flows pass regression checks.

## Boundaries

Move location search/retrieve and existing routing handlers under /api/v1. Preserve search contracts, routing concurrency, and map integration behavior. R7 ownership covers tests and feature-map registration for this epic's own changes; the pilot owns shared API test infrastructure and cleanup owns final enforcement. No native phone UI.

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R4, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main. After opening the PR, switch back to feature/api-v1; before creating the next story branch, pull the latest feature/api-v1.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Inception: Story breakdown and exact test intent are completed when this epic is selected.
