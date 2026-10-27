---
title: "Trip invitation events"
type: "feature"
ticket: "6"
created: "2026-10-26"
status: done
baseline_revision: "31bff0fee8108a4c124df1da72a8eb3cb6bbd4dd"
route: "full"
route_source: "auto"
risk: "medium"
review: "quick"
review_source: "pinned"
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - "{project-root}/AGENTS.md"
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/activity-producer-inventory.md"
warnings: [oversized]
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

- [x] `src/app/(app)/trips/actions.test.ts`, `src/lib/trip-activity.test.ts`, `src/lib/activity.test.ts`, `src/components/arrivo/instance-activity.test.tsx`: expand tests first. Cover matrix, exact safe payloads, post-commit emission, helper failure isolation, distinct unbatched persistence and UI labels. Reuse current tests for excluded actions and refusal branches with explicit no-emission assertions.
- [x] `src/data/types.ts`, `src/lib/trip-activity.ts`, `src/app/(app)/trips/actions.ts`: add types, safe reusable recorder and three mutation-owner calls. Keep existing trip recorder behavior and tests intact.
- [x] `src/components/arrivo/instance-activity.tsx`: add human-readable labels without changing layout/accessibility.
- [x] `tests/e2e/features/instance-activity.feature`, `tests/e2e/steps/instance-activity.steps.ts`, `tests/e2e/feature-map.mjs`: add real creation/acceptance/rescind UI scenarios observed in Activity. Prove individual rows and private metadata omission in DB and rendered content. Extend fixture helpers only if necessary; no shared global seed rows.
- [x] `activity-producer-inventory.md` beside this plan: record 2.6 owners and explicitly excluded actions.

**Acceptance Criteria:**

- Given a manager invites a user and that user accepts, when an admin opens Activity, then separate Created invitation and Accepted invitation rows show each actor and trip ID with no invitee details, trip name, role or invitation identifier.
- Given a manager rescinds a pending invitation, when an admin opens Activity, then one Rescinded invitation row appears for that committed transition.
- Given an invitation attempt is rejected or resent, when Activity is inspected, then no new invitation lifecycle event appears.
- Given Activity work fails, when an invitation transition succeeds, then its original result and membership/invitation state remain successful.

## Implementation Notes

- Tests-first implementation completed; 250 targeted action/helper/persistence/component cases, 20 focused Activity E2E tests (including setup), and 8 feature-map contract tests passed. Existing helper failure/timeout cases now run for each invitation type. Commit-boundary and rollback tests prove no early or failed mutation emission. Three UI scenarios prove safe individual lifecycle rows, resend/refusal exclusion and second-session acceptance.
- Matrix audit: all six rows covered by the successful runs above; action success/refusal/rollback cases, exclusions, parameterized bounded helper failures and individual persistence cases cover each outcome.
- Plan-reviewer: scope, architecture, component, accessibility and test coverage PASS; zero blocking findings or warnings. Existing Activity component is below size limit; matching tests and UI-observed scenarios cover all touched behavior.
- Full route: expected test and fixture work exceeds 100 changed lines across several files.
- User authorized new branch; current `ticket/trip-invitation-events` branches from integration branch with prerequisite encoding repair committed. Do not ask again. No push authorized.
- User clarified build-validator runs only after coding is done. Implementer runs targeted tests; parent owns final validator after implementation/review fixes, not inside BMad dispatch.
- Read version-matched `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` before changing Next.js code.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none; quick reviewer checked surrounding mutation owners, recorder, persistence, tests and invitation semantics. Existing expiry refusal applies to acceptance; rescinding an expired-but-pending invitation remains a successful transition under existing semantics.

## Verification

- `npx vitest run "src/app/(app)/trips/actions.test.ts" src/lib/trip-activity.test.ts src/lib/activity.test.ts src/components/arrivo/instance-activity.test.tsx` — all targeted cases pass.
- `npm run test:e2e:affected -- --grep=@feat:instance-activity` — focused invitation lifecycle and existing Activity scenarios pass before the broad gate.
- Parent final `build-validator` runs `npm run test:e2e:affected` after coding/review, covering all classified affected features; never launch full test:e2e command directly.

## Auto Run Result

- Summary: creation, acceptance and rescinding emit individual Activity events only after successful mutation. Payloads contain actor, action, time and trip ID; other invitation/contributor actions remain excluded.
- Files changed: `src/data/types.ts` adds three event values and the invitation event union; `src/lib/trip-activity.ts` shares bounded actor lookup; `src/app/(app)/trips/actions.ts` instruments three owners; `src/components/arrivo/instance-activity.tsx` adds labels. Their four test files cover transitions, exclusions, commit boundaries, rollback, failure isolation, individual persistence and presentation.
- E2E files: instance-activity feature/steps add creation/acceptance, rescind, resend/refusal and privacy checks; trip-sharing steps await mutation responses; feature-map registers invitation owners without narrowing the shared domain model. Producer inventory records completed scope.
- Review: quick lens returned no findings. Patches applied: high 0, medium 0, low 0. Deferred: 0. Rejected: 0. Follow-up review recommended: false.
- Verification: 250 targeted unit/component tests passed, 8 feature-map contract tests passed, 20 focused Activity E2E tests passed (including setup). Touched-file ESLint and diff checks passed.
- Final build-validator: ESLint PASS; TypeScript PASS; coverage PASS (302 files, 4,880 tests; lines 96.98%, functions 96.85%, branches 91.85%); affected E2E PASS (335 tests, 7.1 minutes); production build PASS (17 static pages; bundle sizes not emitted). Shared domain types and feature map correctly select broad affected scope.
- Residual risks: Activity remains best effort; shutdown loss and missing actor lookups can omit events under the existing contract. No migrations or operator update steps required.
