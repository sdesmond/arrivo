---
epic: epic-instance-overview
date: 2026-10-31
verdict: accepted-with-open-items
criteria: declared
headless: false
---

# Retrospective: Instance overview

## Epic summary

Epic `epic-instance-overview` (CAP-10), run on the repo store. All 8 tickets are `done`; `pending_tickets` is empty. No ticket remains at `built`. The user marked 5.1–5.7 `done` on 2026-10-31 in this session; 5.8 was already `done`. The user asked for no particular emphasis before analysis ("go").

Plan ranges (baseline to next baseline, oldest first; 5.8 runs to `HEAD` `e7ae09c2`, inferred). Evidence from `git_evidence.py`; non-epic merges inside a range are listed in the Findings.

| Ticket | Range | Commits (merges) | Files |
| ------ | ----- | ---------------- | ----- |
| 5.1 Overview tracer | `138a174a..5bb73ad5` | 12 (4) | 29 |
| 5.2 Storage adapter health and usage | `5bb73ad5..95430577` | 2 (1) | 6 |
| 5.3 Storage health and upload bytes | `95430577..26dba38e` | 3 (1) | 8 |
| 5.4 Trip and document counts | `26dba38e..beef94f0` | 8 (4) | 12 |
| 5.5 Recent admin actions and failed logins | `beef94f0..ef007769` | 4 (1) | 12 |
| 5.6 Per-metric Refresh, Retry, stale | `ef007769..125dcb17` | 14 (3) | 34 |
| 5.7 Refactor sweep | `125dcb17..75e3d5e8` | 2 (1) | 3 |
| 5.8 Integrated Overview E2E suite | `75e3d5e8..HEAD` | 2 (1) | 1 |

Source diff `138a174a..HEAD` under `src/`: 36 files, +2234/-113.

Evidence inventory. Available: epic file with declared Done when, initiative file, all 8 plans with `baseline_revision`, commits and diffs, previous retro (epic-recovery-and-deletion), `deferred-work.md`, `status-audit-2026-10-30.md`. Missing: session logs (process-lesson analysis skipped). Narrowed: architecture delta, duplication map and pattern divergence were derived inline from churn ranking and targeted file reads, not by a dependency tool or sub-agent; `bmad-review` was not invoked. Read each as "checked at that scope", not "clean".

## Findings

### Spec-to-implementation reconciliation

- **S1 — Per-metric Refresh is browser-proven for storage only.** Done when 1 and 6 name manual Refresh per metric and a browser suite proving the criteria. `tests/e2e/features/admin-overview.feature:14-24` covers storage Refresh, stale retention, Retry and the forced probe failure; the other rows' Refresh is covered by unit tests only. Source: `story-integrated-overview-e2e-suite-plan.md` Intent, "Decision (user, 2026-10-31)": a unit-coverable behavior must not become an extra E2E test. Disposition: accept as-is, record the deviation so later runs stop re-flagging it. Prevention: when the epic's Done when says "integrated browser suite proves these", say which rows need browser proof.
- **S2 — Overview timestamps use the real clock, not `getNow()`.** `src/lib/overview-readers.ts:96-98` (`readFailedSignIns` doc comment) and `:123`, fallback `new Date()`. This diverges from the project convention in AGENTS.md. It reads as deliberate: checked times describe real probe freshness and the 24-hour window is real elapsed time. Disposition: accept; propose a decision record (see Decision records).
- **S3 — Stale `unknown` on entry 5.1.** `tickets.toml` entry 1 still carries `unknown = "The Docker image must carry the package.json version..."`. `story-overview-tracer-plan.md:35` records the resolution: version injected via `next.config.ts` `env` as `APP_VERSION`, no Dockerfile change. Disposition: fix now (documentation only).
- **S4 — Plan 5.8 contradicts itself.** Its frozen Approach says add no new E2E and close the ticket. Its Verification section still expects "the new scenario" and an acceptance Given/When/Then, and its Review Triage Log patches a scenario that was then reverted. Source: `story-integrated-overview-e2e-suite-plan.md` Intent vs Verification and Review Triage Log. Disposition: defer; the Implementation Notes record the revert, and the plan is a closed record.

