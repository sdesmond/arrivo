---
type: epic
title: "Account onboarding"
parent: initiative-self-hosted-administration
covers: [CAP-2, CAP-3]
after: []
assignee: ""
risk: high
---

# Account onboarding

## Description

Shared credential-authorization lifecycle, Add User, setup-only access, mandatory password dialog, regeneration and expiry.

## Outcome

Admins add users who set their own password before any app access; CAP-2 and CAP-3 success checks are the signal.

## Done when

1. Setup-only isolation holds for routes, actions, storage reads and live subscriptions.
2. Regeneration, expiry, resume and delete behave per CAP-3.
3. Wrong signed-in account flow requires explicit sign-out.
4. Events are emitted through the Activity recording API.

## Boundaries

Token module, setup routes, Add User. Not reset, CLI recovery, deletion.

## References

- parent — _bmad-output/initiative-self-hosted-administration/initiative-self-hosted-administration.md
- spec — _bmad-output/initiative-self-hosted-administration/spec-self-hosted-administration/spec-self-hosted-administration.md, capabilities CAP-2, CAP-3
- architecture — _bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
- ux — _bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/EXPERIENCE.md

## Notes

- Waits on epic-instance-foundation because: Users list and admin guard.
- Waits on epic-activity-and-retention because: events use its recording API.
