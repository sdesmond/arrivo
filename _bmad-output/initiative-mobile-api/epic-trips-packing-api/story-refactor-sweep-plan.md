---
title: "Trips and packing refactor sweep"
type: "refactor"
ticket: "11"
created: "2026-11-20"
status: done
baseline_revision: "ed4728b627771e9a3e55d9ed2bdc4e252760554e"
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

**Problem:** Stories 5.1–5.10 retired the migrated trip/packing actions in-story, but their tests still mock retired exports (`addPackingItem`, `pullTemplatesOntoTrip`, `removePackingSection`, `createPackingList`, etc.), which hides dead references.

**Approach:** Remove only those stale mocks from `trips/actions.test.ts`, `use-packing-handlers.test.tsx` and `use-trip-detail-handlers.test.tsx`, and prove by search that no migrated-action callers remain. Keep `saveTripListAsTemplate` (packing-templates epic) and location search (locations-routing epic). Move no deferred functionality into cleanup.

</frozen-after-approval>

## Implementation Notes

Oneshot: mock-only test edits (<100 lines), no runtime change. Each removal traces to plans 5.1–5.10 (retire by export name). Investigation found `packing-actions.ts` exports only `saveTripListAsTemplate`, no `transit-actions.ts`, and no dead `feature-map.mjs` paths.

## Verification

**Commands:**

- `npx vitest run "src/app/(app)/trips"` -- expected: pass
- grep retired export names outside `src/lib/api/` -- expected: only contract-name usages, no action imports

## Review Triage Log

- low (fixed): `use-trip-detail-handlers.test.tsx` test title still named retired `pullTemplatesOntoTrip`; renamed to describe the pull-templates API.
