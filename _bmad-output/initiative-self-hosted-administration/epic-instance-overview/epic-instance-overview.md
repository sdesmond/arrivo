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

1. All listed metrics present with independent freshness.
2. Failed probes show Unavailable, never zero or healthy.
3. Usage counts only user-upload bytes.
4. Recent admin actions and failed logins read from Activity.

## Boundaries

Overview and adapter extension. Not new infrastructure.

## References

- parent — _bmad-output/initiative-self-hosted-administration/initiative-self-hosted-administration.md
- spec — _bmad-output/initiative-self-hosted-administration/spec-self-hosted-administration/spec-self-hosted-administration.md, capabilities CAP-10
- architecture — _bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
- ux — _bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/EXPERIENCE.md

## Notes

- Waits on epic-activity-and-retention because: the recent-actions panel reads Activity.
- Decision: 2026-10-24 branching: integration branch is `feat/self-hosted-administration`, which accepts no direct pushes. Branch each ticket off it as `ticket/<slug>` and open a PR into it, never into `main`.
