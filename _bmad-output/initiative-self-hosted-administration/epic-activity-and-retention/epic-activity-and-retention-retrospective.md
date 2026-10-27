---
epic: epic-activity-and-retention
date: 2026-10-27
verdict: accepted-with-open-items
criteria: declared
headless: false
---

# Retrospective: Activity and retention

## Epic summary

Epic 2, `epic-activity-and-retention`, covers CAP-8 and CAP-9. Ten tickets, all `status: built`, `state: review`; none unfinished (`pending_tickets` empty). None is marked `done` yet.

| Ref | Ticket | Risk | Lenses run | Range (baseline..next baseline) |
| --- | --- | --- | --- | --- |
| 2.1 | Sign-in to Activity tracer | high | quick | fdc4f02..c146a6a |
| 2.2 | Concurrent edit batching | high | quick | c146a6a..9b8b7b6 |
| 2.3 | Authentication and account events | high | quick | 9b8b7b6..d682680 |
| 2.4 | Trip and itinerary events | medium | quick | d682680..3cc2619 |
| 2.5 | Other trip edit events | medium | quick | 3cc2619..31bff0f |
| 2.6 | Trip invitation events | medium | quick | 31bff0f..0bd8d65 |
| 2.7 | Activity filters and reader states | medium | quick | 0bd8d65..5508ece |
| 2.8 | Retention policy and cleanup | high | quick, authority-locking | 5508ece..13a7394 |
| 2.9 | Refactor sweep | low | quick | 13a7394..a611232 |
| 2.10 | Integrated Activity and retention E2E suite | low | quick (inline) | a611232..563c30a (HEAD, inferred) |

Epic-wide: `fdc4f02..HEAD`, 87 files, +13,524 / -114 under `src tests drizzle`; 72 files, +10,792 / -111 under `src drizzle`. `git_evidence.py` run once per range; outputs are in the session scratchpad, not the tree. Baselines are in plan frontmatter, and merge-spine commits make adjacent ranges overlap on merges.

Evidence inventory: epic file, initiative spec (CAP-8/9), ten plans, `activity-producer-inventory.md`, `deferred-work.md`, previous retro. Available: git history. Missing: story files (`story_file` null for all; the plans hold intent) and session logs, so process-lesson analysis is limited to what the plans record. Sub-agents were not used; derivations ran inline (narrowed scope noted per finding). `bmad-review` was not invoked; lenses were run inline over the producers, recorder, maintenance and retention code only (narrowed scope).

## Findings

Aggregate views. Architecture delta and the god-class ranking were derived from `git diff --numstat fdc4f02..HEAD`; the duplication map was a read-through of the recorder helpers, not a script.

