---
title: "Stabilize E2E route discovery and anonymous requests"
type: bugfix
ticket: ""
created: "2026-11-11"
status: built
baseline_revision: "5c3dc801a4cef333d00ff887f82834608199de46"
route: oneshot
route_source: auto
risk: medium
review: 'quick'
review_source: 'auto'
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Full E2E run produced 19 trip-note order failures with Next HTML 404s; source exists while E2E generated manifest omits route. One anonymous trip-note create unexpectedly succeeded despite cookies being cleared, potentially due to a shared-cookie race; underlying cause is not yet proven.

**Approach:** Investigate and fix both causes. Managed fresh E2E runs must discover current routes; anonymous API requests must be reliably unauthenticated and assertions must detect real authorization failures. Preserve existing uncommitted work and test evidence. No full E2E run unless user requests it; no push without authorization.

</frozen-after-approval>

## Implementation Notes

Oneshot chosen for a focused runner/test-harness change. Tests first: `scripts/run-e2e.test.mjs` for fresh/reuse/skip cache handling and safe isolation; `tests/e2e/features/api.feature` and `tests/e2e/steps/api.steps.ts` for anonymous trip-note request isolation and regression; extend fixture tests if needed. Existing order and anonymous scenarios provide end-to-end coverage. Inspect scenario teardown and avoid disposing API responses before assertions. Verify targeted tests and selected API/trip-note scenarios, then project validator.

## Review Triage Log

## Verification

- Targeted Vitest runner/fixture tests; selected trip-note order and anonymous-create E2E cases with fresh E2E server; repeat relevant cases to test stability.
- Run project build-validator after targeted tests and review.
- Fresh managed runs clear only dedicated E2E caches after both ports are stopped; reused servers keep caches. Anonymous trip-note requests use isolated Playwright context with explicitly empty storage and scenario teardown. Initial browser regression passed before fix, so the actual cookie race was not reproduced; a subsequent 404 exposed inherited storage state, corrected with empty storage. Targeted runner tests: 19 passed; TypeScript passed; fresh route plus focused E2E 7 passed.

- Quick review: no findings. Lint passed (13 existing warnings), TypeScript and production build passed. Coverage: 444 files, 7,532 tests; lines 97.90%, functions 97.52%, branches 93.75%.
- Focused fresh-server checks: order and keyboard reorder passed; anonymous checks initially showed isolated request inheriting configured authenticated storage, corrected with explicitly empty storage. Follow-up focused run: 7 passed. Scoped API and trip-notes E2E: 324 passed.
- Validator affected detection selected full E2E due to shared runner change; stopped immediately under user constraint. Scoped API and trip-notes passed instead; full E2E validator gate remains user-run. Original test-results restored.
