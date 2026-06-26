## Deferred from: code review of 1-1-set-trip-budget-currency.md (2026-06-25)

- `Budget.currency` typed as plain `string` — no compile-time guard against unsupported codes — pre-existing pattern across entire codebase
- 150-item currency list serialized into every page JS bundle — pre-existing architectural concern, would need data-fetch pattern change
- save-as-template-dialog: unhandled onSave rejection — pre-existing, not in story scope
- save-as-template-dialog: rapid double-click before isSaving propagates — pre-existing, not in story scope

## Deferred from: code review of 1-2-unified-cost-entry-on-events-reservations.md (2026-06-25)

- reservation-row spreads null values into Expense state before explicit overrides — ordering-dependent but currently correct due to explicit overrides
- TripEditBudget empty decimal point produces NaN — very low probability
- updateExpense eventId: undefined skips update vs null clears FK — matches documented convention

## Deferred from: code review of 1-3-currency-conversion-at-entry-time.md (2026-06-25)

- `getNow()`/`Date.now()` divergence risk — date comparison uses `getNow()` from mock-date while cache TTL uses `Date.now()`. If mock-date returns an offset, cache behavior is inconsistent. Low risk for current usage.
- `recalculate()` stub signature may change in Story 1.6 — current stub accepts `Expense[]` but will likely need trip/user lookup context for batch recalculation. Intentional placeholder.

## Deferred from: code review of 1-4-track-actual-spend-category-breakdown.md (2026-06-26)

- Currency label mismatch when expenses lack conversion data — pre-existing design constraint; spec explicitly falls back to raw amount for unconverted entries but label may show trip currency while sum is mixed.
- `convertedCurrencyTrip` first-match assumption with no consistency check — `resolveTripCurrency` picks first expense with truthy `convertedCurrencyTrip`; no `Set` size validation across all expenses. Low probability.
- `CategoryBreakdownEntry.count` computed but never surfaced in UI — harmlessly retained for future consumers.

## Deferred from: code review of 1-5-add-misc-expenses.md (2026-06-26)

- Effect setState cascade resets form fields when `defaultCurrency`/`defaultDate` change while modal open — intentional pattern, works for current use case.
- E2E only covers happy path (validation errors, conversion errors, server failures not covered) — follow-up item.
- `isOpen as boolean` type assertion on Dialog callback — minor defensive measure, matches Dialog API type.
- DB schema constraint for nullable eventId/reservationId not verified in diff — E2E run would catch if DB constraint still requires one non-null.
- `validateAmount` error message masks NaN/Infinity as "must be greater than 0" — minor DX improvement for future.
- Consider storing monetary values as cents (integers) instead of floating point — broad architectural refactor affecting all monetary fields across the codebase.
