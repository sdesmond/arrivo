
- source_plan: `_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/story-concurrent-edit-batching-plan.md`
  summary: Cover an admin viewing an ongoing merged "Updated trip" row end to end on /admin/activity.
  evidence: No trip producer exists until 2.5, so 2.2 proves the label only at component level and the merge only against the real DB.
  disposition: Closed 2026-10-30. Ongoing merged Activity browser coverage landed in tests/e2e/features/app-activity.feature and steps/app-activity.steps.ts; epic-4 retrospective F4 records evidence.

## Deferred from: code review of story-password-reset-tracer-plan (2026-10-29)

- Closed 2026-10-30: Pre-existing sign-out-everywhere action could pass session validation before a reset, then bump the version afterward and revoke fresh sessions. Fixed in `eac1acec`: locked session-version recheck in `src/app/(app)/profile/security-actions.ts`, covered by password-reset browser race.
- Closed 2026-10-30: Pre-existing device-removal action could pass session validation before a reset, then remove a newly created device afterward. Fixed in `eac1acec`: locked session-version recheck in `src/app/(app)/profile/security-actions.ts`, covered by password-reset browser race.

- source_plan: `_bmad-output/initiative-self-hosted-administration/epic-recovery-and-deletion/story-deletion-concurrency-and-self-service-plan.md`
  summary: app-activity E2E scenarios (e.g. "Renamed and deleted accounts stay filterable...") fail on the baseline commit, with the filter option locator count 0 and intermittent other app-activity failures.
  evidence: same scenario fails on stashed baseline 66a3ecd2 and with the change; the account-deletion code is untouched here.

- source_plan: `epic-recovery-and-deletion/story-admin-recovery-issuance-service-plan.md`
  summary: Investigate broader E2E intermittency under full affected scope before treating that gate as reliable.
  evidence: Final story 4.4 run passed 483 tests but failed existing rename/self-deletion Activity at the 30-second limit and trip transit-mode persistence (Walk remained unselected). Both passed unchanged in an isolated rerun (3 tests including auth setup) and earlier broad runs. An earlier cover-search timeout also passed unchanged in isolation. Recovery issuance scenarios passed throughout; no runtime code in the failing flows changed. Reproduce with four-worker full affected scope and capture timing/persistence evidence; do not mask with ordering or shared reseeding.

- source_plan: `epic-instance-overview/story-storage-adapter-health-and-usage-plan.md`
  summary: Investigate concurrent symlink substitution during local storage measurements (medium impact, unverified).
  evidence: Static symlinks are skipped or rejected, but a concurrent local filesystem writer could replace a checked directory before later path-based I/O. A deterministic directory-swap reproduction would establish whether upload-root escape occurs.

- source_plan: `epic-recovery-and-deletion/epic-recovery-and-deletion-retrospective.md` (A6; inherited from epic-2 A3 and epic-3 A5)
  summary: `server-only` boundary for `src/lib/activity-maintenance.ts` and `src/lib/activity-retention.ts`.
  evidence: Importers are server code only (`(app)/layout.tsx`, `admin/activity/page.tsx`, the page's `actions.ts`); the client component `activity-retention-settings.tsx` imports neither. Playwright fixtures `tests/e2e/activity-integration-fixture.ts` and `tests/e2e/activity-retention-fixture.ts` import both in plain Node, where `server-only` throws.
  disposition: Closed 2026-10-31 without a guard. Decision: 2026-10-31 no `server-only` import, because no client consumer exists and the guard would break the two fixtures without a bundling workaround. Revisit if a client component starts importing either module.
