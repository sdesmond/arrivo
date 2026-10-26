---
epic: epic-instance-foundation
date: 2026-10-25
verdict: accepted-with-open-items
criteria: declared
headless: false
---

# Retrospective: Instance foundation

## Epic summary

Folder: `_bmad-output/initiative-self-hosted-administration/epic-instance-foundation`. Resolved from the slug `epic-instance-foundation` against `status` `epics`. No `pending_tickets`: every ticket is `done` or `built`. User had no going-in concerns.

| Ref | Ticket | status / state | Plan range (baseline..end) |
| --- | --- | --- | --- |
| 1.1 | Instance state, roles and bootstrap signup | done / done | `875b2c5..b72df87` (8 commits, 33 files) |
| 1.2 | Account menu and Manage instance shell | built / review | `b72df87..3081fa3` (6, 35) |
| 1.3 | Role-change service with last-admin guard | built / review | `3081fa3..0cf382a` (5, 24) |
| 1.4 | Users list and role-change UI | built / review | `0cf382a..f02fc15` (2, 15) |
| 1.5 | Last-admin guard on self-service deletion | built / review | `f02fc15..1ab1dee` (13, 21) |
| 1.6 | Refactor sweep | built / review | `1ab1dee..c2383aa` (2, 6) |
| 1.7 | Bootstrap and role E2E suite | done / done (after retro) | `c2383aa..HEAD` (2, 5), inferred end |

Tickets at `built` when the retro ran (finished by the build, not called done): 1.2, 1.3, 1.4, 1.5, 1.6, 1.7. All six were marked done afterwards through `bmad-ticket`.

Range notes:
- Ranges come from each plan's `baseline_revision`, ordered oldest first; 1.7's end is `HEAD`, inferred. Every range was measured by `git_evidence.py` (`merges_measured` equals `merge_count` except 1.5: 3 of 6).
- The 1.5 range includes work that is not 1.5: PRs #331 (`fix/seed-admin`) and #332 (`fix/pr-review-ancestor-test-pairing`), plus a merge of the integration branch. Their files (`scripts/pr-review/checks.test.mjs`, seed files) must not be read as 1.5 churn.
- 1.7 (`c93372f`, `1832a3a`) is merged: PR #335 is in `origin/feat/self-hosted-administration` (`git branch -r --contains c93372f`). The retro first read it as unmerged from a stale local ref before fetching; corrected.

Evidence inventory:
- Available: epic file, seven plans with triage logs and verification, `deferred-work.md`, `git_evidence.py` JSON per range, architecture (AD-2), source and tests at HEAD.
- Missing: session logs (process-lesson analysis skipped). Previous retrospective (this is the first epic; none exists). `bmad-review` was not invoked; lenses ran inline over the key service files (narrowed scope, below). Sub-agents not used.
- Not exercised: Playwright E2E, because the `arrivo_e2e` database does not exist on this machine (`PostgresError: database "arrivo_e2e" does not exist` from `db:reset:e2e`).

## Findings

Disposition format: this instance / what would prevent the next one.

### Spec-to-implementation reconciliation

