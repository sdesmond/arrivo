---
type: epic
title: "Mobile API contracts and prerequisites"
parent: initiative-mobile-api
covers: [R9, R7]
after: []
assignee: ""
risk: medium
---

# Mobile API contracts and prerequisites

## Description

Deferred until phone development starts: finish app-session integration, metadata capabilities, longer idempotency retention, runtime response schemas, and generated OpenAPI with drift detection. Delta sync needs snapshot-size evidence.

## Outcome

A phone API consumer can authenticate, discover capabilities, read snapshots, and safely replay operations against the production build.

## Done when

1. A phone API consumer can authenticate, discover capabilities, read snapshots, and safely replay operations against the production build.
2. Runtime response schemas and generated OpenAPI agree with API contracts and drift checks pass.
3. The longer idempotency window is configured and verified; snapshot measurements determine whether delta sync is needed.

## Boundaries

Deferred until phone development starts: finish app-session integration, metadata capabilities, longer idempotency retention, runtime response schemas, and generated OpenAPI with drift detection. Delta sync needs snapshot-size evidence. R7 ownership covers tests and feature-map registration for this epic's own changes; the pilot owns shared API test infrastructure and cleanup owns final enforcement. No native phone UI.

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R9, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main. After opening the PR, switch back to feature/api-v1; before creating the next story branch, pull the latest feature/api-v1.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Inception: Story breakdown and exact test intent are completed when this epic is selected.
- Deferred start: Wait until phone development begins; the roadmap dependency alone does not authorize starting this epic.
