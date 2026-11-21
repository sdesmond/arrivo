---
title: "Verify trips and packing API end to end"
type: "chore"
ticket: "12"
created: "2026-11-20"
status: "built"
baseline_revision: "26c4d7e6f4f1afba62daf00e0bbfd7917cb8aff8"
route: "oneshot"
route_source: "auto"
risk: "high"
review: "none"
review_source: "auto"
lenses_ran: []
review_loop_iteration: 0
context: ["_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 5.1-5.11 each passed targeted tests, but epic Done-when requires trip lifecycle and packing to work through `/api/v1` in the production build, with no migrated callers left. No single run proves access, CSRF, replay, ETag, action retirement, API reference and feature-map completeness together.

**Approach:** Audit T1-T8 and the three Done-when lines against existing tests and ADRs; run the `api`, `trips`, `create-trip`, `new-trip`, `trip-tabs`, `trip-delete`, `trip-live-refresh`, `packing-tab`, `packing-lists`, `pull-templates` and `save-trip-as-template` features against the production build (the E2E runner already builds and runs `next start`); close only gaps the audit or run finds, tests first; then run `build-validator`. Branch `story/5-12-verify-trips-packing-api` from latest `feature/api-v1`; PR base `feature/api-v1`; return to `feature/api-v1` after the PR. No migrations, new env vars, new capability, `CHANGELOG.md`, full E2E, or push without authorization.

</frozen-after-approval>

## Implementation Notes

Oneshot: verification story whose fixes, if any, are small and found by running; a full plan cannot name them in advance. Pilot 1.10 procedure still applies, except `scripts/run-e2e.mjs` now builds `.next-e2e` and serves it with `next start`, so a normal affected/grep run is a production-server run.

Planned steps, in order:

1. Map each T1-T8 and Done-when 1-3 to a test or ADR; add a failing test first for any item with no evidence. Search retired export names (`togglePackingItem`, `updatePackingItem`, `addPackingItem`, `updateTripTransitMode`, trip/packing-list/template-pull actions) for remaining callers.
2. Run the eleven features by `@feat:` grep through `node scripts/run-e2e.mjs --server=kill`; record results here.
3. Targeted Vitest for touched files, then `build-validator`; record its result here.

## Review Triage Log

## Verification

**Commands:**

- `npx vitest run src/lib/services src/lib/api src/app/api scripts/feature-map.test.mjs "src/app/(app)/trips"` -- expected: pass
- `node scripts/run-e2e.mjs --server=kill "--grep=@feat:api|@feat:trips|@feat:create-trip|@feat:new-trip|@feat:trip-tabs|@feat:trip-delete|@feat:trip-live-refresh|@feat:packing-tab|@feat:packing-lists|@feat:pull-templates|@feat:save-trip-as-template"` -- expected: all pass
- `build-validator` -- expected: PASS

## Results

Branch `story/5-12-verify-trips-packing-api` from `feature/api-v1` at 26c4d7e6; PR base `feature/api-v1`; nothing pushed.

- Audit: `trips/actions.ts` exports only `saveTripListAsTemplate` and location search; `packing-actions.ts` only `saveTripListAsTemplate`. Retired actions (`togglePackingItem`, `updatePackingItem`, `addPackingItem`, `updateTripTransitMode`, `pullTemplatesOntoTrip`, packing list/section/order, trip create/edit/dates/delete) have no callers; remaining hits are service, contract, route and handler code calling `/api/v1`. No fix was needed, so no code changed.
- Targeted Vitest (services, `src/lib/api`, `src/app/api`, feature-map, trips pages): 114 files, 2065 tests pass.
- Production-build E2E (runner builds `.next-e2e`, serves `next start`) for api, trips, create-trip, new-trip, trip-tabs, trip-delete, trip-live-refresh, packing-tab, packing-lists, pull-templates, save-trip-as-template: 735 pass, 1 fail. The failure (packing-tab "New sections appear above existing sections…", second "New section…" input not found) passed 25/25 twice in isolation; deferred in `deferred-work.md` as an unreproduced load flake.
- build-validator: LINT PASS, TSC PASS, BUILD PASS, COVERAGE PASS (495 files, 8230 tests; lines 98.03%, functions 97.55%, branches 93.96%), E2E SKIPPED (docs-only change set).

## Review Triage Log

Review `none`: change set is docs only (plan and deferred-work entry).
