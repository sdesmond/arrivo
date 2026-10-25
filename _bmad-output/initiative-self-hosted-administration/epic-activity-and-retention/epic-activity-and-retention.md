---
type: epic
title: "Activity and retention"
parent: initiative-self-hosted-administration
covers: [CAP-8, CAP-9]
after: []
assignee: ""
risk: high
---

# Activity and retention

## Description

Best-effort event storage, a recording API for other epics, the Activity viewer, batching of routine edits, retention, and instrumenting existing producers (login, trips, profile).

## Outcome

Admins review user activity within privacy limits and control retention; CAP-8 and CAP-9 success checks are the signal.

## Done when

1. Viewer filters by actor, type and date with pagination.
2. Edit batching and minimal trip-event metadata verified by tests.
3. Forced write failure never alters a primary outcome.
4. Retention options, confirmation and opportunistic cleanup work.

## Boundaries

Activity storage, API, viewer, retention, existing producers. Not events for onboarding or recovery; those epics emit them.

## References

- parent — _bmad-output/initiative-self-hosted-administration/initiative-self-hosted-administration.md
- spec — _bmad-output/initiative-self-hosted-administration/spec-self-hosted-administration/spec-self-hosted-administration.md, capabilities CAP-8, CAP-9
- architecture — _bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
- ux — _bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/EXPERIENCE.md

## Notes

- Waits on epic-instance-foundation because: the admin shell and authority checks host the Activity section.
- Decision: 2026-10-24 branching: integration branch is `feat/self-hosted-administration`, which accepts no direct pushes. Branch each ticket off it as `ticket/<slug>` and open a PR into it, never into `main`. When slicing this epic, write this rule into every ticket entry's `notes` so it reaches the build.
