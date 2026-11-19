---
type: epic
status: done
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

## Requirements

- S1 (R3): Move manager-only share-dialog and invitable-user reads to GET endpoints; keep Server Component pending-invitation reads direct.
- S2 (R3): Move invitation creation and reinvitation to the API, preserving picker exclusions, role validation and invitation expiry.
- S3 (R3): Move manager resend, rescind and dismiss operations, including expired pending invitations, to the API.
- S4 (R3): Move invitee accept and decline operations, preserving pending/unexpired checks, atomic membership creation, dashboard badges and navigation.
- S5 (R3): Move contributor role/removal batches with atomic rollback, maximum 50 changes, duplicate-target rejection, stale fromRole checks, creator protection and no self-change.
- S6 (R3): Move editor/viewer leave operations, deriving identity from session and preserving manager refusal and other memberships; repeated leave succeeds without repeating side effects.
- S7 (R3, R7): Preserve transactional authorization, existing lock order, activity and postcommit live events, subscriber removal order, stale recovery and successful-mutation refresh.
- S8 (R7): Supply colocated service/contract/route/client/component tests, API and feature E2E coverage, API reference and feature-map updates, retire every migrated action/wrapper by explicit export name, and verify production-build behavior with no new schema or environment requirements.

### Contract and test constraints

Use the existing API wrapper, contracts, typed errors and mutation client. API non-members receive 404; members below role receive 403; invitation decisions authorize the addressed invitee rather than requiring existing trip membership. Another account's invitation returns concealed 404. Preserve user-before-trip lock order for invite/accept and trip locking for contributor batches/leave, with authorization checked under the write lock. Side effects occur only after commit and must not repeat on replay. Diagnostic clocks follow getNow(); persisted expiry checks retain the database clock.

Proposed endpoint details are assumptions for breakdown approval: GET /trips/:tripId/collaborators returns complete share-dialog data; GET /users/invitable takes validated tripId; POST /trips/:tripId/invitations creates/reinvites; PATCH /trips/:tripId/collaborators applies the atomic batch; POST /invitations/:invitationId/{accept,decline,resend,dismiss} performs transitions; DELETE /trips/:tripId/invitations/:invitationId rescinds; DELETE /trips/:tripId/collaborators/me leaves. All paths are under /api/v1. Bind trip-scoped invitation rows to the authorized trip; resolve manager permissions for global invitation routes without revealing foreign rows. Follow existing UUID-create and replay contracts, settling any lifecycle-specific replay rules in the first story before dependent transitions.

Tests are part of every entry, authored before runtime edits. Existing tests include src/app/(app)/trips/actions.test.ts, src/app/(app)/trips/[tripId]/actions.test.ts, src/lib/membership-writes.test.ts, src/lib/invitations.test.ts, src/lib/invitable-users.test.ts, the colocated sharing controller/form/invitation hook and component tests, pending-invitations-list.test.tsx and trip-detail page-client.test.tsx. New API modules receive matching colocated tests. Each flow updates its feature and steps together: trip-sharing, pending-invitations, leave-trip, plus api; scenario-owned fixtures use the existing mothers/materializers and mutation steps await exact API method/path before reload. Every new runtime file is registered in feature-map.mjs; API metadata and docs/api-v1.md stay current. Run targeted tests first, then build-validator as the single final gate; never automatically run the full E2E suite.

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R3, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main. After opening the PR, switch back to feature/api-v1; before creating the next story branch, pull the latest feature/api-v1.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Decision: 2026-11-17 — User approved the seven-story breakdown, endpoint assumptions and existing UI scope. Story 1 is the invitation tracer; contributor batches follow as the highest concurrency risk, then invitee decisions, manager invitation lifecycle and leave. All stories share action/contracts/test registration files and therefore run in one sequential lane, followed by a refactor sweep and integrated production verification. No epic scope is deferred.
- Decision: 2026-11-17 — User agreed to concealed 404 for another account's invitation and success for repeated leave after clarification that recipient ownership is checked when accepting or declining, independently of invite-picker autocomplete.
- Assumption: First demo opens sharing, invites a registered user and proves persistence after reload; existing UI scope stays unchanged.
- Source conflict: invitation failure diagnostics currently disclose recipient mismatch; the decision above adopts API stranger concealment instead.
- Source conflict: leaveTrip currently reports stale for missing membership; the decision above adopts idempotent leave without repeated activity or live events.
- Source conflict: endpoint inventory says 14 sharing operations across two action files; current exports total 13 (eight core and five detail exports). Retirement checks enumerate the exports and remaining callers rather than asserting the source count; the invitation-resend library helper is also migrated.
- Draft validation constraint: The first story defines transition/replay authorization before later stories consume it: accept/decline retain addressed-recipient authorization after pending status changes; resend rechecks current manager; dismiss preserves enough scoped evidence to authorize deleted-row replay without disclosing another trip. Repeated leave returns the same empty success for absent membership on missing or foreign trips, with no events or trip data; an existing manager membership is still refused.
- Draft validation constraint: Invite creation adds client UUID plumbing to the membership writer and its colocated tests; define collision and existing-pending/reinvite behavior explicitly instead of silently replacing client identity with a generated ID.
- Draft validation constraint: The first story establishes transaction orchestration compatible with the API contract's transactional deadline and atomic replay, preserving membership user-before-trip locks without nesting existing writer transactions. A retried create after rescind/dismiss must not revive the old invitation.
