
- source_plan: `_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/story-concurrent-edit-batching-plan.md`
  summary: Cover an admin viewing an ongoing merged "Updated trip" row end to end on /admin/activity.
  evidence: No trip producer exists until 2.5, so 2.2 proves the label only at component level and the merge only against the real DB.

## Deferred from: code review of story-password-reset-tracer-plan (2026-10-29)

- Pre-existing sign-out-everywhere action can pass session validation before a reset, then bump the version afterward and revoke fresh sessions. Recheck the session version under the account lock.
- Pre-existing device-removal action can pass session validation before a reset, then remove a newly created device afterward. Recheck the session version under the account lock.

- source_plan: `_bmad-output/initiative-self-hosted-administration/epic-recovery-and-deletion/story-deletion-concurrency-and-self-service-plan.md`
  summary: app-activity E2E scenarios (e.g. "Renamed and deleted accounts stay filterable...") fail on the baseline commit, with the filter option locator count 0 and intermittent other app-activity failures.
  evidence: same scenario fails on stashed baseline 66a3ecd2 and with the change; the account-deletion code is untouched here.

- source_plan: `epic-recovery-and-deletion/story-admin-recovery-issuance-service-plan.md`
  summary: Investigate broader E2E intermittency under full affected scope before treating that gate as reliable.
  evidence: Final story 4.4 run passed 483 tests but failed existing rename/self-deletion Activity at the 30-second limit and trip transit-mode persistence (Walk remained unselected). Both passed unchanged in an isolated rerun (3 tests including auth setup) and earlier broad runs. An earlier cover-search timeout also passed unchanged in isolation. Recovery issuance scenarios passed throughout; no runtime code in the failing flows changed. Reproduce with four-worker full affected scope and capture timing/persistence evidence; do not mask with ordering or shared reseeding.
