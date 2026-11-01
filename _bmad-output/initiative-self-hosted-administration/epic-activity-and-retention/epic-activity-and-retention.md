---
type: epic
title: "Activity and retention"
parent: initiative-self-hosted-administration
covers: [CAP-8, CAP-9]
after: []
assignee: ""
risk: high
status: done
---

# Activity and retention

## Description

Best-effort event storage, a recording API for other epics, the Activity viewer, batching of routine edits, retention, and instrumenting existing authentication, account lifecycle, trip and invitation producers.

## Outcome

Admins review user activity within privacy limits and control retention; CAP-8 and CAP-9 success checks are the signal.

## Done when

1. Viewer filters by actor, type and date with pagination.
2. Edit batching and minimal trip-event metadata verified by tests.
3. Forced write failure never alters a primary outcome.
4. Retention options, confirmation and opportunistic cleanup work.

## Boundaries

Activity storage, API, viewer, retention, existing producers. Not events for onboarding or recovery; those epics emit them.

Existing account producers include bootstrap creation, role changes and self-service deletion as well as username/password changes. Standalone packing templates and other profile sub-edits are outside the approved event list. Trip event metadata is minimal even when an admin independently has trip access. No live feed, row expansion or per-edit retention.

## References

- parent — _bmad-output/initiative-self-hosted-administration/initiative-self-hosted-administration.md
- spec — _bmad-output/initiative-self-hosted-administration/spec-self-hosted-administration/spec-self-hosted-administration.md, capabilities CAP-8, CAP-9
- architecture — _bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
- ux — _bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/EXPERIENCE.md
- design — _bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/DESIGN.md and mockups/key-activity.html beside it

## Build contracts and verification

- Entry 1 chooses shared table, route, event-type and service names once, records an inventory of actual mutation owners for entries 3–6, and exposes recording/read contracts for later epics; event domain types belong in `src/data/types.ts`. Activity has no cascading account/trip foreign-key dependency. Capture historical stable account IDs and event-time usernames before rename/deletion, and capture occurrence time using an injectable real server clock; simulated itinerary dates never control batching or retention.
- Never write Activity inside a primary transaction or await it on the web response path. Catch scheduling as well as persistence failures, bound post-response work and schedule success only after commit. No retries/outbox. Keep failed-sign-in targets distinct from authenticated actors; no source IP, tokens, URLs, credential material or private trip details in stored data, UI, accessibility text or errors.
- Entry 8 owns the retention-policy migration (the existing singleton has no retention field), numeric cleanup limits/timeouts and a truthful cleanup-status mechanism before implementing its consumers. Maintenance uses a separate nonwaiting lock, reads saved policy without instance/account/trip locks, and runs from dynamic app activity even when no new Activity event succeeds. Expired history stays readable until physically deleted; keep whole batches whose latest event is within retention. Saving policy is not proof of completed cleanup.
- Server pages/read services check current DB admin authority; privileged mutations recheck it before committing. Server components own reads; interactive components use `"use client"`, explicit named Props interfaces, and existing shadcn Table/Select/Button/AlertDialog primitives with domain components under `src/components/arrivo/`. Keep table, filters and retention controls cohesive and small. Use existing CSS tokens and font fallbacks, 44px targets, labeled fields, text/ARIA state, and titles on icon buttons. Shortening confirmation initially focuses Cancel, supports Escape, and returns focus to its trigger; narrow tables use labeled keyboard-scrollable overflow.
- Entry 1 adds the approved shadcn Table primitive under `src/components/ui/` because it is not installed yet; reuse the existing Select, Button and AlertDialog. Select/confirmation triggers support Enter/Space, Select supports arrow navigation and Escape with focus return, and dialog focus returns on close. Keep heading levels ordered and local interactive state with its owner.
- Proposed colocated tests: `src/lib/activity.test.ts`, `src/lib/activity-batches.test.ts`, `src/lib/activity-queries.test.ts`, `src/lib/activity-retention.test.ts`, `src/components/arrivo/instance-activity.test.tsx`, `src/components/arrivo/activity-retention-settings.test.tsx`, and `src/app/(app)/admin/activity/actions.test.ts`; update `src/components/arrivo/admin-section-nav.test.tsx`. Final source names follow entry 1's contract, with matching colocated tests for every touched library/domain component.
- Producer tests: update `src/lib/authorize-credentials.test.ts`, `src/auth.test.ts` if Auth.js callbacks change, `src/app/(auth)/actions.test.ts`, `src/app/(app)/profile/actions.test.ts`, and `src/app/(app)/admin/users/actions.test.ts`; if lifecycle services change, update their matching colocated tests. Entries 4–6 update tests beside each inventoried action, including `trips/actions.test.ts`, `trips/[tripId]/actions.test.ts`, `trips/packing-actions.test.ts`, and budget/reservation/document/cover/route/transit action tests under `src/app/(app)/trips/`. Test actual persistence, no duplicate emission, refusals/rollback, safe captured identity and failure isolation.
- Include `src/app/(app)/profile/security-actions.test.ts` when password mutations there are instrumented; lifecycle service test candidates are `src/lib/instance-bootstrap.test.ts`, `src/lib/account-role-changes.test.ts` and `src/lib/account-deletion.test.ts`. Global Next navigation/header mocks stay in `vitest.setup.mts`.
- Per-story E2E lives in `tests/e2e/features/instance-activity.feature` with `tests/e2e/steps/instance-activity.steps.ts`, and `tests/e2e/features/activity-retention.feature` with `tests/e2e/steps/activity-retention.steps.ts`; extend existing auth/profile/instance-users/trip-sharing and affected trip scenarios for producer coverage. Register `@feat:` tags and all new runtime sources in `tests/e2e/feature-map.mjs`. Use scenario-owned mothers/materializers, await server-action responses before reload, and establish dedicated E2E DB availability/migrations in the first story rather than assuming it. Closing suite supplements these tests.
- Each builder names exact touched test files before production edits and starts with tests for runtime behavior. Run targeted tests first, then the project build-validator gate with affected E2E; record observed results. Batching/maintenance concurrency tests use the existing isolated real-Postgres pattern. Review high-risk authority/locking changes with a stronger lens than quick, per foundation retrospective A2.

## Notes

- Decision: 2026-10-25 keep the existing epic scope; the tracer bullet is a successful sign-in appearing in Activity (user confirmed).
- Decision: 2026-10-25 approve the ten-story breakdown in `tickets.toml`, including the refactor sweep and integrated E2E suite (user confirmed).
- Decision: 2026-10-25 batching follows the tracer as the highest-uncertainty step; producer stories, reader completion and retention follow serially because they share contracts, action modules, types and fixtures; no parallel lanes are claimed (approved breakdown).
- Waits on epic-instance-foundation because: the admin shell and authority checks host the Activity section.
- Decision: 2026-10-24 branching: integration branch is `feat/self-hosted-administration`, which accepts no direct pushes. Branch each ticket off it as `ticket/<slug>` and open a PR into it, never into `main`. When slicing this epic, write this rule into every ticket entry's `notes` so it reaches the build.
