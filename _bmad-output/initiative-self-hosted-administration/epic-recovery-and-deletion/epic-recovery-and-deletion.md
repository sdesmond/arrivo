---
type: epic
title: "Recovery and deletion"
parent: initiative-self-hosted-administration
covers: [CAP-5, CAP-6, CAP-7]
after: []
assignee: ""
risk: high
status: done
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
- Decision: 2026-10-24 branching: integration branch is `feat/self-hosted-administration`, which accepts no direct pushes. Branch each ticket off it as `ticket/<slug>` and open a PR into it, never into `main`. When slicing this epic, write this rule into every ticket entry's `notes` so it reaches the build.
- Decision: 2026-10-29 epic scope and seven-entry breakdown approved; password reset is the tracer through browser, lifecycle, database and Activity, with CLI and deletion-specific storage paths following.
