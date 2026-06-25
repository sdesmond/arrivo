## Deferred from: code review of 1-1-set-trip-budget-currency.md (2026-06-25)

- `Budget.currency` typed as plain `string` — no compile-time guard against unsupported codes — pre-existing pattern across entire codebase
- 150-item currency list serialized into every page JS bundle — pre-existing architectural concern, would need data-fetch pattern change
- save-as-template-dialog: unhandled onSave rejection — pre-existing, not in story scope
- save-as-template-dialog: rapid double-click before isSaving propagates — pre-existing, not in story scope
