---
title: "Recalculate expense conversions through the API"
type: feature
ticket: 7
created: "2026-11-25"
status: built
baseline_revision: "fc06219757c44a2e14e5597e5a6c9bf9dcfdc371"
route: full
route_source: auto
risk: medium
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: ["_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Budget recalculation still uses a server action and differs from trip currency updates, preventing API clients from using one consistent operation.

**Approach:** Expose recalculation through the versioned API and share the transactional conversion function with trip budget PATCH; migrate the budget UI.

## Boundaries & Constraints

**Always:** Branch `story/7-7-expense-recalculation`; PR base `feature/api-v1`. Follow initiative branch policy. Require editor access, lock and reauthorize within the transaction, use persisted trip budget currency for the endpoint, and preserve conversion precision, numeric mapping, profile conversions and existing UI feedback. Both paths produce identical trip conversion fields, including native-currency amounts at rate 1. Failures roll back every write and trip update. Retain existing API idempotency and write effects.

**Never:** No schema migration, unrelated expense changes, or changes to profile conversions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Error handling |
| --- | --- | --- | --- |
| Recalculate | Editor, mixed native and foreign expenses | Persist conversions against current trip currency; match trip PATCH | API success and refreshed budget |
| Unauthorized | Viewer or stranger | No writes | Existing API role errors |
| Failure | Rate lookup or database update fails | Entire transaction rolls back | Error returned; UI reports failure |
| No target currency | Trip has no budget currency | Preserve legacy stale-row check: no eligible rows succeeds without writes | Eligible rows fail without conversion writes |
| Empty trip | No expenses | Success without expense writes | No error |

</frozen-after-approval>

## Code Map

- `src/lib/services/trips.ts` `updateTrip` uses `recalculateAll` and writes native rows within `runTripWrite`; extract its batch logic for both callers. `src/lib/services/expense-conversions.ts` holds single-expense conversion and can host the shared transaction helper. `src/lib/currency.ts` supplies `recalculateAll`.
- `src/lib/services/trip-write.ts` supplies locking, replay and post-commit effects. Endpoint service must read `trips.budgetCurrency` under lock and recheck editor role inside the transaction.
- `src/app/(app)/trips/[tripId]/budget/actions.ts` and its test contain legacy behavior; transfer useful cases before deleting both.
- `src/lib/api/contract/expenses.ts` and adjacent `src/app/api/v1/trips/[tripId]/expenses/route.ts` establish contract and route conventions. `src/components/arrivo/trip-budget-tab.tsx` calls the action and owns loading/toasts.
- `tests/e2e/features/budget.feature`, `tests/e2e/steps/budget.steps.ts`, `tests/e2e/feature-map.mjs`, and `docs/api-v1.md` cover the flow, segmentation and API reference.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: extend `src/lib/services/expense-conversions.test.ts` and `src/lib/services/trips.test.ts` for mixed/native currency, identical endpoint and PATCH results, null target, no expenses, lookup failure and partial-write rollback; verify editor, viewer and stranger access and transactional reauthorization. Cover standalone recalculation in `expense-conversions.test.ts` as well.
- [x] Tests first: extend `src/lib/api/contract/expenses.test.ts`, add `src/app/api/v1/trips/[tripId]/expenses/recalculate/route.test.ts`, and update `src/components/arrivo/trip-budget-tab.test.tsx` for request, refresh, loading, success and failure; transfer relevant legacy action tests.
- [x] Update `tests/e2e/features/budget.feature` and `tests/e2e/steps/budget.steps.ts` with a scenario-owned trip: change currency, recalculate, await API response, reload, and verify converted amounts and total persist.
- [x] Add shared transaction-aware batch recalculation and standalone editor service in `src/lib/services/expense-conversions.ts`; update `src/lib/services/trips.ts` to use it. Ensure no partial writes, normalize native rows, and preserve unrelated fields.
- [x] Add strict empty-body POST contract and handler at `src/app/api/v1/trips/[tripId]/expenses/recalculate/route.ts`; update budget component to call `api()` and refresh. Delete legacy action and test after migration.
- [x] Update `tests/e2e/feature-map.mjs` for removed action paths and all changed/new service and route paths; document endpoint and response in `docs/api-v1.md`.

**Acceptance Criteria:**

- Given mixed currencies, when an editor recalculates via API or changes budget currency with conversion through PATCH, then persisted trip conversion fields agree, including native rows.
- Given an editor changing currency in Budget, when recalculation completes and the page reloads, then displayed conversions and totals remain correct.
- Given a failed conversion or update, when either operation fails, then all affected expense and trip writes roll back.
- Given a viewer or nonmember, when recalculation is requested, then access is denied and nothing changes.

## Implementation Notes

Plan review: scope, architecture, component (231 lines), accessibility and test coverage checked; no blocking findings.

## Plan Change Log

## Review Triage Log

- Blind: historical rates are refetched — medium, intentional shared all-row parity required by approved plan; retained behavior.
- Blind: first-write failure does not prove partial rollback — medium; E2E replay-record failure verifies rollback after writes.
- Blind: direct POST/PATCH parity missing — medium; patched with mixed-currency E2E comparison.
- Blind: null-target stale behavior mocked — medium; patched with actual stale filtering tests.
- Blind: successful replay effects untested — low; shared idempotency infrastructure covers replay and authorization; no new replay implementation.
- Blind: stranger, invalid body, lookup failure lack HTTP coverage — low; service authorization, contract validation, and route infrastructure cover these separately.
- Blind: loading and failure recovery untested — medium; patched component tests.
- Verification: freshness timestamp and stale indicator untested — medium; patched service and E2E tests.
- Edge case: no findings.
- Intent alignment: shared transactional conversion interpretation matches explicit ticket and approved plan; parity verified by added E2E.

## Verification

**Commands:**

- Run targeted Vitest files named above plus `src/lib/api/api-reference.test.ts` and `scripts/feature-map.test.mjs` before broad validation.
- Run affected budget E2E when practical, then invoke `build-validator` once after targeted tests pass; record lint, typecheck, build, coverage and affected E2E results.


Validation: lint PASS (7 warnings), TypeScript PASS after generated-types race rerun, build PASS, coverage PASS (8437 tests; lines 98.19%, functions 97.69%, branches 94.26%), affected E2E PASS (894 scenarios).
