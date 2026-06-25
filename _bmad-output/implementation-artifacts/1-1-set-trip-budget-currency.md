# Story 1.1: Set Trip Budget & Currency

Status: ready-for-dev

## Story

As a trip owner/editor,
I want to set a budget total and currency on my trip,
so that I have a fixed comparison target for tracking my actual spend.

## Acceptance Criteria

1. **Currency dropdown in TripEditBudget** — Currency field is a dropdown of ISO currency codes (code swatch + currency name + ISO code, ~150 currencies, no search field) using the new shared `CurrencyPicker` component. Selecting a currency highlights it via `accent-soft` background (no checkmark). (UX-DR7)

2. **Budget persistence** — Entering a budget total and saving persists the trip's `budgetTotal` and `budgetCurrency` fields. Every amount on this trip's Budget tab displays in this Trip Currency, regardless of profile currency preference. (FR1, FR2)

3. **No-budget-set state** — When a trip has no budget, the Budget tab shows a "Set a budget" inline prompt linking to `TripEditBudget`, with no progress bar, badge, or Remaining figure. (UX-DR13 no-budget-set state)

4. **Currency picker keyboard operability** — Tab order: amount → currency trigger → save. Pressing Esc closes the picker without changing selection; focus returns to currency trigger. (NFR3)

5. **Budget tab in navigation** — "Budget" tab appears in the trip detail tab bar, rendered by `TripDetailTabBody` as `TripBudgetTab` component.

6. **Budget.perPerson removed** — `Budget` interface drops `perPerson`. `TripEditBudget` no longer renders a Per Person input. `TripEditSheet` removes `budgetPerPerson` from save patches.

## Tasks

- [ ] Add `Budget` entry to `TripDetailTab` enum in `src/data/types.ts` (AC: 5)
- [ ] Remove `perPerson` from `Budget` interface in `src/data/types.ts` (AC: 6)
- [ ] Build `CurrencyPicker` shared component in `src/components/packt/currency-picker.tsx` (AC: 1, 4)
- [ ] Build `CurrencyPicker` tests in `src/components/packt/currency-picker.test.tsx`
- [ ] Redesign `TripEditBudget` in `src/components/packt/trip-edit-budget.tsx` (AC: 1, 6)
- [ ] Update `TripEditBudget` tests in `src/components/packt/trip-edit-budget.test.tsx`
- [ ] Build `TripBudgetTab` shell in `src/components/packt/trip-budget-tab.tsx` (AC: 3)
- [ ] Build `TripBudgetTab` tests in `src/components/packt/trip-budget-tab.test.tsx`
- [ ] Add Budget tab to `TABS` in `src/app/(app)/trips/[tripId]/page-client.tsx` (AC: 5)
- [ ] Add Budget to `resolveTripDetailTab` in `trip-detail-tabs.ts` (AC: 5)
- [ ] Add Budget tab rendering to `TripDetailTabBody` in `trip-detail-tab-body.tsx` (AC: 5)
- [ ] Update `TripEditSheet` to remove `budgetPerPerson` handling, wire new `TripEditBudget` props (AC: 6)
- [ ] Update `TripEditSheet` tests

## Dev Notes

### Source tree components to touch

| File | Action | Why |
|------|--------|-----|
| `src/data/types.ts` | MODIFY | Add `Budget` to `TripDetailTab`; remove `perPerson` from `Budget`, `UpdateTripPatch`, and `CreateTripInput` |
| `src/components/packt/currency-picker.tsx` | NEW | Shared currency picker overlay (~150 currencies) |
| `src/components/packt/currency-picker.test.tsx` | NEW | Tests for `CurrencyPicker` |
| `src/components/packt/trip-edit-budget.tsx` | MODIFY | Replace free-text currency input with `CurrencyPicker`; remove perPerson field |
| `src/components/packt/trip-edit-budget.test.tsx` | MODIFY | Remove perPerson tests, add currency-picker interaction tests |
| `src/components/packt/trip-budget-tab.tsx` | NEW | Budget tab shell with no-budget-set prompt |
| `src/components/packt/trip-budget-tab.test.tsx` | NEW | Tests for no-budget state |
| `src/components/packt/trip-edit-sheet.tsx` | MODIFY | Remove `budgetPerPerson`, wire new `TripEditBudget` props |
| `src/components/packt/trip-edit-sheet.test.tsx` | MODIFY | Remove perPerson test cases |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | MODIFY | Add Budget to `TABS` array, pass expenses (empty for now) |
| `src/app/(app)/trips/[tripId]/trip-detail-tabs.ts` | MODIFY | Add `Budget` to `resolveTripDetailTab` switch |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | MODIFY | Add budget tab rendering branch |

### Architecture compliance

- All `TripDetailTab` values are const-object enum members in `src/data/types.ts` — add using existing pattern: `Budget: "budget"`
- `resolveTripDetailTab()` in `trip-detail-tabs.ts` must include the new `Budget` case; default remains `Itinerary`
- The Budget tab label in `TABS` uses the existing pattern: `{ id: TripDetailTab.Budget, label: "Budget" }`
- `TripEditBudget` uses the existing `Section`/`Field` pattern from `form-section.tsx`
- No new validation library (zod) — inline validation matching existing conventions
- Colors via CSS custom properties only — no hardcoded hex/rgb
- Font variable fallbacks required: `var(--font-body, ui-sans-serif)`
- Lucide icons: `strokeWidth={1.5}` always

