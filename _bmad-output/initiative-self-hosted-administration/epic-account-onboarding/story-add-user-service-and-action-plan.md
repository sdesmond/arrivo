---
title: "Add User service and action"
type: feature
ticket: 3
created: "2026-10-28"
status: done
baseline_revision: "bfe444073841577153f59af914bffd368c67ffea"
route: full
route_source: auto
risk: high
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: true
context:
  - AGENTS.md
  - _bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Admins cannot create a passwordless account with a 24-hour setup link; without it no onboarding flow (dialog, completion, regeneration) can proceed.

**Approach:** Add a request-independent `addUser` service that, in one AD-2-locked transaction, rechecks admin authority, creates the unfinished account and issues the setup authorization; wrap it in an admin-only server action that builds the link from the configured trusted origin, revalidates Users, and records Activity after commit. Users list shows Pending setup with expiry. No dialog UI (story 3.4).

## Boundaries & Constraints

**Always:** Normalize with `normalizeUsername`, validate with `validateUsername` before DB work. Singleton lock then sorted user locks (`lockInstanceAndUsersForUpdate`); admin authority (completed admin) rechecked under lock. Account insert and `issueCredentialAuthorizationInTransaction` share one transaction; any failure rolls back both. Link origin comes only from `NEXTAUTH_URL`/`AUTH_URL` (http/https origin); none configured → refuse before any write with an actionable operator error. Link is `<origin>/account-setup/open?token=<token>`, returned once, never persisted, logged or put in Activity. Activity (`AccountCreated`, new `SetupLinkGenerated`) recorded via `recordActivity` only after commit, actor + target ids/usernames only. New account: role `member`, `passwordHash` null, `name` null. Types in `src/data/types.ts`; enums as const object + union.

**Never:** Add User dialog or form UI, regeneration, deletion, setup completion. Touch `isInstanceSetupOpen`, `/setup`, `/sign-up`. Derive origin from Host or `X-Forwarded-*`. Open a nested transaction or a second DB connection. Catch SQL errors inside the transaction.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Create | Completed admin, free valid username, trusted origin | One member row, null password, setup authorization (24h); result has userId, normalized username, setupUrl, expiresAt; Users row Pending setup with expiry | n/a |
| Normalization | `"  Alex.Q "` | Stored `alex.q` | n/a |
| Invalid | Empty/short/bad chars | `invalid-username`, nothing written | validation message from `validateUsername` |
| Duplicate | Existing username (any case, incl. pending) | `username-taken`, no second account, no authorization | n/a |
| Concurrent | Two admins add same username | Exactly one `ok`, other `username-taken` (singleton lock; unique index backstop 23505 maps to taken) | n/a |
| No origin | Neither env var valid | `origin-unavailable`, nothing written, no Activity | actionable operator message naming `NEXTAUTH_URL`/`AUTH_URL` |
| Stale authority | Actor demoted/deleted/unfinished while waiting | `forbidden`, nothing written | n/a |
| No instance row | singleton missing | `instance-unavailable` | n/a |
| Contention | 40P01/40001 | `retry`, rolled back | n/a |
| Activity failure | Scheduling or write throws | Action result unchanged, account and link committed | logged by `recordActivity` |

</intent-contract>

## Code Map

