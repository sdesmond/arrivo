---
type: epic
title: "Collaboration through the API"
parent: initiative-mobile-api
covers: [R3, R7]
after: []
assignee: ""
risk: medium
---

# Collaboration through the API

## Description

Migrate share-dialog reads, invitations, contributor updates, leave-trip operations, and invitable-user lookup. Preserve role changes, invitation lifecycle, and activity semantics.

## Outcome

Sharing and invitation operations run through /api/v1 in the production build.

## Done when

1. Sharing and invitation operations run through /api/v1 in the production build.
2. Manager/editor/viewer boundaries and stranger concealment are verified across collaboration flows.
3. Invitations, contributor edits, and leaving a trip persist and pass affected unit, route, and E2E checks.

## Boundaries

Migrate share-dialog reads, invitations, contributor updates, leave-trip operations, and invitable-user lookup. Preserve role changes, invitation lifecycle, and activity semantics. R7 ownership covers tests and feature-map registration for this epic's own changes; the pilot owns shared API test infrastructure and cleanup owns final enforcement. No native phone UI.

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R3, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Inception: Story breakdown and exact test intent are completed when this epic is selected.
