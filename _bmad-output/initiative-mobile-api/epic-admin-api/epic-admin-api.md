---
type: epic
title: "Administration through the API"
parent: initiative-mobile-api
covers: [R5, R7]
after: []
assignee: ""
risk: high
---

# Administration through the API

## Description

Migrate admin user management, security policies, activity operations, and overview metric refreshes. Replace per-metric actions with GET resources and supersede the overview-metrics ADR.

## Outcome

Admin operations and overview metric reads use /api/v1 in the production build.

## Done when

1. Admin operations and overview metric reads use /api/v1 in the production build.
2. Signed-in non-admin API calls return 403; admin pages retain existing concealment behavior.
3. Security policies, activity, users, and overview refresh pass affected checks and the replaced ADR is linked.

## Boundaries

Migrate admin user management, security policies, activity operations, and overview metric refreshes. Replace per-metric actions with GET resources and supersede the overview-metrics ADR. R7 ownership covers tests and feature-map registration for this epic's own changes; the pilot owns shared API test infrastructure and cleanup owns final enforcement. No native phone UI.

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R5, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Inception: Story breakdown and exact test intent are completed when this epic is selected.
