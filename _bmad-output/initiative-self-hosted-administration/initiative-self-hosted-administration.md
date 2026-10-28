---
type: initiative
title: "Self-hosted administration"
parent: none
covers: [CAP-1, CAP-2, CAP-3, CAP-4, CAP-5, CAP-6, CAP-7, CAP-8, CAP-9, CAP-10, CAP-11]
after: []
assignee: ""
risk: high
---

# Self-hosted administration

## Description

An Arrivo operator controls account entry, administrative authority, account exit and recovery, and sees Activity and instance condition, without any admin screen exposing private trips. The spec owns capabilities, constraints and non-goals; this initiative delivers them.

## Outcome

A self-hoster can run a closed multi-user installation and recover from lockouts using only the app and server CLI; the spec's Success signal is the demonstration.

## Done when

1. Fresh install automatically opens welcome/admin setup; first account is admin, then setup/signup routes redirect to sign-in without signup navigation; an upgraded single-account install is promoted exactly once.
2. An admin adds a user by username, the user sets a password via a manually shared link, and no regular app data is reachable before then.
3. Admin can reset a user's password and a server operator can recover a locked-out admin through the CLI, each atomically and with sessions revoked.
4. Deleting an account hands owned trips to successors without revealing private trip contents; the last admin cannot be removed.
5. Activity and Overview show the specified data with retention enforced, and a forced Activity failure never changes a primary action's outcome.

## Boundaries

Account lifecycle, admin authority, recovery, Activity and Overview inside the existing Arrivo monolith. Not email, diagnostics, suspension, quotas, backups (see the spec's Non-goals). Tracer path: fresh install, first signup becomes admin, admin opens Manage instance.

- Touch point: storage adapter (`src/lib/storage/`) gains health and usage measurement; owner: epic-instance-overview
- Touch point: existing trip, profile and auth code emits Activity events; owner: epic-activity-and-retention
- Touch point: `src/db/mfa-reset-cli.ts`, Dockerfile and `docs/self-hosting.md` are replaced by the recovery CLI; owner: epic-recovery-and-deletion

## References

- spec — \_bmad-output/initiative-self-hosted-administration/spec-self-hosted-administration/spec-self-hosted-administration.md, section Capabilities
- constraint — the same spec, section Constraints
- architecture — \_bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
- ux — \_bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/EXPERIENCE.md and DESIGN.md beside it

## Notes

- Decision: 2026-10-24 five epics in order foundation, Activity, onboarding, recovery and deletion, overview; Activity second so later epics emit events as built (user confirmed).
- Decision: 2026-10-24 recovery and deletion stay one epic (shared lock rules).
- Decision: 2026-10-24 architecture review findings (`architecture-self-hosted-administration/reviews/`) checked against the final spine; all five applied (AD-3, AD-10, AD-11, Credential validation convention).
- Unknown: exact table, route and event-type names; chosen in epic 1 and 2 inception, then adopted by later epics.
