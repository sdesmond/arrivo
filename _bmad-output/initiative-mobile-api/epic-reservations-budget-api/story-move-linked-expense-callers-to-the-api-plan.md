---
title: "Move linked-expense callers to the API"
type: feature
ticket: 6
created: "2026-11-25"
status: built
baseline_revision: "893c6942848be989b5e4b9b8b3898398070bd544"
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

**Problem:** Reservation-row and place-row costs still create, update and delete their linked expense through budget server actions, so those writes skip the API's replay protection and mobile parity.

**Approach:** Switch `reservation-cost-chip.tsx` and `place-row.tsx` to the expense endpoints with the link set (`reservationId` / `eventId`), then delete the `createExpense`, `updateExpense` and `deleteExpense` actions so `recalculateConversions` is the only budget server action.

## Boundaries & Constraints

**Always:** Branch `story/7-6-move-linked-expense-callers-to-the-api`; PR base `feature/api-v1` (verify before opening; return to integration branch after). Keep current UI behavior: local expense mirroring, "Couldn't convert currency — try again." toast on `conversionError`, `router.refresh()` so rows and Budget stay in sync. One client UUID per create attempt (`createRandomId`). Send `note ?? null` on update so a cleared note clears. Never forward `converted*` fields (strict body).

**Never:** No endpoint, contract, service or migration change. Do not touch `recalculateConversions` or `trip-budget-tab.tsx` behavior. Do not change the cost dialog UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Error handling |
| --- | --- | --- | --- |
| Add cost | Reservation/place with none | POST with link id; chip/row shows cost; Budget total matches after reload | `ApiClientError` toast, state unchanged |
| Edit cost | Existing linked expense | PATCH with all dialog fields, `note ?? null` | `conversionError` toast; saved unconverted |
| Remove cost | Existing linked expense | DELETE; cost cleared; Budget total drops after reload | `ApiClientError` toast, cost kept |
| Place without trip id | `place.tripId` missing | Create refused as today | Existing guard kept |

</frozen-after-approval>

## Code Map

- `src/components/arrivo/reservation-cost-chip.tsx` -- `handleExpenseSave` (L35-77), `handleExpenseRemove` (L79-91); import at L7 replaced.
- `src/components/arrivo/place-row.tsx` -- `handleExpenseSave` (L151-200), `handleExpenseRemove` (L202-214); import at L6 replaced; needs `place.tripId` for create.
- `src/components/arrivo/trip-add-expense-modal.tsx` -- reference for `api(createExpense|updateExpense|deleteExpense, {params, body})` (L151, L161, L199).
- `src/lib/api/client.ts`, `src/lib/api/contract/expenses.ts` -- reuse as is.
- `src/app/(app)/trips/[tripId]/budget/actions.ts` -- delete create/update/delete, validators, `assertLinkTargetsInTrip`, unused imports; keep `recalculateConversions` (used by `trip-budget-tab.tsx` L15). Check `UpdateExpensePatch`/`CreateExpenseInput` in `src/data/types.ts` for dead use.
- Tests to update: `reservation-cost-chip.test.tsx`, `place-row.test.tsx`, `reservation-row.test.tsx` (L8-10, L29 mock), `trip-budget-tab.test.tsx`, `budget/actions.test.ts`.
- `tests/e2e/features/reservations.feature` + `steps/reservations.steps.ts`; `day-planning.feature` + `steps/day-planning.steps.ts`; reuse `budget.steps.ts` (open Budget tab, Actual spent). `tests/e2e/feature-map.mjs` entries `reservations`, `day-planning`.
- `docs/api-v1.md` Expenses section (L274-302).

## Tasks & Acceptance

**Execution:**

- [ ] Tests first: `reservation-cost-chip.test.tsx`, `place-row.test.tsx`, `reservation-row.test.tsx`, `trip-budget-tab.test.tsx` -- mock `@/lib/api/client` (pattern of `trip-add-expense-modal.test.tsx`); cover create/update/delete bodies and params, cleared note sends `null`, `conversionError` toast, `ApiClientError` path; `budget/actions.test.ts` -- keep recalculate cases only.
- [ ] `tests/e2e/features/reservations.feature` + steps -- scenario: add, edit, remove a reservation cost; reload; Budget tab totals match; arm `waitForApiResponse` (`tests/e2e/api-response.ts`, as `budget.steps.ts` does) before each POST/PATCH/DELETE gesture and await it before reloading.
- [ ] `tests/e2e/features/day-planning.feature` + steps -- same scenario for a place cost.
- [ ] `src/components/arrivo/reservation-cost-chip.tsx`, `src/components/arrivo/place-row.tsx` -- call `api()`, add `router.refresh()`, preserve toasts and local mirroring.
- [ ] `src/app/(app)/trips/[tripId]/budget/actions.ts` -- remove three actions and dead helpers/imports; prune dead types.
- [ ] `tests/e2e/feature-map.mjs` -- register `reservation-cost-chip.tsx`, `cost-dialog.tsx`, expense contract/service under `reservations` and `day-planning` where missing; run `scripts/feature-map.test.mjs`.
- [ ] `docs/api-v1.md` -- one-line note that web reservation and place rows use the expense endpoints; run `api-reference.test.ts`.

**Acceptance Criteria:**

- Given a reservation or place, when a cost is added, edited and removed with a reload after each, then the Budget tab Actual spent matches.
- Given the web app, when `src/` is searched, then only `recalculateConversions` is imported from the budget actions module.
- Given a failed API call, when saving or removing a cost, then a toast shows and the displayed cost is unchanged.

## Implementation Notes

Plan review: scope, architecture, accessibility, test coverage pass; 0 blocking. Warning: `place-row.tsx` is 402 lines (already over the 250 guideline); only the two expense handlers change, so no split here.

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Refresh hook stalls shared queue when called after unmount | medium | patch | waiter added post-cleanup never resolved, coordinator `running` stuck. Fixed with a mounted guard + test. |
| Hook tests don't observe ordering/unmount release | medium | patch | Strengthened unmount test, added after-unmount queue test. |
| 408/409/429/500 retry-id rule untested | medium | patch | Added `it.each` cases in chip and place-row tests. |
| `tripId: tripId` churn | low | patch | Shorthand restored. |
| Note not trimmed to null | false | rejected | `cost-dialog.tsx:128` already trims to undefined. |
| Removed validation tests lost coverage | false | rejected | `expenses.test.ts` / `contract/expenses.test.ts` cover link-in-other-trip, 50000 cap, decimals. |
| `cost-dialog.tsx` not mapped to day-planning | false | rejected | Mapped at feature-map.mjs L611. |
| Delete of already-deleted expense toasts 404 | low | rejected | Rare (two tabs/double-click); fix adds branching. |
| New id when body edited after timed-out create | low | rejected | Matches plan "one UUID per create attempt"; same-id replay with a changed body would 409 anyway. |
| Duplicated definitive-4xx helper, `useCallback`, E2E `body` locator and missing-id guard, converted* dead fields | low | rejected | Cosmetic or test-only; fixes add complexity. |
| Intent alignment | n/a | none | Narrow reading implemented; no divergence. |

## Design Notes

Create sends `{...input, id, reservationId}` or `{...input, id, eventId: place.id}`; update sends the same fields without `id` plus `note ?? null`.

## Verification

**Commands:**

- `npx vitest run` on the files above, plus `src/lib/api/api-reference.test.ts` and `scripts/feature-map.test.mjs` -- expected: pass.
- `npm run test:e2e:affected`, then `build-validator` -- expected: lint, typecheck, build, coverage, affected E2E pass.
