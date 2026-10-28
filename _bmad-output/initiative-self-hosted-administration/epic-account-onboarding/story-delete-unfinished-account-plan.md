---
title: "Delete unfinished account"
type: feature
ticket: 7
created: "2026-10-28"
status: built
baseline_revision: "2cc2738657c97194c68485db92b06a9cf969e622"
route: full
route_source: auto
risk: high
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - AGENTS.md
  - _bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Admins cannot remove a pending or expired account from Users, so a mistyped or abandoned account keeps its username and a dormant setup path.

**Approach:** Add a minimal Delete control on unfinished rows. A locked service re-checks admin authority and that the target is still unfinished, then deletes the user row; its credential authorizations cascade, so every link and open setup context admits no one. Record identity-only Activity after commit.

## Boundaries & Constraints

**Always:** Lock order per AD-2: instance singleton, then actor and target IDs sorted (`lockInstanceAndUsersForUpdate`), all in one transaction. Recheck completed-admin actor and `password_hash is null` on target after locking. Completed accounts are refused here. Activity after commit via `recordActivity`, identities only, failure never affects success. Base UI dialog primitives, explicit Props interface, `use client`, 44px targets, CSS tokens, named controls, confirm step before delete, Escape/focus return. Types in `src/data/types.ts`. Stale or already-deleted target refreshes Users and never resurrects a row.

**Never:** Delete completed accounts, reset, CLI recovery, succession, migrations (authorizations already `on delete cascade`), new dependencies, changelog edits, Host-derived anything. Do not commit/push. Implementation child must not run build-validator.

## I/O & Edge-Case Matrix

| Scenario                       | Input / State                             | Expected behavior                                                                            | Error handling                   |
| ------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| Delete pending/expired         | Unfinished target, completed admin actor  | Row removed, authorizations gone, old link and open context admit no one, one Activity event | No error                         |
| Completed target               | `password_hash` set                       | Nothing deleted, no event                                                                    | `changed-state`, Users refreshed |
| Already deleted                | Row gone before action                    | No event                                                                                     | `changed-state`, Users refreshed |
| Concurrent delete + completion | Both queued on locks                      | Exactly one wins; loser sees changed state                                                   | Loser refused, no partial state  |
| Authority                      | Actor missing/demoted/unfinished          | No writes or events                                                                          | `forbidden`, refresh             |
| Invalid IDs                    | Non-UUID actor/target                     | No DB access                                                                                 | forbidden / changed-state        |
| Contention                     | Missing singleton / SQLSTATE 40P01, 40001 | No deletion                                                                                  | `instance-unavailable` / `retry` |
| Unknown response               | Action throws client-side                 | Users refreshed, no claim of success                                                         | Toast asks to review Users       |
| Activity failure               | Scheduling/persist fails                  | Deletion stands, success unchanged                                                           | Existing best-effort boundary    |

</intent-contract>

## Code Map

- `src/lib/setup-link-regeneration.ts` -- pattern to mirror (locks, actor/target snapshot, `retryable`, UUID guard, rollback class). Do not modify.
- `src/lib/account-lifecycle-locks.ts` -- `lockInstanceAndUsersForUpdate`; reuse as is.
- `src/db/schema.ts` -- `credential_authorizations.user_id` references users `on delete cascade`; no migration needed.
- `src/lib/unfinished-account-deletion.ts` (new) -- `deleteUnfinishedAccount(database, actorUserId, targetUserId)`; raw `sql` select + `delete from users where id = ... and password_hash is null returning id`.
- `src/app/(app)/admin/users/actions.ts` -- add `deleteUnfinishedAccountAction`: `requireAdmin`, service, `revalidatePath("/admin/users")`, `recordActivity`.
- `src/components/arrivo/delete-unfinished-account-dialog.tsx` (new) -- confirm dialog modeled on regenerate dialog, smaller; no result URL.
- `src/components/arrivo/instance-users-list.tsx` -- render dialog next to the regenerate trigger for `!user.setupComplete`.
- `src/data/types.ts`, `src/lib/activity-labels.ts` -- `ActivityEventType.PendingAccountDeleted = "pending_account_deleted"`, label Accounts / "Deleted unfinished account"; `DeleteUnfinishedAccountResult/Outcome/Failure` types.
- `tests/e2e/feature-map.mjs` -- register new feature with its service, dialog, shared action/list/label paths.
- `tests/e2e/steps/setup-link-regeneration.steps.ts` -- reuse its target fixture steps and credential-URL-safe patterns; new steps go in a new file.

## Tasks & Acceptance

**Execution:**

- [ ] Tests FIRST: create `src/lib/unfinished-account-deletion.test.ts` and `src/components/arrivo/delete-unfinished-account-dialog.test.tsx`; extend `src/app/(app)/admin/users/actions.test.ts`, `src/components/arrivo/instance-users-list.test.tsx`, `src/lib/activity-labels.test.ts`, `src/components/arrivo/instance-activity.test.tsx`. Cover every matrix row, lock order, invalid IDs, rollback/retry, secret-free event, confirm/cancel, Escape, focus return, stale refresh.
- [ ] Create `tests/e2e/features/unfinished-account-deletion.feature` (tag `@feat:unfinished-account-deletion`) and `tests/e2e/steps/unfinished-account-deletion.steps.ts`: delete pending and expired, link then admits no one, row gone after refresh, Activity event; completed target refused; stale deleted row does not reappear; real-Postgres race of delete vs completion yielding one outcome. Await server action POST before reload.
- [ ] Implement types, service, action, dialog, row trigger, label. No schema change.
- [ ] `tests/e2e/feature-map.mjs` -- register the new entry.
- [ ] Run targeted Vitest and the focused Playwright feature; append commands/results to Implementation Notes.

