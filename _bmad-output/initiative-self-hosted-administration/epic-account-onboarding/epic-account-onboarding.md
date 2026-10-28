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

Token module, setup routes, Add User, minimal delete of an unfinished (pending or expired) account. Not reset, CLI recovery, or deletion of completed accounts (succession).

## References

- parent — \_bmad-output/initiative-self-hosted-administration/initiative-self-hosted-administration.md
- spec — \_bmad-output/initiative-self-hosted-administration/spec-self-hosted-administration/spec-self-hosted-administration.md, capabilities CAP-2, CAP-3
- architecture — \_bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
- ux — \_bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/EXPERIENCE.md

## Notes

- Decision: 2026-10-27 `/setup` is reserved for one-time instance admin creation. Later account password-setup links use a separate route and must remain usable after instance initialization. First-run admin setup follow-up precedes this epic.

- Waits on epic-instance-foundation because: Users list and admin guard.
- Waits on epic-activity-and-retention because: events use its recording API.
- Decision: 2026-10-24 branching: integration branch is `feat/self-hosted-administration`, which accepts no direct pushes. Branch each ticket off it as `ticket/<slug>` and open a PR into it, never into `main`. When slicing this epic, write this rule into every ticket entry's `notes` so it reaches the build.
- Decision: 2026-10-27 delete scope: CAP-3's delete of an unfinished account is built here as a minimal story (AD-2 lock order, invalidates all the account's authorizations). Pending accounts own no trips. epic-recovery-and-deletion generalizes it and unifies the error contract (foundation retro A4, A5).
- Decision: 2026-10-27 link origin: Add User and regeneration refuse to issue when no trusted origin is configured (`NEXTAUTH_URL`/`AUTH_URL`), with an actionable operator error. Never derive links from Host or X-Forwarded-*.
- Decision: 2026-10-27 review lens: every `risk: high` entry pins `review: authority-locking` in its `notes` (activity retro A1).
- Source conflict: epic Boundaries "Not deletion" vs CAP-3 "deleted account's link admits no one" — resolved by the delete-scope decision above.
- Names to choose in this epic (architecture defers them; not settled in epics 1-2): credential-authorization table, setup route and cookie, Activity event types for link generated/regenerated/setup completed/pending deleted.
