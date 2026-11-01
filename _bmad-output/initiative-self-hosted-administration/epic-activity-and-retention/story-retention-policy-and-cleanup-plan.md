---
title: "Retention policy and cleanup"
type: "feature"
ticket: "8"
created: "2026-10-26"
status: done
baseline_revision: "5508ece0c9ec3baade3a34cb870db78cb4f891f5"
route: "full"
route_source: "auto"
risk: "high"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick", "authority-locking"]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Admins explicitly save Activity retention; background cleanup physically removes expired history without affecting primary actions.

## Boundaries & Constraints

**Always:** Default 90; options 30/90/180/365 days. Confirm shortening against current saved policy. Recheck completed-admin authority under instance-then-account locks. Emit changed-policy event after commit. Maintenance reads saved policy without lifecycle locks, uses real time and independent nonwaiting maintenance lock. Keep whole batches whose latest event meets cutoff. Expired history stays readable until deleted. Catch scheduling and cleanup failures.

**Never:** Unsaved-policy cleanup, response-path maintenance waits, idle scheduler, indefinite retention, private metadata, per-edit storage, or completion inferred from Save.

## I/O & Edge-Case Matrix

| State | Result |
| --- | --- |
| Valid save | Saved duration; post-commit event and maintenance |
| Shortening | Permanent-deletion confirmation; Cancel preserves policy |
| Failed/stale save | Retain selection; no save-triggered cleanup/event; renew confirmation after refresh |
| Cleanup contention/failure | Skip or stop; primary outcome unchanged |
| Status | Timestamped expired-row inspection; unavailable on failure |

</frozen-after-approval>

## Code Map

Task library/component paths resolve under `src/lib/` and `src/components/arrivo/`.

- `src/db/schema.ts`: `instanceState` lacks retention. Add nonnull default and allowed-values CHECK; generate `drizzle/` migration.
- `src/lib/account-lifecycle-locks.ts`: reuse instance/user locks unchanged.
- `src/lib/activity-batches.ts`: connected SELECT needs row locks before merge to prevent concurrent cleanup losing edits. Keep partition lock.
- `src/lib/activity.ts`: reuse `recordActivity`; preserve expired reads in `activity-queries.ts`.
- `src/app/(app)/admin/activity/{page.tsx,actions.ts}`: server reads/actions. Dynamic `src/app/(app)/layout.tsx` triggers independently of writes; layout reuse limits triggers to server requests. Page/layout: 46/51 lines.
- `tests/e2e/activity-batch-fixture.ts`, `role-service-fixture.ts`: isolated Postgres schemas and concurrency gates.

## Tasks & Acceptance

- [x] Tests first: `src/lib/{activity-retention,activity-maintenance,activity-batches,activity-labels}.test.ts`, `src/components/arrivo/activity-retention-settings.test.tsx`, `src/app/(app)/admin/activity/actions.test.ts`. Cover validation, authority loss, stale policy, rollback, no-op, cutoff equality, limits, contention, failure isolation and truthful status.
- [x] Schema/migration and `src/data/types.ts`: policy/result types, `RetentionChanged`; label in `activity-labels.ts`. Migration tests prove existing-row default and rejected invalid values.
- [x] `activity-retention.ts`: injected-DB read/save services; expected-policy comparison and authority recheck under lifecycle locks. Return committed actor/changed flag. Admin-only read returns saved days, expired-row EXISTS and checked-at time in one consistent snapshot.
- [x] `activity-maintenance.ts`: caught `after` scheduler and injectable transaction. One pass/trigger, at most 500 oldest expired rows, 2-second statement timeout, 1ms lock timeout, dedicated `pg_try_advisory_xact_lock`, `FOR UPDATE SKIP LOCKED`, deletion cutoff recheck. No lifecycle locks/retries.
- [x] `activity-batches.ts`: lock connected rows before updating; test both writer-first and cleanup-first races against real Postgres.
- [x] Activity `actions.ts`: authenticated save, post-commit changed event, successful-save maintenance, revalidation, guarded status refresh, safe errors. Page loads controls; app layout schedules after authentication. Read version-matched Next docs before edits.
- [x] `activity-retention-settings.tsx`: client, explicit `ActivityRetentionSettingsProps`, local selection, labeled Select/Button/AlertDialog, explicit Save and inline error. Saved acknowledgment remains separate from cleanup inspection. Ordered headings, CSS tokens/font fallbacks, 44px controls, text/ARIA state. Enter/Space opens, arrows select, Escape dismisses; Cancel initially focused, focus returns to Save. Mobile bottom-sheet confirmation.
- [x] `tests/e2e/features/activity-retention.feature`, `tests/e2e/steps/activity-retention.steps.ts`, `tests/e2e/activity-retention-fixture.ts`: scenario-owned fixtures with shared-policy restoration; save/reload/event, cancel/failure, keyboard/mobile, denied authority, dynamic cleanup without event writes, nonwaiting contention, 500-row cap, overlap, expired visibility and both writer races. Await action POST before reload. Register sources/tag in `tests/e2e/feature-map.mjs`; preserve cross-cutting layout/schema coverage.