- **F1 (process, medium; fix next epic).** Foundation retro A2 did not land. The epic's own Build contracts said to review high-risk authority/locking work "with a stronger lens than quick, per foundation retrospective A2", yet all ten plans carry `review: quick`, `review_source: pinned` (frontmatter lines 11-12). Of four `risk: high` tickets, only 2.8 ran `authority-locking` (`story-retention-policy-and-cleanup-plan.md:13`). 2.3 changed `account-role-changes.ts` (+22) and `account-deletion.ts` (+6) with the quick lens only. No defect was found in this retro, so the effect is unobserved, not shown harmful. Prevention: the slicing step pinned `quick` on every ticket, so the epic's own rule never reached the build.
- **F2 (efficiency, low; defer).** `scheduleActivityMaintenance()` runs in `src/app/(app)/layout.tsx` on every render. Each pass opens a transaction with two `set_config` calls and an advisory-lock attempt before it tests for expired rows (`src/lib/activity-maintenance.ts:17-24`), so there is one extra DB round trip per layout render with no throttle. Next layouts persist across client navigation, so cadence is also irregular. CAP-9 asks only for "opportunistic" removal, so this is within spec. Revisit if load shows up.
- **F3 (pattern divergence, low; accept).** `import "server-only"` appears on `activity.ts`, `activity-queries.ts` and `trip-activity.ts` but not on `activity-maintenance.ts`, `activity-retention.ts` or `activity-batches.ts`. The maintenance module imports `next/server` and the DB singleton and has one caller, the server layout, so nothing is broken today. A client import of any of them would fail only at build time of the DB import, not on an explicit marker.
- **F4 (verification, medium; defer).** 2.8's final affected E2E run was not clean: 357 tests, 349 passed, eight timed out under concurrent coverage and passed on `--last-failed` retry (`story-retention-policy-and-cleanup-plan.md`, Auto Run Result, which says so itself). 2.10's notes record an earlier full-suite run of 359 passed, 6 failed, all in new scenarios, since fixed. Load-sensitive flakiness is real but unquantified; this retro's run had no retries.
- **F5 (spec scope, low; accept).** Not instrumented, by design and recorded in `activity-producer-inventory.md`: MFA and security actions, `saveContributorChanges`, `declineInvitation`, `dismissInvitation`, `deleteTrip`, `leaveTrip`, standalone templates. CAP-8 lists "trip create/modify" and invitation create/accept/rescind, so these exclusions match the spec. Setup/reset/recovery link events belong to epic-account-onboarding and epic-recovery-and-deletion (epic Boundaries).
- **F6 (as-built note, accept).** The 2.2 deferral (admin view of a merged row end to end, `deferred-work.md`) is closed: `instance-activity.feature:209` (ongoing batch) and `:260` (real edits merge into one filtered ongoing summary). Update `deferred-work.md` to mark it resolved.

God-class / size growth: no god class. Largest runtime additions are `instance-activity-viewer.tsx` (194), `activity-retention-settings.tsx` (168), `activity-queries.ts` (152), `activity-filters.tsx` (142); largest runtime churn outside tests is generated migration snapshots. Duplication: `trip-activity.ts` (57 lines) is the single owner of post-response actor lookup for trip and invitation events; 14 producer files each add 2-51 lines. No duplicate recorder logic found in the files read. No cycle introduced in the files read; `activity-maintenance.ts` and `activity-retention.ts` are separate by design (nonwaiting lock vs lifecycle locks).

Diff-scope lenses (narrowed): read `activity.ts`, `activity-maintenance.ts`, `activity-retention.ts`, the batching header, and the producer-coverage spot check. Edge cases checked: recorder never throws (`activity.ts:53-60`), failures log error class only (`:21-24`), retention save rechecks admin under instance and user locks and returns `stale` on mismatch (`activity-retention.ts:41-50`), cleanup recheck uses saved policy in one snapshot with `skip locked` (`activity-maintenance.ts:29-39`). No defects found. Producer spot check: in `trips/[tripId]/actions.ts` the exports with no recorder are share/invitation delegates and upload wrappers whose owners record (`getShareDialogData`, `resendShareInvitation`, `rescindShareInvitation`, `dismissShareInvitation`, `saveContributorChanges`, `uploadDocument`, `uploadDocumentToEvent`, `uploadCoverImage`), consistent with the inventory.

## Behavior verification

- Vitest, targeted: `src/lib/activity*`, `trip-activity`, `authorize-credentials`, `instance-activity*`, `activity-*` components, `admin/activity` actions. 14 files, 229 tests passed.
- Playwright against `arrivo_e2e`: `node scripts/run-e2e.mjs --server=kill "--grep=@feat:.*activity"` covers `instance-activity`, `activity-batching` and `activity-retention`: 61 passed (60 scenarios plus the auth setup), no retries. Eight `[activity] write failed (Error)` lines appeared in the server log; they match the injected-fault scenarios from 2.10 (a scoped per-actor trigger in `tests/e2e/activity-integration-fixture.ts`, not a production switch). Plan 2.10 recorded 32 + 19 + 12 = 63 across three runs, which is the same 60 plus three setup runs.
- Not exercised: the full E2E suite, the coverage gate, lint and production build (the per-ticket validator runs recorded them: 2.8 reports 4,966 unit tests, lines 97.14%, functions 96.9%, branches 91.98%).

