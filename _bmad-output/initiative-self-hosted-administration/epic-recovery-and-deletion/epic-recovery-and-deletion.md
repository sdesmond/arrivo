---
type: epic
title: "Recovery and deletion"
parent: initiative-self-hosted-administration
covers: [CAP-5, CAP-6, CAP-7]
after: []
assignee: ""
risk: high
---

# Recovery and deletion

## Description

Shared account-deletion succession, admin reset link, and CLI recovery replacing the immediate mfa-reset command.

## Outcome

Admins can remove, reset and recover accounts safely; CAP-5, CAP-6 and CAP-7 success checks are the signal.

## Done when

1. Succession and outcome-fingerprint recheck per CAP-5; self-service deletion shares the last-admin guard.
2. Reset completion revokes sessions and invalidates sibling authorizations.
3. CLI recovery is atomic; old mfa-reset command and its docs are removed.
4. Events are emitted without secrets.

## Boundaries

Deletion, reset, recovery CLI. Not setup links.

## References

- parent — _bmad-output/initiative-self-hosted-administration/initiative-self-hosted-administration.md
- spec — _bmad-output/initiative-self-hosted-administration/spec-self-hosted-administration/spec-self-hosted-administration.md, capabilities CAP-5, CAP-6, CAP-7
- architecture — _bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
- ux — _bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/EXPERIENCE.md

## Notes

- Waits on epic-account-onboarding because: reuses its credential-authorization module.