**Acceptance Criteria:**

- Given stale authority/policy or failed save, when submitted, then unsaved policy produces neither deletion nor retention event.
- Given expired rows and no new Activity writes, when dynamic requests occur, then bounded cleanup deletes eligible rows while preserving overlapping batches and primary outcomes.
- Given cancellation or maintenance failure, when state is displayed, then saved policy and cleanup inspection remain distinct and truthful.

## Implementation Notes

- Implemented generated policy migration, locked save/read services, 500-row maintenance, post-response triggers, batch row locking, retention UI and isolated PostgreSQL tests. Targeted Vitest: 52 pass; retention E2E: 16 pass; Activity E2E after fixture/selector fixes: 27 pass. Every I/O matrix row has executed passing tests. No unsaved-policy maintenance/event emission; status remains an inspection snapshot.
- Integration validation exposed reader fixtures dated in 2025 and ambiguous Refresh selectors. Fixtures now stay within shortest retention; Activity list Refresh lookups are exact. Reservation unit timeouts during parallel build passed all 31 tests in isolation and all 4,966 on coverage rerun. No production changes for timing.

## Plan Change Log

## Review Triage Log

- medium / patch: isolated schemas shared database-wide maintenance key with app requests; skipped cleanup could strand race gate. Scoped key by current_schema(), preserved same-schema contention, and reran 5 maintenance unit tests plus 16 retention E2E tests successfully. Authority/locking review found no defects. No deferrals.

## Design Notes

No status table/polling. Report pending, “No expired activity found at {time}”, or unavailable. Refresh rechecks authority.

## Verification

Run named Vitest files first. Generate/review migration with `npm run db:generate`; apply with `npm run db:migrate:e2e`. Run `npm run test:e2e:affected` for UI and isolated real-DB cases. Parent runs final build-validator after implementation/review: lint, types, coverage, build and affected E2E. Upgrade requires migration.

## Auto Run Result

- Implemented retention controls and migration, independent bounded cleanup, latest-event cutoff and writer race protection. Operator upgrade requires migration.
- Review: one medium patch applied for schema-scoped maintenance locking; authority/locking review clean; nothing deferred.
- Final verification: lint/types/build PASS; 4,966 unit tests PASS, lines 97.14%, functions 96.9%, branches 91.98%; production build generated 17 pages. Affected E2E ran 357 tests: 349 passed and eight timed out during concurrent coverage. All eight plus auth setup passed retry via Playwright --last-failed with two workers (9/9). This was not a clean single-pass E2E run. Targeted retention 16/16 and Activity 27/27 also passed.
- Implementation commit: 167a2fda93c80557a79f0ac44d9ea0f043ea05ac
