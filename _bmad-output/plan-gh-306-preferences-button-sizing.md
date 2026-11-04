---
title: "UI improvements: preferences controls and inline save confirmations"
type: bugfix
ticket: ""
created: "2026-11-04"
status: in-progress
baseline_revision: "be11f6c89d0effbf28eaf3d7fad5a7f9ac90c8a4"
route: oneshot
route_source: auto
risk: low
review: none
review_source: pinned
lenses_ran: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** Loyalty copy/remove, wishlist remove, and companion edit/remove controls have undersized targets.

**Approach:** Reuse ghost icon-lg Buttons for 44px targets and keyboard focus styling. Preserve actions and accessible names; add missing titles. Check rendered dimensions and mobile fit. User explicitly deferred review until instructed.

**Added scope:** Copy populated passport and known traveler numbers for profile and companion fields. Remove inline save success messages beside actions throughout the app, retaining pending button labels and errors. Branch renamed to `fix/ui-improvements` at user's request. Build-validator remains deferred until explicitly requested.

**Font sizes:** Keep Small/Medium/Large, raise base sizes to 16/18/20px and text scales to 1/1.125/1.25. Current Medium becomes the minimum. Continue on the existing branch.

</frozen-after-approval>

## Implementation Notes

- Oneshot: mechanical replacement of five controls across three components, with regression coverage.
- Branch creation authorized. No review steps run or plan presented for approval.
- Replaced five raw buttons with existing ghost icon-lg Buttons; added companion titles while preserving labels and focus return.
- Regression tests failed for all three old components, then passed: 19 component tests.
- Desktop (1280px) and mobile (375px) browser scenarios pass, including expanded companion controls and viewport overflow checks.
- Implementation complete; validation in progress. Review remains paused at user's request.
- User instructed not to run build-validator until told. Stopped running coverage; affected validation E2E not started. Lint, TypeScript, and production build had already passed. Review and further validation await instruction.
- Expanded implementation uses populated-field copy controls and removes redundant save confirmations from identity, passport, preferences, companions, password change, retention, and password-rule settings. Current policy displays and actionable error messages remain.
- User clarified that temporary Saving labels stay; only messages beside actions are removed.
- Targeted component tests passed (120 tests); targeted browser checks passed (11 tests including auth setup). Follow-up copy error and desktop/mobile companion checks added.
- Final targeted component run passed: 123 tests across nine files. Desktop and mobile document-copy browser checks passed for profile and companions (two scenarios plus auth setup). No review or build-validator resumed.
- Font-size regression tests updated first; eight selector tests pass with the raised minimum and stored preferences. Browser checks include computed CSS scales and persistence at every size.
- Fresh E2E compilation passed all eight focused browser scenarios plus auth setup, including every font scale and desktop/mobile controls. Initial browser failures came from stale generated CSS in the E2E cache. Review and build-validator remain paused.

## Verification

- Colocated loyalty, wishlist, and companion component tests.
- Profile E2E scenarios checking 44px targets at desktop and mobile widths.
- build-validator after targeted tests pass.

## Code Review

### 2026-11-04

Code review complete: 0 decision-needed, 3 patch, 0 defer, 6 rejected. Reviewed uncommitted changes with blind-hunter, edge-case-hunter, verification-gap, and intent-alignment lenses. User requested review followed by validation; patches remain action items.

- [ ] [Review][Patch][Medium] Handle unavailable Clipboard API in all four new document-copy handlers. Direct property access throws before promise rejection handling on documented non-localhost HTTP installations. Sources: blind-hunter, edge-case-hunter, verification-gap. Locations: `src/app/(app)/profile/passport-section.tsx:90`, `src/app/(app)/profile/companion-row.tsx:190`.
- [ ] [Review][Patch][Medium] Keep longer loyalty values within narrow layouts. New fixed 44px buttons increase reserved row width while text retains intrinsic minimum widths and cannot wrap long member numbers. Server permits 100-character program names and 50-character member numbers; short seeded mobile checks miss this case. Source: blind-hunter. Location: `src/app/(app)/profile/loyalty-section.tsx:55`.
- [ ] [Review][Patch][Low] Verify clipboard rejection feedback for profile KT and both companion document controls. Existing rejection test covers only profile passport copying; swallowing the other three errors would pass current tests. Source: verification-gap. Locations: `src/app/(app)/profile/passport-section.test.tsx`, `src/app/(app)/profile/companion-row.test.tsx`.

### Rejected / descriptive observations

- Intent alignment 1 — false: requested size correction is implemented through 44px controls; no separate glyph-size requirement established. Shared Button CSS supplies icon sizing.
- Intent alignment 2 — false: user named Passport and KT fields; other field kinds do not establish missing scope.
- Intent alignment 3 — false: user explicitly retained pending labels and narrowed removal to messages beside actions; in-control copy feedback is consistent.
- Intent alignment 4 — false: saved-policy display is current configuration, not a transient acknowledgement.
- Intent alignment 5 — false: user accepted announced 16/18/20px preference scale; a 16px floor on every text element was not requested.
- Intent alignment 6 — false: lack of an exhaustive inventory is not evidence of a remaining unwanted confirmation. Existing scan and removal cover identified action-adjacent save messages.

## Build Validation — 2026-11-04

- Lint passed with one pre-existing unused-variable warning in invitations tests.
- Production build passed; generated 18 static pages.
- Initial standalone TypeScript check failed on malformed generated E2E bootstrap route types. Full E2E regenerated that artifact; standalone TypeScript recheck passed without source edits.
- Coverage gate failed: 6,100 tests passed, one failed. `src/app/(app)/profile/account-section.test.tsx:131` still expects removed `Password updated.` confirmation. Update it to verify field reset and disabled submit after completion. Coverage percentages were not emitted on failure.
- Affected-E2E selector chose full scope because global typography is shared; 554 tests passed, zero failed.
- Pass marker cleared. Review findings remain unpatched; no commits or pushes.
- Follow-up: replaced stale account-section success-message assertion with an awaited check for cleared password fields and disabled submit, plus absence of removed text. Both account-section and change-password-dialog test files pass: 29 tests. Full validator not rerun for this follow-up.
- Before push/PR, reran coverage after the test-only correction: 6,101 tests passed; lines 97.5%, functions 97.04%, branches 93%. Previous lint, TypeScript, build, and 554-test E2E results apply to unchanged runtime code. Review follow-ups remain open.
