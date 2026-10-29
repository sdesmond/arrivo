---
title: "Onboarding refactor sweep"
type: "refactor"
ticket: "9"
created: "2026-10-28"
status: "built"
baseline_revision: "a2f79ac5e4d1fbf70a5d53f7d8f16b81e0a40790"
route: "oneshot"
route_source: "auto"
risk: "low"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Add User and Regenerate dialogs duplicate the one-time setup-link result panel (username, expiry, link, copy button, copy fallback), and `actions.ts` builds the setup URL twice. Sibling plans left no deferred findings, so duplication is the sweep.

**Approach:** Extract a shared `SetupLinkResult` component and a local `setupUrlFor(origin, token)` helper. Behavior and existing tests stay unchanged.

</intent-contract>

## Tasks & Acceptance

- `src/components/arrivo/setup-link-result.tsx` + colocated `.test.tsx` -- new component owning panel markup and copy state; tests cover copy success, copy failure fallback, expiry/username render.
- `add-user-dialog.tsx`, `regenerate-setup-link-dialog.tsx` -- use it; drop `Copy` import, `copyMessage` state, `copyLink`.
- `src/app/(app)/admin/users/actions.ts` -- single `setupUrlFor` helper used by add and regenerate.
- Existing dialog and action tests pass unchanged; affected E2E (`add-user-dialog`, regenerate) pass.

## Implementation Notes

Oneshot: small mechanical extraction, under 100 lines. Rejected: merging dialog state machines (differ in phases, reconcile target, toast behavior; unifying adds risk).

## Review Triage Log

### 2026-10-28 — Review pass

- verdicts: 3 findings — high 0, medium 0, low 3, false 0, maybe-false 0
- findings:
  - `[low]` `[reject]` Missing-clipboard branch not covered in the new component test — the rejecting-clipboard test runs the same catch path; the dialog test also covers it.
  - `[low]` `[patch]` Expiry test only checked the `datetime` attribute — added a visible-text assertion.
  - `[low]` `[reject]` Relative `./setup-link-result` import inconsistent — `add-user-dialog.tsx` already imports `./form-section` relatively; no rule broken.

## Verification

**Commands:**

- `npx vitest run src/components/arrivo/setup-link-result.test.tsx src/components/arrivo/add-user-dialog.test.tsx src/components/arrivo/regenerate-setup-link-dialog.test.tsx "src/app/(app)/admin/users/actions.test.ts"` -- expected: all pass
- `npx tsc --noEmit` and `npx eslint` on touched files -- expected: clean

## Auto Run Result

- Summary: Extracted shared `SetupLinkResult` (panel and copy fallback) used by Add User and Regenerate dialogs; `actions.ts` builds setup URLs through one `setupUrlFor`. No behavior change.
- Files: `src/components/arrivo/setup-link-result.tsx` and test (new); `add-user-dialog.tsx`, `regenerate-setup-link-dialog.tsx` (use it, copy state removed); `src/app/(app)/admin/users/actions.ts` (helper).
- Review: quick lens, 1 patch (low), 0 deferred, 2 rejected (low, reasons in triage log). Follow-up review recommended: false.
- Verification: 4 targeted Vitest files, 77 passed; tsc and eslint clean; `@feat:add-user-dialog` E2E 5 passed. `@feat:setup-link-regeneration`: 5 of 8 fail at the recipient "Set up your account" dialog, identically on the stashed baseline, so unrelated to this change.
- Residual risks: pre-existing regeneration E2E failures unexplained. Build-validator not run here.
