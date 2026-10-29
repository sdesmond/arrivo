
- source_plan: `_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/story-concurrent-edit-batching-plan.md`
  summary: Cover an admin viewing an ongoing merged "Updated trip" row end to end on /admin/activity.
  evidence: No trip producer exists until 2.5, so 2.2 proves the label only at component level and the merge only against the real DB.

## Deferred from: code review of story-password-reset-tracer-plan (2026-10-29)

- Pre-existing sign-out-everywhere action can pass session validation before a reset, then bump the version afterward and revoke fresh sessions. Recheck the session version under the account lock.
- Pre-existing device-removal action can pass session validation before a reset, then remove a newly created device afterward. Recheck the session version under the account lock.
