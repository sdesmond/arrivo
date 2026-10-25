---
title: "Bootstrap and role E2E suite"
type: "feature"
ticket: "7"
created: "2026-10-25"
status: "built"
baseline_revision: "c2383aab070b4cc8a974f7572317a79da85271b6"
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

**Problem:** Foundation E2E covers bootstrap, closed signup, menu visibility, promotion and self-demotion on desktop only (mobile only checks a member's menu). Epic done-when 4 needs E2E for bootstrap and role flows on desktop and mobile, and sign-up closing right after the first account is unproven end to end.

**Approach:** Extend the existing `instance-bootstrap`, `account-menu` and `instance-users` features and steps with mobile-viewport scenarios (admin menu, bootstrap via Profile tab, promote + self-demotion) and a "second sign-up refused after the first" scenario. Test-only: no production, schema or fixture-bootstrap changes; no `global-setup.ts` edits; no ordering tags.

</frozen-after-approval>

## Implementation Notes

Oneshot: Gherkin plus small step tweaks, under 100 lines, no production code. Tests to touch: `tests/e2e/features/{instance-bootstrap,account-menu,instance-users}.feature` and matching `tests/e2e/steps/*.steps.ts`. Reuse `I use a mobile account viewport` (390x844) and `I open the shared account menu` (falls back to the Profile tab). Make the bootstrap sign-out step use that shared menu opener so it works on mobile. Scenarios stay scenario-owned (`ensureCurrentUser`, `materialize`, `setInstanceState`); `feature-map.mjs` already registers all three stems. Concurrent first sign-ups stay covered by the real-Postgres service tests, not a browser race. Needs no unit tests: no `src/lib` or `src/components/arrivo` edits.

## Plan Change Log

## Review Triage Log

- medium: bootstrap sign-out step not mobile-aware -- patched; step uses desktop/Profile fallback and mobile scenario now signs out and back in.
- low: mobile bootstrap lacked Profile-tab no-navigate check -- patched.
- low: second sign-up scenario overlaps "initialized" scenario -- rejected; it adds the fresh-to-closed sequencing.
- false: mobile Users list may lack role buttons -- mobile scenario passed at 390px.

## Verification

**Commands:**

- `npm run test:e2e:affected` -- expected: instance-bootstrap, account-menu, instance-users features pass
