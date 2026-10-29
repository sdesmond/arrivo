---
title: "Deletion concurrency and self-service"
type: "feature"
ticket: 2
created: "2026-10-29"
status: "built"
baseline_revision: "66a3ecd265f616ed72a8bd7f56d99dd873b470db"
route: "full"
route_source: "auto"
risk: "high"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
context: ["_bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md", "_bmad-output/initiative-self-hosted-administration/spec-self-hosted-administration/spec-self-hosted-administration.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Account deletion locks app, user and owned trips (AD-2), but the writers it races with (invitation accept, contributor changes, leave, invite, trip creation) use their own ad hoc locks, so some interleavings can deadlock or leave partial state, and no real-Postgres test proves otherwise.

**Approach:** Prove every deletion-versus-writer interleaving with real-Postgres concurrency tests, then bring each writer under the shared AD-7 lock order (app, then users sorted, then trips) only where a test shows a defect or the order is violated. Self-service outcomes and post-commit effects stay unchanged.

## Boundaries & Constraints

**Always:** Lock order app singleton, users in sorted ID order, trips. Trip creation takes only the owner-account lock, never the app singleton. Last-admin guard stays `assertAnotherCompletedAdmin` under the app lock. Refusals write nothing. Events, file cleanup and sign-out stay after commit in `deleteAccount`.

**Never:** Admin deletion, succession by role, outcome fingerprints or admin UI (ticket 3). Change transfer/delete choice semantics, `DeleteOwnAccountResult`, or the profile dialog. Add retry loops unless a test shows a deadlock the order cannot prevent. Edit applied migrations or schema.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Delete vs create trip | Owner deletes while creating a trip | Serialized: trip created then handled by deletion, or creation fails cleanly; no orphan trip | No deadlock |
| Delete vs accept | Invitee deletes while accepting | One wins; no collaborator row for a missing user | No deadlock or partial invitation state |
| Delete vs member change | Owner deletes while manager removes or re-roles heir, or member leaves | Choices revalidated under trip lock; stale returns `Stale` | Nothing written on refusal |
| Delete vs invite | Departing manager invites while deleting | No pending invitation survives from deleted inviter | Invite fails cleanly |
| Admin removal race | Last two admins: delete vs demote, delete vs delete | Exactly one succeeds, one `LastAdmin` | Nothing written |
| Self-service | Shared trips with transfer and delete choices | Same outcomes and summary as before | Unchanged |

</frozen-after-approval>

## Code Map

- `src/lib/account-deletion.ts` -- `deleteOwnAccount`: app, user, then owned-trip locks; reads members after locking trips.
- `src/lib/account-lifecycle-locks.ts` -- `lockAppAndUsersForUpdate`, `assertAnotherCompletedAdmin`; add a trips-after-users helper here if writers need one.
- `src/lib/server-action-locks.ts` -- `lockTripForUpdate`, `lockUserForUpdate`.
- `src/app/(app)/trips/actions.ts` -- `createTrip` (:293, user lock only), `inviteContributor` (:757, no lock), `acceptInvitation` (:873, no lock; updates invitation then inserts collaborator), `saveContributorChanges` (:1058) and `leaveTrip` (:1199), both trip lock only.
- `src/db/schema.ts` -- FKs: invitations cascade on inviter and invitee; collaborators.userId set null; trips.ownerId cascade.
- `tests/e2e/role-service-fixture.ts`, `tests/e2e/steps/app-role-service.steps.ts`, `tests/e2e/features/app-role-service.feature` -- isolated-schema harness with lock gate and blocked-transaction polling. Its `like` tables carry no FKs, so cascade and deadlock paths cannot be reproduced there; reuse it for admin-removal races only.
- `tests/e2e/scenario-fixture.ts`, `tests/e2e/e2e-db.ts`, `tests/e2e/feature-map.mjs` -- scenario-owned rows with real FKs for trip and membership races; register new feature and sources.

## Tasks & Acceptance

**Execution:**

- [ ] `tests/e2e/features/deletion-concurrency.feature`, `tests/e2e/steps/deletion-concurrency.steps.ts`, `tests/e2e/deletion-concurrency-fixture.ts` -- new `@feat:deletion-concurrency`; scenario-owned users and trips on the real schema; run service calls concurrently with a lock gate and `waitForBlockedTransaction`; cover every matrix row. Write first; record which fail.
- [ ] `tests/e2e/features/app-role-service.feature` and steps -- add delete-vs-demote last-admin race.
- [ ] `src/lib/account-lifecycle-locks.ts`, `src/lib/account-lifecycle-locks.test.ts` -- add a shared users-then-trip helper only if two or more writers need it (otherwise call `lockUserForUpdate` then `lockTripForUpdate` directly); unit-test order and missing rows (existing test file, extend it).
- [ ] `src/app/(app)/trips/actions.ts` and colocated `actions.test.ts` -- put `acceptInvitation`, `inviteContributor`, `saveContributorChanges`, `leaveTrip`, `createTrip` under the AD-7 order where a failing test or review of order requires it; keep results and events unchanged.
- [ ] `src/lib/account-deletion.ts`, `src/lib/account-deletion.test.ts` -- only change if a race test fails; keep summary shape.
- [ ] `tests/e2e/feature-map.mjs` -- register the feature and sources; `scripts/feature-map.test.mjs` stays green.
- [ ] Run targeted Vitest, `npm run test:e2e:affected`, then build-validator.

**Acceptance Criteria:**

- Given each matrix interleaving on real Postgres, when both operations run concurrently, then one serialized outcome results with no deadlock error and no orphan rows.
- Given self-service deletion with shared trips, when the user transfers some trips and deletes others, then trips, owners, roles, summary and post-commit effects match current behavior.
- Given the last two completed admins, when both are removed concurrently by deletion or demotion, then exactly one succeeds.

## Design Notes

Reasoned deadlock to prove: accept updates an invitation row, then inserts a collaborator needing a key-share lock on the invitee user; invitee deletion holds the user lock, then its cascade needs the invitation row. Locking the invitee user before the invitation update removes the cycle.

## Verification

**Commands:**

- `npx vitest run src/lib/account-lifecycle-locks.test.ts src/lib/account-deletion.test.ts "src/app/(app)/trips/actions.test.ts"` -- pass.
- `npm run test:e2e:affected` -- deletion-concurrency and app-role-service scenarios pass.
- `npm run test:coverage` via build-validator -- thresholds hold.

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Deadlock scenario nondeterministic; accept now blocks at invitee user lock, not collaborator insert | medium | patch | Held insert key-shares invitee row; accept blocks on FOR UPDATE, then races deletion for trip lock; feature asserts `accepted nothing` unconditionally. |
| Matrix "re-roles heir" has no real-Postgres scenario | medium | patch | Feature has only removal and leave; no role-change operation in steps. |
| Invitee deleted during invite only mocked | low | rejected | Matrix row covers departing inviter only; fix adds scenario for unlikely gap. |
| createTrip after deletion throws plain Error | low | rejected | Same message pre-exists at baseline actions.ts:321; deleted user's session is gone anyway. |
| Identical branches in createTripWrite days insert | low | patch | membership-writes.ts if/else both call `tx.insert(days).values(dayRows)`. |
| Stale JSDoc in invitation-resend.ts | low | patch | Refers to `resendInvitation` "below"; it lives in invitations.ts. |
| Redundant `export { applyInvitationResend }` in invitations.ts | low | rejected | Existing tests/mocks may import it there; removal risks breakage for no harm. |
| No record of which scenarios failed first | false | rejected | Implementer report lists the 7 failing scenarios; fix would edit this plan. |
| Extraction of leave/saveContributorChanges beyond scope | low | rejected | Actions cannot run outside Next, so all writers moved together; no behavior harm shown. |
| saveContributorChanges now returns stale on vanished trip | false | rejected | Matrix row says stale returns `Stale`; change matches intent. |
| Delete-vs-demote only one ordering | low | rejected | Both orderings serialize on the same app lock; reverse order adds no new path. |
