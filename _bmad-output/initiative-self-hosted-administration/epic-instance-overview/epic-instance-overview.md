---
type: epic
title: "Instance overview"
parent: initiative-self-hosted-administration
covers: [CAP-10]
after: []
assignee: ""
risk: high
---

# Instance overview

## Description

Storage adapter health and usage measurement, and the Overview page with per-metric freshness.

## Outcome

Admins see instance condition at a glance; the CAP-10 success check is the signal.

## Done when

1. Version, DB health, storage health, user/admin/pending counts, trip/document counts, upload bytes, recent admin actions and failed logins all appear, each with its own freshness and manual Refresh.
2. A failed probe shows Unavailable with Retry, never zero or Healthy; stale values keep their timestamps.
3. Usage counts only user-upload bytes, measured through the storage adapter.
4. Recent admin actions and failed logins read from Activity and show no trip detail.
5. /admin and Manage app land on Overview; non-admins get not-found.
6. An integrated browser suite proves these, including a forced probe failure.

## Boundaries

Overview and adapter extension. Not new infrastructure.

## References

- parent — _bmad-output/initiative-self-hosted-administration/initiative-self-hosted-administration.md
- spec — _bmad-output/initiative-self-hosted-administration/spec-self-hosted-administration/spec-self-hosted-administration.md, capabilities CAP-10
- architecture — _bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
- ux — _bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/EXPERIENCE.md

## Notes

- Waits on epic-activity-and-retention because: the recent-actions panel reads Activity.
- Decision: 2026-10-24 branching: integration branch is `feat/self-hosted-administration`, which accepts no direct pushes. Branch each ticket off it as `ticket/<slug>` and open a PR into it, never into `main`. When slicing this epic, write this rule into every ticket entry's `notes` so it reaches the build.
- Decision: 2026-10-30 one epic, no split: one capability (CAP-10), one owner.
- Decision: 2026-10-30 recent admin actions are the admin-performed event types (RetentionChanged, AccountCreated, SetupLinkGenerated, SetupLinkRegenerated, PendingAccountDeleted, RoleChanged, PasswordResetLinkGenerated, AdminRecoveryLinkGenerated, AccountDeletedByAdmin), latest 5; failed logins are a count over the last 24 hours.
- Decision: 2026-10-30 each metric refreshes through its own server action returning `{status, value, checkedAt}`; no persistence or cache table.
- Decision: 2026-10-30 version comes from the package.json version injected at build time; entry 1 confirms the Docker image carries it.
- Decision: 2026-10-30 the failed-probe E2E uses a test-only fault hook on the storage adapter (entry 2), not a spike.
- Decision: 2026-10-30 keep the default refactor sweep (entry 7) and closing E2E suite (entry 8).
- Source conflict: AD-12 — excludes the "internal key directory" from usage vs no such directory under the storage root today; usage excludes transient probe keys only. Corrected in the spine and spec memlog 2026-10-30.
- Waits on epic-activity-and-retention: its Activity read service (`readActivityPage`, 2.7) is done, so entry 5 carries `after` 2.7.
- Tracer bullet: entry 1 (route, nav, reader contract, version, DB health, user counts). Entry 2 runs beside it; entries 3 to 5 reuse the shared metric card.
- CAP-11 is a touch point owned by epic-instance-foundation; entry 1 only changes where Manage app lands.
- Decision: 2026-10-30 the product term is "Manage app", not "Manage instance": "app" names app-wide things. The admin heading and account-menu item keep that name; the spec, EXPERIENCE and DESIGN were corrected to match the same day.
- Decision: 2026-10-31 per-row Refresh is proven in the browser for storage only (Refresh, stale value, Retry, forced probe failure); the other rows' Refresh is covered by unit tests, because anything a unit test can cover does not become an extra E2E test. Done when 1 and 6 are read that way.