- `src/lib/credential-authorizations.ts` -- reuse `issueCredentialAuthorizationInTransaction` (re-locks singleton already held, safe); copy `retryable`-style handling from `src/lib/account-role-changes.ts`.
- `src/lib/account-role-changes.ts` -- pattern for injected `database`, actor recheck under lock, SQL via `transaction.execute`.
- `src/lib/account-lifecycle-locks.ts` -- `lockInstanceAndUsersForUpdate`.
- `src/lib/request-origin.ts` -- add `trustedLinkOrigin(env)`; existing `browserUrl` must stay unchanged.
- `src/lib/instance-users.ts`, `src/components/arrivo/instance-users-list.tsx` -- add `setupExpiresAt`; row text "Setup pending" becomes "Pending setup" with expiry.
- `src/app/(app)/admin/users/actions.ts` -- add `addUserAction` beside `changeUserRoleAction`.
- `src/lib/activity-labels.ts`, `src/data/types.ts` -- `AccountCreated` label becomes "Created account"; add `SetupLinkGenerated` ("Generated setup link"). Activity table has no type constraint; no migration.
- `src/components/providers/mock-date-provider.tsx` -- `useNow()` for the expired comparison.
- `tests/e2e/credential-authorization-fixture.ts`, `role-service-fixture.ts`, `steps/credential-authorizations.steps.ts` -- reuse isolated-schema fixture and lock gates; `tests/e2e/feature-map.mjs` -- register.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/request-origin.test.ts`, `src/lib/account-creation.test.ts`, `src/lib/instance-users.test.ts`, `src/lib/activity-labels.test.ts`, `src/components/arrivo/instance-users-list.test.tsx`, `src/components/arrivo/instance-activity.test.tsx`, `src/app/(app)/admin/users/actions.test.ts` -- write first; cover every matrix row (fake-DB unit tests like `account-role-changes.test.ts`), origin parsing (valid, trailing path, non-http, empty), pending/expired row, label changes, action success/refusals/revalidate/events, and `after` throwing leaving result intact.
- [ ] `tests/e2e/features/account-creation.feature`, `tests/e2e/steps/account-creation.steps.ts` -- real-Postgres scenarios on the credential-authorization fixture: one account per username under concurrent adds (lock gate), duplicate refused with no second account/authorization, admin demoted while waiting refused, rollback leaves no user when issuance fails, stored digest only.
- [ ] `src/data/types.ts` -- `AddUserInput`/`AddUserResult`, `AddUserFailure` const+union, `SetupLinkGenerated` event type, `setupExpiresAt?: string` on `InstanceUserSummary`.
- [ ] `src/lib/request-origin.ts` -- `trustedLinkOrigin(env = process.env): string | undefined`, `NEXTAUTH_URL` then `AUTH_URL`, parsed with `URL`, http/https only, returns `.origin`.
- [ ] `src/lib/account-creation.ts` -- `addUser(database, actorUserId, {username}, clock?)`; validate, lock, recheck admin, duplicate check on `lower(username)`, insert, issue authorization, map 23505 to taken and 40P01/40001 to retry; return snapshots for Activity. Origin check lives in the action (service takes no origin).
- [ ] `src/app/(app)/admin/users/actions.ts` -- `addUserAction(username)`: `requireAdmin`, `trustedLinkOrigin` check before service, `addUser(db, ...)`, `revalidatePath("/admin/users")`, `recordActivity` for `AccountCreated` then `SetupLinkGenerated`, return setupUrl once.
- [ ] `src/lib/instance-users.ts`, `src/components/arrivo/instance-users-list.tsx`, `src/lib/activity-labels.ts` -- pending expiry via unconsumed, uninvalidated setup authorization; render "Pending setup · Expires <local time>" or "Setup expired" when `useNow()` is past it; `<time>` with `suppressHydrationWarning`; update labels.
- [ ] `tests/e2e/feature-map.mjs` -- `@feat:account-creation` entry for new files; add shared users list/labels to `instance-users` and `instance-activity` entries; update their step text if it asserts old labels.
- [ ] Run targeted Vitest files, then `npm run test:e2e:affected`. Record exact commands/results in Implementation Notes. Do not run build-validator in the child; parent owns it.

**Acceptance Criteria:**

- Given a completed admin and a free username, when Add User runs, then the account is created pending with a 24-hour link, Users shows Pending setup with expiry, and Activity records account creation and link generation without token or URL.
- Given an existing username, when anyone adds it, even concurrently, then exactly one account exists and no second authorization is issued.
- Given no trusted origin, when Add User runs, then it refuses with an actionable error and writes nothing.
- Given an actor demoted while waiting for locks, when the add proceeds, then it is refused with no account.
- Given Activity scheduling or writing fails, when Add User succeeds, then the result and committed rows are unaffected.

## Implementation Notes

- Targeted Vitest (command under Verification) plus `scripts/feature-map.test.mjs`: pass. `npx tsc --noEmit`, eslint on touched paths: clean.
- `npm run test:e2e:affected` escalated to the full suite because `src/data/types.ts` is shared: 403 passed, 1 failed (`trip-live-refresh` "deleted elsewhere", Delete trip menuitem not found); passed on isolated rerun (flake, unrelated). `@feat:account-creation`: 5/5 pass.
- `request-origin.ts` deliberately left unmapped (stays on `src/lib/**` full-suite tier; `browserUrl` serves all auth redirects).

## Plan Change Log

## Review Triage Log

### 2026-10-28 — Review pass

- verdicts: 2 findings — high 1, medium 0, low 1, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` listInstanceUsers setupExpiresAt subquery correlates `users.id`, but single-table select strips qualifiers so it becomes inner `id` and never matches — confirmed in drizzle `buildSelection`; fixed with a literal `"users"."id"` and a unit test asserting the rendered SQL.
  - `[low]` `[reject]` No real-Postgres test of the listing query — listing uses the global db singleton, not the isolated-schema fixture; the rendered-SQL unit test covers the defect and a new harness is disproportionate.

## Design Notes

Origin check sits in the action because the service is request-independent and the env is process state; the action refuses before opening the transaction so nothing is written. `issueCredentialAuthorizationInTransaction` re-locks the singleton and sorted actor/new-user rows; holding the singleton already serializes, so no deadlock. Pending expiry is derived (latest open setup authorization), not stored, matching "never store status".

## Verification

**Commands:**

- `npx vitest run src/lib/account-creation.test.ts src/lib/request-origin.test.ts src/lib/instance-users.test.ts src/lib/activity-labels.test.ts "src/app/(app)/admin/users/actions.test.ts" src/components/arrivo/instance-users-list.test.tsx src/components/arrivo/instance-activity.test.tsx` -- expected: pass
- `npm run test:e2e:affected` -- expected: account-creation, instance-users, instance-activity, credential-authorizations scenarios pass

## Auto Run Result

- Summary: `addUser` service, `addUserAction` (trusted-origin check, revalidate, post-commit Activity), Pending setup row with expiry, new `SetupLinkGenerated` event, relabelled `AccountCreated`.
- Files: see diff since baseline; new `src/lib/account-creation.ts`, its unit/E2E tests, edits to actions, instance-users, request-origin, activity labels, types, feature-map.
- Review: 1 patch applied (subquery correlation), 0 deferred, 1 rejected (real-Postgres listing test, low).
- Follow-up review recommended: true — a high finding was patched; the corrected subquery is unverified against real Postgres.
- Verification: targeted Vitest, tsc, eslint clean; affected E2E ran full suite: 403 passed, 1 flaky unrelated (`trip-live-refresh`, passes on rerun). Post-patch: instance-users test, tsc, eslint pass.
- Residual risks: `useNow()` mock date can skew the expired label; pending-expiry query not exercised against real Postgres.
