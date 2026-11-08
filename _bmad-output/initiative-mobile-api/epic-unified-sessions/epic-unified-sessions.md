---
type: epic
title: "Unified web and app sessions"
parent: initiative-mobile-api
covers: [R8, R7]
after: []
assignee: ""
risk: high
---

# Unified web and app sessions

## Description

Deferred until phone development starts: replace Auth.js with the decided hand-rolled database session module, migrate auth/link flows to /api/v1, provide combined session management, and retire the final server actions.

## Outcome

Web cookie and app bearer sessions use one resolver with the specified lifetime, hourly write limit, revocation, and device rules in the production build.

## Done when

1. Web cookie and app bearer sessions use one resolver with the specified lifetime, hourly write limit, revocation, and device rules in the production build.
2. Auth and link flows use scoped API cookies; migrated sign-in/setup/reset flows and session-ending operations pass security regression checks.
3. Generated migrations and upgrade instructions cover user_sessions, verified-unused adapter tables, and one-time sign-out; AUTH_SECRET remains for MFA tickets.
4. A dedicated security review is complete before release; Auth.js dependencies and all use-server directives and old E2E waits are retired.

## Boundaries

Deferred until phone development starts: replace Auth.js with the decided hand-rolled database session module, migrate auth/link flows to /api/v1, provide combined session management, and retire the final server actions. R7 ownership covers tests and feature-map registration for this epic's own changes; the pilot owns shared API test infrastructure and cleanup owns final enforcement. No native phone UI.

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R8, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main. After opening the PR, switch back to feature/api-v1; before creating the next story branch, pull the latest feature/api-v1.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Inception: Story breakdown and exact test intent are completed when this epic is selected.
- Deferred start: Wait until phone development begins; the roadmap dependency alone does not authorize starting this epic.