## Previous-retro follow-through

Source: `epic-instance-foundation-retrospective.md`, Action items.

- A1 (migration 0004 legacy-path test). Dropped by the user in that retro; nothing to follow through.
- A2 (stronger review lens than `quick` for risk:high locking/authority work; owner: whoever slices the next epic). Partly landed: 2.8 ran `authority-locking`; 2.1, 2.2 and 2.3 (risk high) ran `quick` only. See F1.
- A3 (reconcile AD-2 for `ALLOW_SIGNUP`; owner: architecture owner). No evidence found in this epic's diff; not checked in the architecture file.
- A4 (typed refusals for `deleteOwnAccount`; owner: epic-recovery-and-deletion planner). Not yet due; that epic has not started (`epics` order). No evidence of change in `account-deletion.ts` beyond +6 lines for 2.3.
- A5 (lock precondition on a third `assertAnotherCompletedAdmin` caller; owner: that epic). Not yet due.
- A6 (create `arrivo_e2e`, run affected E2E once; owner: user). Landed: the database exists and E2E ran here and in 2.8/2.10.

## Action items

Proposed, not applied.

- A1. Pin a stronger lens than `quick` at slicing time for `risk: high` tickets that touch locking or authority, and put it in each ticket's `notes` like the branching rule, so the build cannot drop it. Owner: whoever slices epic-account-onboarding. Closes F1.
- A2. Optional: throttle or pre-check expired rows before taking the maintenance lock if layout-render overhead matters. Owner: maintainer, when load is observed. Closes F2.
- A3. Add `import "server-only"` to `activity-maintenance.ts` (and `activity-retention.ts` if no client importer exists). Owner: next ticket touching Activity. Closes F3.
- A4. Mark the 2.2 admin-view item in `deferred-work.md` resolved by `instance-activity.feature:209` and `:260`. Owner: maintainer. Closes F6.
- A5. Move 2.1-2.10 from `review` to `done` via `bmad-ticket` once this verdict is confirmed. Owner: user.

## Decision records

Two candidates passed the test (hard to reverse, surprising without context, real trade-off, not already recorded) and the user approved both; each was written.

1. `docs/decisions/adr-trip-edit-batching-serializes-per-key-with-advisory-lock.md` (plan 2.2, commit `05ccd7c`).
2. `docs/decisions/adr-activity-recording-is-post-response-best-effort-without-retry.md` (plan 2.1, commit `35ae868`).

Uncommitted: committing them is the user's concern.

## Acceptance verdict

**accepted-with-open-items** (criteria declared in the epic file). No unfinished tickets, so the machine verdict is not forced to rejected.

1. Viewer filters by actor, type and date with pagination: **met.** `readActivityPage` keyset paging with actor/type/date filters (`activity-queries.ts`); `activity-filters` and viewer components with unit tests; `instance-activity` feature passed here.
2. Edit batching and minimal trip-event metadata verified by tests: **met.** `activity-batches.test.ts` plus isolated real-Postgres cases (plan 2.2); `activity-batching` feature passed here; events carry actor and trip ID only.
3. Forced write failure never alters a primary outcome: **met.** Scoped fault-injection scenarios from 2.10 passed here; the recorder swallows scheduling and write failures (`activity.ts:53-60`).
4. Retention options, confirmation and opportunistic cleanup: **met.** `activity-retention` feature passed here; migration and locked save in `activity-retention.ts`; cleanup in `activity-maintenance.ts`.

No blocking finding. Open items: F1 (process), F2, F3, F4, and housekeeping F6. A human decision overrides this verdict.

## Open questions

- Whether the unthrottled per-render maintenance pass (F2) is acceptable for expected instance size.
- A3 from the foundation retro (AD-2 wording) was not checked here; confirm whether it landed.
