---
title: "Show new packing sections first"
type: "bugfix"
ticket: ""
created: "2026-11-19"
status: "built"
baseline_revision: "ef53eff6eaa8ea06799e6a2288cc4e19b135ba97"
route: "oneshot"
route_source: "auto"
risk: "low"
review: "quick"
review_source: "auto"
lenses_ran: ["quick"]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** New packing sections appear after existing sections.

**Approach:** Place each new section before the first existing section and persist that order. Apply the shared packing view behavior to trip lists and templates.

</frozen-after-approval>

## Implementation Notes

Oneshot: shared view uses the existing before-item placement for the first section by position. Component coverage exercises unsorted and empty lists; E2E covers persisted ordering. Story branch: `story/5-3-packing-create-api`; PR base: `feature/api-v1`.

## Plan Change Log

## Review Triage Log

- medium, patch: template editor uses its own server action and view; added equivalent placement and template persistence coverage.

## Verification

- Targeted component tests and both trip/template reload scenarios passed. Validator passed lint, TypeScript, production build, 8,184 tests with coverage, and 42 affected E2E checks.





