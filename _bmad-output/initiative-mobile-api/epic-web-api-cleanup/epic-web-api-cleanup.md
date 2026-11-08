---
type: epic
title: "Complete the web API migration"
parent: initiative-mobile-api
covers: [R6, R7]
after: []
assignee: ""
risk: medium
---

# Complete the web API migration

## Description

Remove emptied action modules, restrict use-server to the temporary auth boundary, update AGENTS API conventions, enforce v1 route feature-map coverage, and retire non-auth server-action waits.

## Outcome

Production web mutations and client reads use /api/v1 except the explicit eight-function auth boundary.

## Done when

1. Production web mutations and client reads use /api/v1 except the explicit eight-function auth boundary.
2. ESLint and feature-map checks enforce the temporary allowlist and registered API route coverage.
3. Only auth E2E uses the old wait helper; the production build and project validation pass without new web-phase migrations or environment variables.

## Boundaries

Remove emptied action modules, restrict use-server to the temporary auth boundary, update AGENTS API conventions, enforce v1 route feature-map coverage, and retire non-auth server-action waits. R7 ownership covers tests and feature-map registration for this epic's own changes; the pilot owns shared API test infrastructure and cleanup owns final enforcement. No native phone UI.

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R6, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Inception: Story breakdown and exact test intent are completed when this epic is selected.
