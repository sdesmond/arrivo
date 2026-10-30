---
title: "Avoid flagging cookie path metadata as a secret"
type: "bugfix"
created: "2026-10-29"
status: "built"
baseline_revision: "079e5c0fd3550cf9900d460eba4b6ab0df9b5773"
route: "oneshot"
route_source: "auto"
risk: "medium"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** PR review treats a reset-cookie path as a literal credential and fails the check.

**Approach:** Recognize this nonsecret metadata narrowly, preserving detection of actual credentials and high-confidence secrets. Work on the existing branch; the base-branch workflow only uses this fix after it reaches the base.

</frozen-after-approval>

## Implementation Notes

Oneshot: narrowly scoped scanner change with a matching regression test.

Only the exact cookie-path name and value are exempt; other literals and high-confidence secret patterns remain checked. The quick review found no issues.

## Plan Change Log

## Review Triage Log

## Verification

Run `npx vitest run scripts/pr-review/checks.test.mjs` and validate the current PR diff with the updated scanner. Then run the project validator.

Targeted scanner tests: 92 passed; updated scanner found no secrets in the PR diff. Lint, TypeScript, coverage and build passed. Affected E2E skipped: no impacted features.
