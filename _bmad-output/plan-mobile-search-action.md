---
title: "Remove unused mobile search action"
type: "bugfix"
ticket: ""
created: "2026-11-04"
status: "built"
baseline_revision: "f034c6545b4cab5043fea83879c498d96384b1e4"
route: "oneshot"
route_source: "auto"
risk: "low"
review: "quick"
review_source: "auto"
lenses_ran: ["quick"]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** Mobile Trips header still exposes an unused Search trips action. Bottom navigation already excludes Search.

**Approach:** Remove unused header button and its icon import; preserve New trip behavior, accessible title, and 44px touch target.

</frozen-after-approval>

## Implementation Notes

Oneshot: small deletion in existing client component with existing props interface; no new flow or significant flow change, so component regression coverage suffices. First expand `src/components/arrivo/trips-mobile-layout.test.tsx` to assert Search button absent and New trip invokes callback. Then remove button in `src/components/arrivo/trips-mobile-layout.tsx`. Existing bottom-tab regression already excludes Search links. No E2E scenario changes required; run affected E2E through validator.

## Plan Change Log

## Review Triage Log

- Plan reviewer: scope, architecture, component, accessibility, tests pass; no findings. Existing component is below 250 lines, with explicit props and client directive.
- Quick review: no code findings. Apparent unrelated deletions were false: unsandboxed Git status and diff confirm only intended component, test, and plan changed.
- Expanded regression failed before deletion and passed afterward; 16 targeted tests pass.

## Verification

- `npx vitest run src/components/arrivo/trips-mobile-layout.test.tsx src/components/arrivo/bottom-tab-bar.test.tsx` — component regression passes.
- Run build-validator after targeted tests: lint, types, build, coverage, affected E2E.
