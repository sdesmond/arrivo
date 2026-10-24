---
type: epic
title: "Instance foundation"
parent: initiative-self-hosted-administration
covers: [CAP-1, CAP-4, CAP-11]
after: []
assignee: ""
risk: high
---

# Instance foundation

## Description

Instance-state record, bootstrap and upgrade promotion, role changes with last-admin guard, account menu, and the Manage instance shell with Users list. Opens the build.

## Outcome

Operators get a closed instance with a single durable admin authority and a reachable admin shell; the spec's CAP-1, CAP-4 and CAP-11 success checks are the signal.

## Done when

1. CAP-1 success holds, including concurrent first signups and legacy multi-account halt.
2. CAP-4 success holds under concurrent demotion and deletion, including self-service deletion.
3. Account menu shows Manage instance only to current admins on desktop and mobile; routes recheck authority.
4. Generated migration applies on dev and E2E databases; E2E covers bootstrap and role flows.

## Boundaries

Instance state, roles, menu, admin shell. Not Activity, Add User, recovery, Overview content.

## References

- parent — \_bmad-output/initiative-self-hosted-administration/initiative-self-hosted-administration.md
- spec — \_bmad-output/initiative-self-hosted-administration/spec-self-hosted-administration/spec-self-hosted-administration.md, capabilities CAP-1, CAP-4, CAP-11
- architecture — \_bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
- ux — \_bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/EXPERIENCE.md

## Notes

- Decision: 2026-10-24 opening epic; defines table, route and naming choices later epics adopt.
- Decision: 2026-10-24 names later epics adopt: table `instance_state` (singleton), `users.role` const object `admin | member`, routes under `/admin` (`/admin/users`).
- Decision: 2026-10-24 sole-account promotion and multi-account halt live in the generated SQL migration, not a boot hook.
- Decision: 2026-10-24 bootstrap and instance-state E2E reset helper is part of story 1, in the scenario-fixture helpers, not `global-setup.ts`.
- Decision: 2026-10-24 schema, bootstrap and promotion are one story (single migration owner); tracer bullet is story 2, not the first entry: story 1 is the schema it needs and has no UI.
- Decision: 2026-10-24 seven stories including the default refactor sweep and a closing E2E suite.
- Decision: 2026-10-24 story 3 exports the last-admin guard and lock-order helper; story 5 consumes it (`after` 1 and 3). Epic 4's admin deletion reuses the same helper.
- Decision: 2026-10-24 this epic's last-admin deletion coverage is self-service only; the admin-deletion half of CAP-4 is handed to epic-recovery-and-deletion.
- Decision: 2026-10-24 an unfinished account is one with `users.password_hash IS NULL`. Handoff: epic-account-onboarding adopts this rather than adding a second setup-state field.
- Decision: 2026-10-24 story 2 owns the shell and section navigation with only Users enabled; epics 2 and 5 add their sections.
- Decision: 2026-10-24 story 1 stays one story.