### Process and tree hygiene

- **P1 — Untracked work inside the epic window.** Three plans with `ticket: ""` sit in the initiative folder: `plan-overview-metric-cards.md` (merged as PR #387, in 5.6's range), `plan-admin-users-card-redesign.md` (PR #388, in 5.7's range) and `plan-epic-4-lifecycle-race-fixes.md`. `tickets.py status` reports them as problems. The metric-cards rework changed Overview UI (`metric-row.tsx`, `refreshable-metric.tsx` are among the top churn files) with no ticket entry. Disposition: defer; give such work a backlog ticket or an epic Notes line.
- **P2 — Plans are written with a cp1252 em dash.** `story-integrated-overview-e2e-suite-plan.md` held byte `0x97`, which made `tickets.py` fail with a UTF-8 decode error, twice (once on the branch, once after the PR merged). Fixed in the working tree; not committed. Disposition: fix now at the writer; prevention: the plan writer should emit UTF-8.

### Code lenses (narrowed scope)

- **C1 — Storage symlink race, unverified.** `story-storage-adapter-health-and-usage-plan.md:81` and `deferred-work.md:20-22`: concurrent directory replacement between `lstat` and later I/O could follow a substituted symlink. Medium impact, no reproduction. Disposition: defer; already tracked in `deferred-work.md`.
- **C2 — Review depth.** All 8 plans ran the `quick` review lens (`review: quick`, `review_source: pinned`). Seven of eight found 0 or 1 patchable findings; 5.8's pass found 2 medium. The epic is `risk: high` but no ticket above `medium`. No defect was found, but the diff was never reviewed above `quick`. Disposition: accept; note for the next epic.
- **Size growth.** No file grew into a god-class: largest source files are `overview-readers.ts` (132 lines), `local-filesystem-adapter.ts` (135), `activity-queries.ts` (200), all small. Top churn is test code (`admin-overview.steps.ts` 494, `overview-readers.test.ts` 376). Scope: churn ranking plus `wc -l`, no architecture-delta tool.
- **Layering.** `overview-readers.ts` and `activity-queries.ts` import `server-only`; no client-component import of them was found in the files read. Scope: header check only.

## Behavior verification

Exercised: `node scripts/run-e2e.mjs --server=kill "--grep=@feat:admin-overview"` on `feat/self-hosted-administration` at `e7ae09c2`. Result: 4 passed (setup plus 3 scenarios: status rows with storage fault, Refresh and Retry; recent admin actions and failed sign-ins; member gets not-found). One console line was noted: React "Encountered a script tag while rendering React component" in the member-denied scenario; not traced to this epic. Not exercised: a production container run, so Done when 1's version row and the Docker route were not checked outside the dev build. The full suite was not run.

## Previous-retro follow-through

Previous retro: `epic-recovery-and-deletion/epic-recovery-and-deletion-retrospective.md` (verdict rejected; six proposed actions). Re-checked on 2026-10-31 against the code and ledgers; this replaces an earlier version of this section that found no evidence for A1–A3, which was wrong.

- **A1** (account-security developer, pass session version into self-deletion): landed. `src/lib/account-deletion.ts:39-45` takes `sessionVersion` and returns `Unauthorized` when it is `undefined`; `AccountDeletionFailure.Unauthorized` is in `src/data/types.ts:908`; commit `4188b3ff`; plan `plan-epic-4-lifecycle-race-fixes.md` has all tasks checked. Only the plan's own frontmatter (`status: built`, `ticket: ""`) and Implementation Notes ("implementation ... pending") are stale. The fix's tests were not re-run here.
- **A2** (trip-collaboration developer, manager check under trip lock): landed. `src/lib/membership-writes.ts:266` checks `myRow?.role !== CollaboratorRole.Manager`; commit `4188b3ff`.
- **A3** (account-lifecycle developer, sorted heir locks): landed per the same commit and plan task ("lock heirs with departing user", sorted order); not re-read line by line here.
- **A4** (maintainer, reconcile `deferred-work.md`): landed. The Activity browser-coverage item and both reset-race items are marked "Closed 2026-10-30" with evidence; commit `4dd00772`.
- **A5** (ticket/build maintainer, review metadata and selector): not landed. `story-password-reset-tracer-plan.md:11-13` still has empty `review`, `review_source` and `lenses_ran`; `.agents/skills/bmad-build/customize.toml:97` still sets `review = "quick"`, and all eight plans in this epic carry `review: quick`, `review_source: pinned`. The 3.6 risk mismatch also remains: `story-regenerate-link-and-expired-state-plan.md` says `risk: high`, `epic-account-onboarding/tickets.toml` entry 6 says `medium`.
- **A6** (Activity maintainer, `server-only` boundary for `activity-maintenance.ts` / `activity-retention.ts`): not landed. Neither file imports `server-only`. Importers found are all server code (`(app)/layout.tsx:12`, `admin/activity/page.tsx:8`, the page's `actions.ts`); the client component `activity-retention-settings.tsx` imports neither, so no boundary violation exists today, only the missing guard.

Epic 4's verdict was rejected on F1–F3; their fixes are in the code, so its acceptance now depends on the validator gate and a verdict update, neither of which was checked here.

## Action items

All proposed, none applied. Owners are roles.

1. **Tree maintainer:** remove the stale `unknown` from `tickets.toml` entry 5.1 (S3).
2. **Plan-writer maintainer:** write plan files as UTF-8 (P2); commit the already-repaired 5.8 plan file.
3. **Ticket maintainer:** give `plan-overview-metric-cards`, `plan-admin-users-card-redesign` and `plan-epic-4-lifecycle-race-fixes` a ticket or an epic Notes line so `status` stops reporting them (P1).
4. **Epic owner:** add a `Decision:` line to the epic Notes recording that per-row Refresh is browser-proven for storage only (S1).
5. **Epic 4 owner:** confirm the validator gate passed for commit `4188b3ff` and update the epic-4 retro verdict; close or ticket `plan-epic-4-lifecycle-race-fixes.md` (its frontmatter and notes are stale). Landed: A1–A4. Still open from epic 4: A5 (review metadata and 3.6 risk mismatch) and A6 (`server-only` on `activity-maintenance.ts` and `activity-retention.ts`).
6. **Next epic planner:** pin review above `quick` for work the epic rates `risk: high` (C2).

## Decision records

Two records proposed and approved by the user ("write both ADRs", 2026-10-31); written:

- `docs/decisions/adr-overview-freshness-uses-real-clock-not-get-now.md` — plan `story-overview-tracer-plan.md` (5.1), commit `84866562`. The plans state the choice, not an explicit trade-off; the record says so.
- `docs/decisions/adr-overview-metrics-refresh-through-per-metric-server-actions-without-persistence.md` — plan `story-per-metric-refresh-retry-and-stale-states-plan.md` (5.6), commit `ba2fdb92`.

The test-only fault hook decision is already in the epic Notes and easily reversed, so no record was proposed.

## Acceptance verdict

**accepted-with-open-items**, criteria **declared**. All 8 tickets are finished. Done when: 1 version, DB, user counts, trip and document counts, storage health, upload bytes, recent actions and failed logins on Overview with per-row Refresh — met per tickets 5.1–5.6 and the passing browser run (storage Refresh browser-proven; other rows unit-proven, S1). 2 Unavailable with Retry, never zero or Healthy, stale keeps timestamps — met, forced probe failure scenario passes. 3 usage counts upload bytes through the adapter — met, `local-filesystem-adapter.ts` plus its tests. 4 recent actions read Activity with no trip detail — met, scenario 2. 5 `/admin` lands on Overview, non-admin gets not-found — met, scenarios 1 and 3. 6 integrated suite incl. forced probe failure — met with the S1 deviation. Open items: C1, S3, S4, P1, P2, and epic 4's unresolved rejection.

## Open questions

- Is a production-container check of the version row (Done when 1) needed before release? Only the dev build was run.
- Does the React "script tag" console warning on the member-denied page predate this epic?
- Did the validator gate pass for epic 4's remediation, and should the epic-4 retro verdict change? Answer decides whether epic 4 is accepted, not this epic.