**F1. Dropped.** (Its `deferred-work.md` entry was deleted at the user's request, along with the file, which held only that entry.) Real-database verification of migration 0004's legacy-account paths (promotion, halt). No installations to upgrade exist except the user's test one, so upgrade concerns are out of scope (user, 2026-10-25).

**F2. AD-2 says signup stays closed "regardless of `ALLOW_SIGNUP`"; as built, `ALLOW_SIGNUP` was removed.** Source: plan 1.1 Implementation Notes and Triage Log (removal "on user direction after approval" from `SETUP.md`, `.env.example`, `docker-compose.yml`, `docs/self-hosting.md`, `scripts/setup-dev.mjs`); AD-2 in `architecture-self-hosted-administration.md:55`. Accepted deviation, user-directed. Disposition: accept; reconcile AD-2 wording (action item A3).  No installations exist, so nobody needs a notice that the setting is gone.

**F3. Dev seed admin was an unplanned scope addition that shipped a bug.** Source: `1dfe320` (seed an admin, in ticket 1.4's range) then `bd508e2` "A seeded database left instance_state uninitialized, so the next sign-up bootstrapped a second admin" (separate PR #331). Plan 1.1 Design Notes had accepted exactly this state for dev ("leaves signup open ... acceptable for dev"), so the fixed behavior was a known trade-off that the later seed change turned into a defect. Neither ticket 1.4's plan nor its triage log mentions the seed. Disposition: accept (fixed in #331, covered by `src/db/seed-inserts-accounts.test.ts`) / a change that writes admin rows by another path than bootstrap should be recognized as bypassing the bootstrap invariant when planned.

### Pattern divergence

**F4. `deleteOwnAccount` and `changeUserRole` handle the same preconditions differently.** Source: `src/lib/account-deletion.ts` throws `Error("Instance state not found.")` / `Error("User not found.")`, while `src/lib/account-role-changes.ts` returns `InstanceUnavailable` / `Forbidden` / `NotFound` and maps SQLSTATE `40P01` / `40001` to `Retry`. Both take the singleton first so deadlock risk with each other is nil, but `deleteOwnAccount` takes trip locks after the user lock (`lockTripForUpdate`), and nothing in this epic maps a trip-lock deadlock to a retryable result. Disposition: defer (A4) / refactor sweep 1.6 compared types, not error contracts.

### Aggregate views

- **Architecture delta:** `account-lifecycle-locks.ts` is the single lock-order owner and both services import it (`account-role-changes.ts`, `account-deletion.ts`); no cycles or client imports of `queries.ts`/`auth-helpers.ts` seen in the changed files. Scope: import graph derived from the service files, not a dependency tool run before and after.
- **Duplication map:** no duplicate lock or last-admin logic; ticket 1.5 reused the helper 1.3 exported as the epic's notes required. The e2e gate steps in `tests/e2e/steps/instance-role-service.steps.ts` (248 lines, touched by 1.3 and 1.5) and `tests/e2e/role-service-fixture.ts` (172) hold the blocking/release logic once; plan 1.6 chose to leave them explicit.
- **Size growth:** nothing god-class-sized. Largest runtime additions: `src/lib/account-deletion.ts` 137 lines new (the extracted body shrank `src/app/(app)/profile/actions.ts` by net 104), `src/components/arrivo/change-role-dialog.tsx` 103, `src/components/arrivo/instance-users-list.tsx` 85. `src/data/types.ts` is 1,192 lines and gained 64 across 1.1, 1.3, 1.4, 1.5, 1.6; it is the project's convention for all domain types, so accept. `drizzle/meta/0004_snapshot.json` 2,849 lines is generated.

### Diff-scope lenses (inline, narrowed)

Read `account-lifecycle-locks.ts`, `account-role-changes.ts`, `account-deletion.ts`, `drizzle/0004_instance_state_roles.sql` in full; did not read UI, route and E2E step code beyond plan notes. `bmad-review` unavailable-by-choice: not invoked.

- **F5. Dropped.** Sole-account promotion without a `password_hash` check is an upgrade-only concern (user, 2026-10-25).
- **F6. `assertAnotherCompletedAdmin` precondition (singleton lock held) is documented, not enforced.** Source: `account-lifecycle-locks.ts` comment; plan 1.3 triage "low / rejected". Epic 4's admin deletion will be the third caller. Disposition: accept now; re-check when epic-recovery-and-deletion adds its caller (A5).
- Boundary 1.3/1.5: both use the same helper, lowercase ids, and refuse before any write; the shared invariant (another completed admin) is the same function. No inconsistency found.
- Boundary 1.2/1.4: self-demotion drops the menu entry via the `GET /api/users/me/instance-role` refresh (plan 1.4 Design Notes, plan 1.2 Plan Change Log); covered by the account-menu demotion scenarios. No gap found.

### Process observations (from plans and git; no session logs)

- **F7. Every plan's review is lens `quick` only, pinned (`review_source: pinned`), including the three `risk: high` tickets (1.1, 1.3, 1.5).** Ticket 1.5's triage log is one line: quick lens "run inline by the session (no subagent spawned)", 0 findings, and it shipped the epic's highest-risk guard. 1.1 and 1.3 produced real findings under `quick`, so the lens does catch things, but nothing records a second reader on the locking code. Disposition: process lesson (A2).
- **F8. Ticket 1.7's Verification lists only a command with no recorded results**, unlike 1.2, 1.4 and 1.6. Source: `story-bootstrap-and-role-e2e-suite-plan.md` Verification. No evidence found that the final validator gate ran for 1.7, and it merged in PR #335. Disposition: accept; the user marked 1.7 done anyway.
- **F9. Tickets 1.2-1.7 are merged but were still `built`/`review`.** Source: `tickets.py status`; PRs #328-#335 in `git log`. Only 1.1 was marked done. Disposition: fixed; all marked done after the retro.
- Wins: a real-Postgres isolated-schema test pattern for the concurrency invariants (`account-role-changes.test.ts`, `account-deletion.test.ts`, `account-lifecycle-locks.test.ts`, per-fixture `application_name` to scope blocked-backend detection); the account-menu rollback was found by reproduction and fixed at the cause (GET instead of server action); the epic notes' decisions (lock helper reuse, `password_hash IS NULL` as unfinished) were followed.

## Behavior verification

- Executed: `npx vitest run` over `instance-bootstrap`, `instance-roles`, `instance-users`, `account-role-changes`, `account-lifecycle-locks`, `account-deletion`, `scripts/migrations.test.mjs`, `scripts/feature-map.test.mjs`: 8 files, 74 tests passed.
- Not exercised: Playwright features `instance-bootstrap`, `account-menu`, `instance-users`, `instance-role-service`. `node scripts/run-e2e.mjs --server=kill --grep=...` stopped at `db:reset:e2e` with `database "arrivo_e2e" does not exist`. E2E results below are the plans' own recorded runs, not observed here: 1.2 292 passed, 1.4 299 affected passed, 1.6 301 affected passed (one unrelated Notes geometry flake that passed on rerun), 1.1/1.3/1.5 recorded as "expected: pass" with no counts; 1.7 none recorded.

## Previous-retro follow-through

No previous retrospective exists: this is the first epic in the initiative (`epics` order: `epic-instance-foundation` first), so there was no file and nothing to follow through on.

## Action items

Proposed, not applied.

- A1. Dropped: migration 0004 legacy-path test (user: no upgrade scenario exists).
- A2. Pin a stronger review lens than `quick` for tickets marked `risk: high` that touch locking or authority (e.g. 1.3/1.5-shaped work in epic-recovery-and-deletion). Owner: whoever slices the next epic. Closes F7.
- A3. Reconcile AD-2: say `ALLOW_SIGNUP` no longer exists. Owner: architecture owner; spec reconciliation awaiting human application. Closes F2.
- A4. Decide whether `deleteOwnAccount` should return typed refusals and map `40P01`/`40001` like `changeUserRole`; epic-recovery-and-deletion reuses the lock helper and will need one contract. Owner: epic-recovery-and-deletion planner. Closes F4.
- A5. When epic-recovery-and-deletion adds the third `assertAnotherCompletedAdmin` caller, either enforce the lock precondition or test it. Owner: that epic. Closes F6.
- A6. Create the `arrivo_e2e` database (`createdb arrivo_e2e`, `npm run db:migrate:e2e`) and run `npm run test:e2e:affected` once to observe the epic's E2E features. Tickets 1.2-1.7 are already marked done. Owner: user. Closes F8.

## Decision records

Candidates tested against "hard to reverse, surprising without context, real trade-off, not already recorded". No `adr-*.md` files or `docs/decisions/` folder exist in the repository.

1. Account-menu role refresh via authenticated `GET /api/users/me/instance-role` (no-store), not a server action. Plan 1.2 Plan Change Log and Implementation Notes; commits `d7aafcc`..`ee7ff29`. Reason recorded in the plan: a server action reproduced a router-state rollback to stale `/trips`.
2. Members lock the instance singleton on self-service deletion, serializing all deletions. Plan 1.5 Design Notes; commit `a248299`.

Dropped as a candidate: `ALLOW_SIGNUP` removal. No installations exist, so the removal needs no explanation for operators (user, 2026-10-25).

Status: both remaining candidates approved by the user and written:
- `docs/decisions/adr-account-menu-role-refresh-uses-get-route.md` (plan 1.2, commit `d7aafcc`)
- `docs/decisions/adr-self-service-deletion-locks-instance-singleton-for-members.md` (plan 1.5, commit `a248299`)

Uncommitted: committing them is the user's concern.

## Acceptance verdict

**accepted-with-open-items** (criteria declared in the epic file).

1. CAP-1 success, including concurrent first signups: **met.** `instance-bootstrap.test.ts:83` ("creates exactly one admin when two first signups race") ran and passed here. The legacy multi-account halt and sole-account promotion are upgrade paths, dropped from scope (user, 2026-10-25); they are not judged.
2. CAP-4 under concurrent demotion and deletion, including self-service deletion: **met.** `account-role-changes.test.ts`, `account-lifecycle-locks.test.ts`, `account-deletion.test.ts` passed here; 1.3 and 1.5 plans record isolated-schema concurrency runs. The admin-deletion half is explicitly handed to epic-recovery-and-deletion.
3. Account menu shows Manage instance only to current admins on desktop and mobile; routes recheck authority: **met on recorded evidence**, not re-observed here. `requireAdmin` in `admin/layout.tsx`, `admin/page.tsx`, `admin/users/page.tsx`, `admin/users/actions.ts`; demotion scenarios in plan 1.2; mobile scenarios in 1.7 (merged, PR #335).
4. Migration applies on dev and E2E databases; E2E covers bootstrap and role flows: **mostly met.** `drizzle/0004_instance_state_roles.sql` is applied by every E2E run per plan 1.1 and later plans; E2E coverage exists for all four features. Not re-observed here (no E2E database).

No blocking finding. Open items: A2-A6, chiefly observing the E2E features once (A6). Tickets 1.2-1.7 have since been marked done. No unfinished tickets, so the machine verdict is not forced to rejected.

## Open questions

- None open.
