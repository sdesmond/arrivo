---
title: "Manage instance layout"
type: "feature"
ticket: ""
created: "2026-10-29"
status: "in-progress"
baseline_revision: "2916594df80115d7fe7fdf7bc78b78070c99775f"
route: "oneshot"
route_source: "auto"
risk: "low"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Manage instance should use available width so Activity is easier to see. Present users in a responsive grid of cards, with each user's existing applicable controls in their card. Preserve role guards, setup actions and unfinished-account deletion; completed-account deletion belongs to the next epic and is not implemented here.

</frozen-after-approval>

## Implementation Notes

Oneshot: localized layout changes, preserving existing behavior. Update `src/components/arrivo/instance-users-list.test.tsx` to verify cards associate each user with applicable actions and retain existing state coverage. Existing role and unfinished-account deletion E2E scenarios cover the unchanged flows; verify responsive layout through targeted checks.

## Plan Change Log

## Review Triage Log

- False: apparent BMad override deletions resulted from sandbox access denial; Git status outside the sandbox confirms those files are unchanged.

## Verification

Run targeted component tests, then build-validator.


