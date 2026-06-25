## Deferred from: code review of 1-1-set-trip-budget-currency.md (2026-06-25)

- `Budget.currency` typed as plain `string` — no compile-time guard against unsupported codes — pre-existing pattern across entire codebase
- 150-item currency list serialized into every page JS bundle — pre-existing architectural concern, would need data-fetch pattern change
- save-as-template-dialog: unhandled onSave rejection — pre-existing, not in story scope
- save-as-template-dialog: rapid double-click before isSaving propagates — pre-existing, not in story scope

## Deferred from: code review of 1-2-unified-cost-entry-on-events-reservations.md (2026-06-25)

- reservation-row spreads null values into Expense state before explicit overrides — ordering-dependent but currently correct due to explicit overrides
- TripEditBudget empty decimal point produces NaN — very low probability
- updateExpense eventId: undefined skips update vs null clears FK — matches documented convention