**Acceptance Criteria:**

- Given a pending or expired account, when an admin confirms Delete in Users, then the row disappears, the account's old setup link admits no one, and one identity-only Activity event exists.
- Given a completed account, when delete is attempted, then it is refused, the account remains, and Users refreshes.
- Given delete and setup completion racing for the same account, when both run, then exactly one succeeds and the database holds one consistent state.
- Given a stale Users list showing an already-deleted account, when Delete is confirmed, then Users refreshes and does not restore the row.

## Plan Review

Original request: ticket 3.7, minimal admin delete of unfinished accounts, based on current branch. Scope limited to epic boundaries; tests named per source file; no migration required because authorizations cascade.

Plan-reviewer result: scope PASS, architecture PASS, component PASS (modified files all under 250 lines; new dialog has Props interface and `use client`), accessibility PASS with one warning applied (row trigger labelled `Delete account: <username>`, confirm button `Delete account`, focus returns to trigger on cancel/Escape, focus moves to dialog title on open), test coverage PASS (every covered file has a colocated test step; E2E feature and steps planned). No blocking findings.

## Implementation Notes

- Vitest (6 listed files): 109 passed. `node scripts/run-e2e.mjs --grep=@feat:unfinished-account-deletion`: 6 passed. tsc and eslint clean. Feature steps reuse the regeneration target Given and stale-state When steps.

## Plan Change Log

## Review Triage Log

### 2026-10-28 — Review pass

- verdicts: 7 findings — high 0, medium 0, low 3, false 4, maybe-false 0
- findings:
  - `[false]` `[reject]` Delete could cascade-remove trips of a passwordless account — an account with `password_hash is null` cannot authenticate, so it cannot create trips; epic decision records that pending accounts own no trips, and no code path assigns trips to one.
  - `[low]` `[reject]` No test for Activity-failure matrix row in the action — `recordActivity` catches its own scheduling/write failures (`src/lib/activity.ts`), same unguarded pattern as the regeneration action; a new branch would add complexity for an unreachable throw.
  - `[low]` `[reject]` Dialog tests do not assert distinct toast text for forbidden vs changed-state — test-only polish, behavior covered by `info` and `refresh` assertions.
  - `[low]` `[reject]` Expired example only exercises fresh-context rejection — an expired link has no open setup context to test; deletion cascades authorization rows, which the pending example covers.
  - `[false]` `[reject]` Race scenario uses a stand-in for completion — it drives the real `consumeCredentialAuthorization` with a callback setting `password_hash`, the same lock path the real completion uses; the regeneration race does the same.
  - `[false]` `[reject]` Second 44px button may overflow rows — row container is `flex flex-wrap` (`src/components/arrivo/instance-users-list.tsx`), so controls wrap.
  - `[false]` `[reject]` Process claims unverifiable — modified files are 108 lines (list) and under 250; test results were rerun by the parent (109 unit, 6 E2E passed).

## Design Notes

Delete cascades authorizations, which is stronger than flag-invalidation: lookups by digest find no row, so links and open contexts fail. Pending accounts own no trips (epic decision), so no trip lock is needed.

## Verification

**Commands:**

- `npx vitest run src/lib/unfinished-account-deletion.test.ts src/components/arrivo/delete-unfinished-account-dialog.test.tsx src/components/arrivo/instance-users-list.test.tsx src/lib/activity-labels.test.ts src/components/arrivo/instance-activity.test.tsx "src/app/(app)/admin/users/actions.test.ts"` -- expected: all pass.
- `node scripts/run-e2e.mjs --grep=@feat:unfinished-account-deletion` -- expected: all pass.

## Auto Run Result

- Summary: Admins can delete a pending or expired account from Users after a confirm step. A locked service (instance, then sorted actor/target IDs) rechecks admin authority and that the target has no password, deletes the row (credential authorizations cascade), and the action refreshes Users and records an identity-only `pending_account_deleted` Activity event. Completed or already-deleted targets give `changed-state` and a Users refresh.
- Files: `src/lib/unfinished-account-deletion.ts` (service), `src/app/(app)/admin/users/actions.ts` (action), `src/components/arrivo/delete-unfinished-account-dialog.tsx` (confirm dialog), `src/components/arrivo/instance-users-list.tsx` (row trigger), `src/data/types.ts` and `src/lib/activity-labels.ts` (types, event, label), `tests/e2e/feature-map.mjs`, `tests/e2e/features/unfinished-account-deletion.feature`, `tests/e2e/steps/unfinished-account-deletion.steps.ts`, plus colocated unit tests.
- Review: quick lens, 7 findings; 0 patches, 0 deferred, 7 rejected (4 false, 3 low) with reasons in the triage log. Follow-up review recommended: false.
- Verification: parent reran 6 Vitest files (109 passed) and `node scripts/run-e2e.mjs --grep=@feat:unfinished-account-deletion` (6 passed). Subagent: tsc clean, `scripts/feature-map.test.mjs` 8 passed. Build-validator not run by this workflow; it is owned by the parent/user.
- Residual risks: coverage thresholds and full build not run here. Branch is based on `ticket/regenerate-link-and-expired-state` per the invocation; PR target and rebase onto `feat/self-hosted-administration` happen when that branch merges.