### Testing standards

- Unit tests colocated: `currency-picker.test.tsx`, `trip-edit-budget.test.tsx` (modified), `trip-budget-tab.test.tsx`
- No E2E needed for this story — the Budget tab is covered as part of the full `budget.feature` in later stories when all interactions exist
- Coverage must maintain ≥95% lines/functions, ≥90% branches across `src/components/packt/**`
- `TripBudgetTab` test: verify "Set a budget" prompt renders when `budget` is undefined, not rendered when budget exists (skeletal, full interaction tests come in later stories)
- `TripEditBudget` test: verify currency options appear in picker, selection highlights, picker closes on Esc, perPerson removed
- `CurrencyPicker` test: verify ~150 currencies rendered, `accent-soft` highlight on selected, click selects, Esc closes, focus returns to trigger
- Mock `next/navigation` via global mocks in `vitest.setup.mts` — do not re-mock per file

### CurrencyPicker keyboard & ARIA requirements (NFR3)

- Trigger button: `aria-haspopup="listbox"`, `aria-expanded` (dynamically reflects picker state)
- Open via keyboard: Enter or Space on trigger opens the picker and moves focus to the selected item (or first item if none selected)
- Picker container: `role="listbox"`, each option `role="option"` with `aria-selected` reflecting current selection
- Dismiss: Esc closes picker, focus returns to trigger
- Selection: Enter or click on an option selects it, closes picker, focus returns to trigger
- Arrow keys: navigate options within the listbox

### Currency list

~150 ISO currency codes with name + code swatch. Use a static data array matching the shape:
```ts
interface CurrencyOption {
  code: string;       // e.g. "USD" — displayed as the code swatch
  name: string;       // e.g. "US Dollar"
}
```
Source: ISO 4217 currency list. No API call — this is static data. Included currencies: all commonly-used ~150 codes (AED, AFN, ALL, AMD, ANG, AOA, ARS, AUD, AWG, AZN, BAM, BBD, BDT, BGN, BHD, BIF, BMD, BND, BOB, BOV, BRL, BSD, BTN, BWP, BYN, BZD, CAD, CDF, CHE, CHF, CHW, CLF, CLP, CNY, COP, COU, CRC, CUC, CUP, CVE, CZK, DJF, DKK, DOP, DZD, EGP, ERN, ETB, EUR, FJD, FKP, GBP, GEL, GHS, GIP, GMD, GNF, GTQ, GYD, HKD, HNL, HTG, HUF, IDR, ILS, INR, IQD, IRR, ISK, JMD, JOD, JPY, KES, KGS, KHR, KMF, KPW, KRW, KWD, KYD, KZT, LAK, LBP, LKR, LRD, LSL, LYD, MAD, MDL, MGA, MKD, MMK, MNT, MOP, MRU, MUR, MVR, MWK, MXN, MXV, MYR, MZN, NAD, NGN, NIO, NOK, NPR, NZD, OMR, PAB, PEN, PGK, PHP, PKR, PLN, PYG, QAR, RON, RSD, RUB, RWF, SAR, SBD, SCR, SDG, SEK, SGD, SHP, SLE, SLL, SOS, SRD, SSP, STN, SVC, SYP, SZL, THB, TJS, TMT, TND, TOP, TRY, TTD, TWD, TZS, UAH, UGX, USD, USN, UYI, UYU, UYW, UZS, VED, VES, VND, VUV, WST, XAF, XAG, XAU, XBA, XBB, XBC, XBD, XCD, XDR, XOF, XPD, XPF, XPT, XSU, XTS, XUA, XXX, YER, ZAR, ZMW, ZWL).

### Project structure notes

- Aligned with unified project structure: domain components in `src/components/packt/`, types in `src/data/types.ts`, no new top-level additions
- `CurrencyPicker` is a shared component, used by `TripEditBudget` (this story) and later by `CostDialog` (Story 1.2) and `TripAddExpenseModal` (Story 1.5) — design with reuse in mind
- `TripBudgetTab` is a shell now; later stories (1.4, 1.5, 1.6, 1.9) will populate it with actual spend, category breakdown, toolbar, and status indicators

### References

- [Source: epics.md §Epic 1 Story 1.1] — ACs and user story
- [Source: architecture.md §Core Architectural Decisions §Frontend Architecture] — Budget tab in TABS, new components
- [Source: architecture.md §Project Structure & Boundaries] — Full file tree showing every new/modified file
- [Source: architecture.md §Implementation Patterns & Consistency Rules §Naming Patterns] — `ExpenseCategory` enum (not used yet in this story, but context for later)
- [Source: architecture.md §Enforcement Guidelines] — All expense mutations route through `budget/actions.ts` (not used yet in this story)
- [Source: epics.md §UX-DR7] — Currency picker row pattern (code swatch + name + ISO code, `accent-soft` highlight, no checkmark)
- [Source: epics.md §UX-DR13] — No-budget-set state for TripBudgetTab
- [Source: project-context.md] — Technology stack, component conventions, CSS token rules

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
