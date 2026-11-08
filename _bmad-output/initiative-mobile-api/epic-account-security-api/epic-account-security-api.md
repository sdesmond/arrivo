---
type: epic
title: "Signed-in account security through the API"
parent: initiative-mobile-api
covers: [R5, R7]
after: []
assignee: ""
risk: high
---

# Signed-in account security through the API

## Description

Migrate group C: MFA enrollment/confirmation/disable, recovery codes, device removal, sign-out everywhere, password changes, and account deletion. Keep groups A and B on server actions until unified sessions.

## Outcome

Group C flows use /api/v1 in the production build; enrollment-required users reach only explicitly allowed enrollment operations.

## Done when

1. Group C flows use /api/v1 in the production build; enrollment-required users reach only explicitly allowed enrollment operations.
2. An integration check proves Auth.js signOut({ redirect: false }) clears cookies in a route handler and returned redirects are handled by clients.
3. Revocation, policies, recovery codes, device removal, and deletion pass affected security regression checks.

## Boundaries

Migrate group C: MFA enrollment/confirmation/disable, recovery codes, device removal, sign-out everywhere, password changes, and account deletion. Keep groups A and B on server actions until unified sessions. R7 ownership covers tests and feature-map registration for this epic's own changes; the pilot owns shared API test infrastructure and cleanup owns final enforcement. No native phone UI.

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R5, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Inception: Story breakdown and exact test intent are completed when this epic is selected.
