---
title: "Create expenses through the API"
type: feature
ticket: 2
created: "2026-11-24"
status: done
baseline_revision: "4d9dff7cfd219a5402ac40c7c51aae09d9185c98"
route: full
route_source: auto
risk: high
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: ["_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Misc expense creation still uses a server action, so mobile clients lack the shared API, safe retries and the partial-conversion signal.

**Approach:** Expose trip expense GET and POST through an authorized service, share conversion logic with the remaining actions, and switch the Add Misc Expense modal to the API. Move the budget E2E into `budget.feature`.

## Boundaries & Constraints

**Always:** Require a client UUID; support idempotency keys and safe same-ID replay. Preserve amount/category/note/date validation, one-link rule checked in-trip, dual conversion that saves on lookup failure and returns `conversionError`, `toString` on write, `dbExpenseToType` on read, `recordTripUpdated` parity and modal behavior. Branch `story/7-2-create-expenses-api`; PR base `feature/api-v1` (verify before opening; return to integration branch after; pull before the next story).

**Never:** Migrate expense update/delete, recalculation, or the place-row/reservation-row create callers (later stories); keep their server actions working. No migration. Do not change server-rendered reads.

## I/O & Edge-Case Matrix

| Scenario     | Input / State                                        | Expected behavior                                                                  | Error handling                                             |
| ------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Create       | Editor, valid UUID, amount, category, currency, date | One mapped expense, converted to trip and profile currency; activity recorded once | Validation errors use API envelope (422)                   |
| Link         | `eventId` or `reservationId` in this trip            | Linked expense saved                                                               | Both set, or target missing/in another trip: 422, no write |
| Rate failure | Conversion lookup throws                             | Expense saved unconverted; response carries `conversionError: true`                | None                                                       |
| Replay       | Same UUID and content, or idempotency-key retry      | Same expense; no duplicate row or activity                                         | Different content: 409; foreign resource concealed (404)   |
| Deleted      | UUID deleted within retention window                 | No recreation                                                                      | 409                                                        |
| Access       | Viewer writes or reads; nonmember                    | No mutation or leak                                                                | 403 viewer, 404 nonmember                                  |
| Read         | Editor/manager lists                                 | Mapped trip expenses                                                               | 403 viewer, 404 nonmember                                  |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/[tripId]/budget/actions.ts` -- `computeConversions`, validators, `assertLinkTargetsInTrip`, `createExpense`; `updateExpense`/`deleteExpense`/`recalculateConversions` stay. Extract conversion + `ConversionFields` to a shared lib module; `deleteExpense` must record the deletion in a transaction.
- `src/lib/services/reservations.ts` + `src/lib/api/contract/reservations.ts` -- template: `lockClientIds`, `lockTrip`, `runTripWrite`, `validateReplay`, `refuseRecentlyDeleted`, content-compare conflict. `src/app/api/v1/trips/[tripId]/reservations/route.ts` shows `apiRoute` GET/POST wiring.
- `src/lib/services/deletion-records.ts` -- add `expense` kind and message.
- `src/lib/validation-limits.ts` -- `MAX_EXPENSE_AMOUNT`, `FIELD_LIMITS.expenseNote`, `isValidIsoDate`; `src/data/types.ts` `ExpenseCategory`, `Expense`; `dbExpenseToType` in `db-mappers.ts`.
- `src/components/arrivo/trip-add-expense-modal.tsx` -- create caller; mirror `reservation-edit-drawer.tsx` attempt-id/`api()`/409 handling. Update/delete stay on actions.
- `tests/e2e/features/trips.feature` (Misc Expense scenario, line ~53) and `tests/e2e/steps/trips.steps.ts` (lines ~124-150 steps); `tests/e2e/feature-map.mjs` `trips` entry holds budget mappings. `docs/api-v1.md` Reservations section is the doc model.

## Tasks & Acceptance

**Execution:**

- [ ] Tests first: `src/lib/services/expenses.test.ts`, `src/lib/services/expense-conversions.test.ts`, `src/lib/api/contract/expenses.test.ts`, `src/app/api/v1/trips/[tripId]/expenses/route.test.ts`, `src/lib/services/deletion-records.test.ts`, `src/app/(app)/trips/[tripId]/budget/actions.test.ts`, `src/components/arrivo/trip-add-expense-modal.test.tsx` -- cover matrix: replay, foreign-trip link, failed rate lookup, deleted id, access, conversionError toast, stable id across retries.
- [ ] `src/lib/services/expense-conversions.ts` (+ test) -- move `computeConversions`; actions import it.
- [ ] `src/lib/services/deletion-records.ts` -- add `expense` kind; `budget/actions.ts` `deleteExpense` -- delete + `recordDeletion` in one transaction.
- [ ] `src/lib/api/contract/expenses.ts` -- `listExpenses`, `createExpense` (strict body: `id`, category enum, amount >0, <=50000, max 2 decimals, currency, ISO date, note limit, optional single link).
- [ ] `src/lib/services/expenses.ts` -- list (editor+); create under client-id and trip locks: in-transaction role recheck, replay compare, deleted refusal, in-trip link check (422), conversions, insert with `amount.toString()`, `markChanged`; return `Expense & { conversionError?: true }`.
- [ ] `src/app/api/v1/trips/[tripId]/expenses/route.ts` -- GET + idempotent POST via `apiRoute`; remove only the modal's use of the old `createExpense` call (keep the action for row callers).
- [ ] `src/components/arrivo/trip-add-expense-modal.tsx` -- create via `api(createExpense)` with stable attempt id; `router.refresh()`; toast on `conversionError`; keep validation, focus and close behavior.
- [ ] `tests/e2e/features/budget.feature` (`@feat:budget`) + `tests/e2e/steps/budget.steps.ts` -- move Misc Expense scenario and its steps from trips; await the POST, reload, assert persisted. `tests/e2e/feature-map.mjs` -- add `budget` entry with budget component mappings moved from `trips`, plus new service, contract, route files.
- [ ] `docs/api-v1.md` -- document both endpoints, `conversionError`, errors, idempotency; run API-reference parity test.

**Acceptance Criteria:**

- Given an editor, when a Misc expense is added in the Budget tab and the page reloads, then it persists with its category and converted totals.
- Given a failed rate lookup, when an expense is created, then it is saved unconverted and the response flags `conversionError`.
- Given a retry with the same UUID and content, then one row exists and activity is recorded once.
- Given a deleted id, a link into another trip, or insufficient access, when creating, then the request fails per the matrix and nothing is written.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| conversionError toast says "try again" but retry replays stored row unconverted, modal stays open | medium | patch | modal returns without clearing attempt; replay returns stored row with no flag |
| Amount 1e-9 passes `>0` and 1e-6 cent tolerance, stores "1e-9" (rounds to 0.00) | medium | patch | contract `hasAtMostTwoDecimals`; no minimum |
| Currency accepts any 1-10 chars, never converts | medium | patch | `isSupportedCurrencyCode` exists in `src/lib/currencies.ts` |
| List ordered by random UUID | medium | patch | `orderBy(expenses.id)` in `expenses.ts` |
| Rate fetch inside transaction holding trip lock, no timeout | medium | patch | `fetchRates` in `src/lib/currency.ts` calls `fetch(url)` with no signal; bound it so failure takes the saved-unconverted path |
| `budget/actions.ts` not in `budget` feature-map entry | low | patch | modal still uses update/delete actions; one-line map add |
| 408/409/429 retry-id retention untested | medium | patch | modal tests cover only status 0 and 422 |
| 409 keeps attempt id, stuck on deleted id | low | reject | modal mints a random UUID; collision with a deleted id is unreachable; different-payload 409 cannot occur |
| Edits after failed save discarded with info toast | low | reject | mirrors `reservation-edit-drawer.tsx` convention deliberately |
| Replay after link target deleted gives 409 | low | reject | rare; fix adds a branch |
| Date refine message "Date is required." for invalid date | low | reject | preserves old action message |
| Route/service tests mock the stack, no HTTP-level test | low | reject | same pattern as reservations |
| E2E asserts no converted total | false | reject | "Actual spent" is derived from the converted fields |
| `app-activity.steps.ts` retry loop is flake workaround | false | reject | waits on the new API POST and refresh; not an ordering or serial fix |
| Cascade deletes not recorded as deletion records | low | defer | pre-existing behavior for other kinds |
| place-row / reservation-row still use old action | low | reject | intent excludes them (later stories) |
| Old action duplicates validation | low | reject | intent keeps the action working |
| `.gitattributes` / `.editorconfig` in diff | false | reject | line-ending fix requested by the user; separate commit |

## Design Notes

Conversion runs inside `mutate` after the replay and deleted checks, so replays skip the network call. A same-ID replay returns the stored expense without `conversionError`; an idempotency-key replay returns the original response, flag included. Viewers get no expenses on GET (matches reservation list and trip bundle).

Define the response type (`Expense & { conversionError?: true }`) in `src/data/types.ts`, not locally.

## Verification

**Commands:**

- `npx vitest run` on the files named above, plus `src/lib/api/api-reference.test.ts` and `scripts/feature-map.test.mjs` -- expected: pass.
- `npm run test:e2e:affected`, then `build-validator` -- expected: lint, typecheck, build, coverage, affected E2E pass; record the validator result here.
