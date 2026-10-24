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

- parent — _bmad-output/initiative-self-hosted-administration/initiative-self-hosted-administration.md
- spec — _bmad-output/initiative-self-hosted-administration/spec-self-hosted-administration/spec-self-hosted-administration.md, capabilities CAP-1, CAP-4, CAP-11
- architecture — _bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
- ux — _bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/EXPERIENCE.md

## Notes

- Decision: 2026-10-24 opening epic; defines table, route and naming choices later epics adopt.
