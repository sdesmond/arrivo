---
title: "Trip invitation events"
type: "feature"
ticket: "6"
created: "2026-10-26"
status: "in-progress"
baseline_revision: "31bff0fee8108a4c124df1da72a8eb3cb6bbd4dd"
route: "full"
route_source: "auto"
risk: "medium"
review: "quick"
review_source: "pinned"
lenses_ran: []
review_loop_iteration: 0
followup_review_recommended: false
context:
  - "{project-root}/AGENTS.md"
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/activity-producer-inventory.md"
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Trip invitation creation, acceptance and rescinding currently leave no Activity events.

**Approach:** Emit one individual event after each successful transition through the existing best-effort Activity contract, displaying actor, action, time and trip ID only.

## Boundaries & Constraints

**Always:** Record at committed mutation owners, outside transactions. Return synchronously from the recorder; defer bounded actor lookup and persistence until after response. Catch scheduling, lookup and persistence failures. Use real Activity clock. Preserve invitation results and existing authorization. Exact event payload contains type, actor and trip ID; never target collaborator identity, invitation ID, role, trip name, token or URL. Events remain individual, outside BATCHED_TYPES.

**Never:** Emit on resends (including inviteContributor's pending-invitation branch), declines, dismissals, collaborator changes, no-ops, denied access, refusals or rollback. Do not instrument delegating wrappers, alter invitation semantics, add schema/migrations, or change batching/retention behavior.

## I/O & Edge-Case Matrix

| Scenario | Expected behavior |
| --- | --- |
| New invitation commits, including replacement after decline | One invitation_created event with manager actor and trip ID |
| Pending invitation accepted and membership commits | One invitation_accepted event with accepting actor and trip ID |
| Pending invitation rescinded | One invitation_rescinded event with manager actor and trip ID |
| Missing, expired, wrong-account, nonpending, denied or throwing mutation | No Activity event; existing result/error unchanged |
| Resend, decline, dismiss, collaborator edit | No invitation Activity event |
| Activity scheduling, lookup, persistence failure or timeout | Successful primary result unchanged; no retry, duplicate or late event |

</intent-contract>

## Code Map

- `src/app/(app)/trips/actions.ts`: `inviteContributor` emits only for `result.status === "invited"` after transaction; `acceptInvitation` after matched transaction; `rescindInvitation` after returning row. `[tripId]/actions.ts` invitation exports delegate; leave them alone.
- `src/lib/trip-activity.ts`: reuse bounded, caught post-response username lookup from `recordTripUpdated`; add a typed invitation recorder for three callers without duplicating lookup logic. Existing creation/update behavior must survive. Domain types live in `src/data/types.ts`.
- `src/lib/activity.ts` already persists individual types and catches failures; `activity-batches.ts` batches only explicit BATCHED_TYPES. No production edits needed there.
- `src/data/types.ts`: add InvitationCreated/InvitationAccepted/InvitationRescinded values to ActivityEventType, and any required domain alias here.
- `src/components/arrivo/instance-activity.tsx`: 88-line server component, existing typed Props and accessible table; add Trips labels Created invitation/Accepted invitation/Rescinded invitation only.
- `tests/e2e/steps/instance-activity.steps.ts`: existing Activity row assertions and isolated trip/account fixtures. Reuse trip-sharing steps/mothers for real UI invitation transitions, scenario-owned users and trips, POST waits before reload. Register runtime files in `tests/e2e/feature-map.mjs` under instance-activity while preserving existing mappings.

## Tasks & Acceptance

**Execution:**

- [ ] `src/app/(app)/trips/actions.test.ts`, `src/lib/trip-activity.test.ts`, `src/lib/activity.test.ts`, `src/components/arrivo/instance-activity.test.tsx`: expand tests first. Cover matrix, exact safe payloads, post-commit emission, helper failure isolation, distinct unbatched persistence and UI labels. Reuse current tests for excluded actions and refusal branches with explicit no-emission assertions.
- [ ] `src/data/types.ts`, `src/lib/trip-activity.ts`, `src/app/(app)/trips/actions.ts`: add types, safe reusable recorder and three mutation-owner calls. Keep existing trip recorder behavior and tests intact.
- [ ] `src/components/arrivo/instance-activity.tsx`: add human-readable labels without changing layout/accessibility.
- [ ] `tests/e2e/features/instance-activity.feature`, `tests/e2e/steps/instance-activity.steps.ts`, `tests/e2e/feature-map.mjs`: add real creation/acceptance/rescind UI scenarios observed in Activity. Prove individual rows and private metadata omission in DB and rendered content. Extend fixture helpers only if necessary; no shared global seed rows.
- [ ] `activity-producer-inventory.md` beside this plan: record 2.6 owners and explicitly excluded actions.

**Acceptance Criteria:**

- Given a manager invites a user and that user accepts, when an admin opens Activity, then separate Created invitation and Accepted invitation rows show each actor and trip ID with no invitee details, trip name, role or invitation identifier.
- Given a manager rescinds a pending invitation, when an admin opens Activity, then one Rescinded invitation row appears for that committed transition.
- Given an invitation attempt is rejected or resent, when Activity is inspected, then no new invitation lifecycle event appears.
- Given Activity work fails, when an invitation transition succeeds, then its original result and membership/invitation state remain successful.

## Implementation Notes

- Plan-reviewer: scope, architecture, component, accessibility and test coverage PASS; zero blocking findings or warnings. Existing Activity component is below size limit; matching tests and UI-observed scenarios cover all touched behavior.
- Full route: expected test and fixture work exceeds 100 changed lines across several files.
- User authorized new branch; current `ticket/trip-invitation-events` branches from integration branch with prerequisite encoding repair committed. Do not ask again. No push authorized.
- User clarified build-validator runs only after coding is done. Implementer runs targeted tests; parent owns final validator after implementation/review fixes, not inside BMad dispatch.
- Read version-matched `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` before changing Next.js code.

## Plan Change Log

## Review Triage Log

## Verification

- `npx vitest run "src/app/(app)/trips/actions.test.ts" src/lib/trip-activity.test.ts src/lib/activity.test.ts src/components/arrivo/instance-activity.test.tsx` — all targeted cases pass.
- `npm run test:e2e:affected` — registered invitation lifecycle and existing affected features pass; never launch full test:e2e command.
