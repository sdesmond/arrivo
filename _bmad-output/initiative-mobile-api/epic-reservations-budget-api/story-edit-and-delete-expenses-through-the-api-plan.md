---
title: "Edit and delete expenses through the API"
type: feature
ticket: 5
created: "2026-11-25"
status: done
baseline_revision: "9ff280ace5dbdb3aa3d7457d951959dea5d8d66c"
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

**Problem:** Expense edit and delete in the Edit Misc Expense modal still use server actions, so mobile clients cannot patch or delete expenses, and expenses cascaded by event, date-narrowing or day deletion can be recreated by a retry.

**Approach:** Expose `PATCH /api/v1/expenses/:expenseId` (partial, recompute conversions only when amount, currency or date change) and `DELETE` through an authorized service, record cascaded expense deletions (see Decision), and switch the modal's update and delete calls.

## Boundaries & Constraints

**Always:** Preserve `toString` on write, `dbExpenseToType` on read, one-link rule checked in-trip on the merged result, conversion that saves unconverted and returns `conversionError`, `recordTripUpdated` parity, modal behavior. Trip lock plus in-transaction editor recheck; foreign or missing expense concealed (404). Branch `story/7-5-edit-delete-expenses-api`; PR base `feature/api-v1` (verify before opening; return to integration branch after; pull before the next story).

**Decision:** Record event-cascaded expense ids in all three delete paths: `events.ts`, `trip-date-change.ts` (`delete-events`) and `days.ts` (day deletion with events), each before the cascade in the same transaction.

