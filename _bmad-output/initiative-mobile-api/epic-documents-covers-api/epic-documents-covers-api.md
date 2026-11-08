---
type: epic
title: "Documents and covers through the API"
parent: initiative-mobile-api
covers: [R3, R7]
after: []
assignee: ""
risk: medium
---

# Documents and covers through the API

## Description

Migrate document upload, linking, rename, removal, attachment and promotion, cover upload and selection, and cover image search. Own multipart limits using upload-policy and existing storage adapters.

## Outcome

Document and cover flows use /api/v1 in the production build.

## Done when

1. Document and cover flows use /api/v1 in the production build.
2. Multipart limits, unsafe inputs, storage failures, authorization, and replay are tested without bypassing storage adapters.
3. Existing document, reservation-attachment, and cover flows pass affected regression checks.

## Boundaries

Migrate document upload, linking, rename, removal, attachment and promotion, cover upload and selection, and cover image search. Own multipart limits using upload-policy and existing storage adapters. R7 ownership covers tests and feature-map registration for this epic's own changes; the pilot owns shared API test infrastructure and cleanup owns final enforcement. No native phone UI.

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R3, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main. After opening the PR, switch back to feature/api-v1; before creating the next story branch, pull the latest feature/api-v1.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Inception: Story breakdown and exact test intent are completed when this epic is selected.