**Never:** Migrate `place-row.tsx` / `reservation-cost-chip.tsx` callers or recalculation (later stories); keep `updateExpense`/`deleteExpense` actions for them. No migration. Do not change date-pruning or day-deletion behavior beyond recording ids.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Error handling |
| --- | --- | --- | --- |
| Note-only edit | Patch `{note}` | Row updated, stored conversion kept, no rate lookup | None |
| Amount/currency/date edit | Value differs from stored | Conversions recomputed; failure saves unconverted with `conversionError: true` | None |
| Unchanged patch | Same values or `{}` | Stored row returned, nothing written | None |
| Relink | `eventId`/`reservationId` in this trip; `null` clears | Link saved | Foreign/missing target or both links on result: 422, no write |
| Delete | Editor, existing expense | 204; row gone, deletion recorded, activity once | None |
| Delete retry | Expense absent | 204, no effects | None |
| Replay | Create with id deleted directly or cascaded by event, date-narrowing or day deletion | No recreation | 409 |
| Access | Viewer; nonmember; role revoked under lock | No mutation | 403 viewer, 404 concealed |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/[tripId]/budget/actions.ts` -- `updateExpense` (patch semantics, `conversionAffected`) and `deleteExpense` are the behavior to port; actions stay for the other callers.
- `src/lib/services/expenses.ts` -- add `updateExpense`, `deleteExpense`; link checks from `createExpense`. `src/lib/services/reservations.ts` `updateReservation`/`deleteReservation` are the patterns (`changedKeys`/`sameValue`, absent-row 204, tripGone handling). `expense-conversions.ts` `computeConversions` takes the transaction.
- `src/lib/api/contract/expenses.ts` -- add `updateExpense` (strict partial; reuse create's field schemas) and `deleteExpense` (`status: 204`, body `{}`); `hasAtMostTwoDecimals` is local. Create a new route `src/app/api/v1/expenses/[expenseId]/route.ts` modeled on `src/app/api/v1/reservations/[reservationId]/route.ts`.
- `src/lib/services/trip-date-change.ts` (~line 328, `DeleteEvents` branch; reservation expenses already recorded) and `src/lib/services/days.ts` (~line 256) -- same cascade, same fix.
- `src/lib/services/events.ts:deleteEvent` -- DB cascades expenses via `expenses.eventId`; select linked ids before the delete and `recordDeletions(..., "expense")`.
- `src/components/arrivo/trip-add-expense-modal.tsx` -- `handleSave` edit branch (line ~150) and `handleRemove` (~195); create branch already uses `api()`. Old edit sent `note: undefined` when cleared, which kept the note; send `null` so clearing works.
- `tests/e2e/features/budget.feature`, `tests/e2e/steps/budget.steps.ts` (create step waits on POST); `tests/e2e/feature-map.mjs` `budget` entry; `docs/api-v1.md` Expenses section (line ~274).

## Tasks & Acceptance

**Execution:**

- [ ] Tests first: `src/lib/services/expenses.test.ts`, `src/lib/api/contract/expenses.test.ts`, `src/app/api/v1/expenses/[expenseId]/route.test.ts`, `src/lib/services/events.test.ts`, `src/lib/services/trip-date-change.test.ts`, `src/lib/services/days.test.ts`, `src/components/arrivo/trip-add-expense-modal.test.tsx` -- matrix: note-only keeps conversion, amount recomputes, rate failure, foreign relink, both links, unchanged patch, absent delete, role revoked, event/date-narrowing/day cascade then create replay 409; keep-as-unscheduled records nothing, deleted then create replay 409, modal edit/delete via API with refresh.
- [ ] `src/lib/api/contract/expenses.ts` -- add `updateExpense` (PATCH, nullable note and links, currency supported) and `deleteExpense`.
- [ ] `src/lib/services/expenses.ts` -- `updateExpense` under trip lock with role recheck, merged-link check, conversions only on changed amount/currency/date, `updatedAt` via `getNow()`, `markChanged`; `deleteExpense` deletes, `recordDeletion`, `markChanged`; both resolve the trip from the row.
- [ ] `src/app/api/v1/expenses/[expenseId]/route.ts` -- PATCH (idempotent) and DELETE via `apiRoute`.
- [ ] `src/lib/services/events.ts`, `src/lib/services/trip-date-change.ts`, `src/lib/services/days.ts` -- select expenses linked to the events being deleted (`expenses.eventId`) and `recordDeletions(..., "expense")` before the cascade, in the existing transaction; `days.ts` cascades through `events.dayId` (confirmed), so select expenses of the day's events.
- [ ] `src/components/arrivo/trip-add-expense-modal.tsx` -- edit via `api(updateExpense)`, delete via `api(deleteExpense)`, `router.refresh()`, keep conversionError toast and close behavior; drop the action imports.
- [ ] `tests/e2e/features/budget.feature` + `tests/e2e/steps/budget.steps.ts` -- scenarios to edit then reload and delete then reload; await the PATCH/DELETE response. `tests/e2e/feature-map.mjs` -- add `src/app/api/v1/expenses/**` to `budget`.
- [ ] `docs/api-v1.md` -- document PATCH and DELETE; run `api-reference.test.ts`.

**Acceptance Criteria:**

- Given an editor, when an expense is edited and the page reloads, then the change persists and a note-only edit keeps its converted totals.
- Given an editor, when an expense is deleted and the page reloads, then it is gone; a repeated DELETE returns 204.
- Given an expense deleted directly or by event deletion, when its create is replayed within retention, then it returns 409 and nothing is written.
- Given a viewer, nonmember, foreign relink or revoked role, when patching or deleting, then nothing is written.

## Implementation Notes

Plan review: scope, architecture, component, accessibility, test coverage pass; 0 blocking. Warning: `trip-add-expense-modal.tsx` is 285 lines (about 80 of JSX); only the two handlers change, no split needed.

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| PATCH role revoked under lock returns 403, not concealed 404 | medium | patch (fixed) | `updateExpense` recheck now maps `TripForbiddenError` to `TripNotFoundError`, as `deleteExpense` does. |
| Cascade tests do not assert expense select precedes delete | medium | patch (fixed) | events/days/trip-date-change tests now assert ordering. |
| Failed-conversion expense cannot be retried by identical re-save | low | defer | Matrix row "Unchanged patch" mandates a no-op; plan decision. |
| Retained server-action `deleteExpense` records no deletion | medium | defer | Plan Never: place-row/cost-chip callers migrate in a later story. |
| E2E delete asserts only no "Food" tile | low | reject | Row-level persistence also asserted after reload; fix would add branches. |
| docs/api-v1.md corrupted bytes | false | reject | grep finds no U+FFFD; separators match existing entries. |
| Empty `recordDeletions` throws | false | reject | `recordDeletions` returns early on an empty list. |
| DELETE existence oracle (204 vs 404) | false | reject | Matrix mandates 204 on absent row; same pattern as reservations. |
| Rate lookup inside trip lock | false | reject | Same as `createExpense`; pre-existing pattern. |
| Idempotency key shared across expense ids | false | reject | Same payload shape as `updateReservation`; key scoped by request. |
| Note trim vs max(500); modal mock aliasing; `expensePath` undefined; DELETE body docs | low | reject | Cosmetic; fixes add complexity. |
| Reservation cascade not recorded | false | reject | `reservations.ts` already records expenses. |

## Design Notes

Compare patch fields to the stored row (as `updateReservation` does) so an unchanged amount, currency or date triggers no rate lookup. The stored amount is a string: compare as numbers. Currency is trimmed and uppercased (the old action only trimmed). The `ExpenseWithConversionFlag` type already exists in `src/data/types.ts`.

## Verification

**Commands:**

- `npx vitest run` on the files named above, plus `src/lib/api/api-reference.test.ts` and `scripts/feature-map.test.mjs` -- expected: pass.
- `npm run test:e2e:affected`, then `build-validator` -- expected: lint, typecheck, build, coverage, affected E2E pass; validator PASS: lint, tsc, build, coverage (8439 tests; lines 98.17%, branches 94.18%), affected E2E 878 passed.
