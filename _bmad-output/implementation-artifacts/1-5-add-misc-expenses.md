---
baseline_commit: 3473e771d928ca7862d13c2a4b9b04a72e08df28
---

# Story 1.5: Add Misc Expenses

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trip owner/editor,
I want to add an expense that isn't tied to any event or reservation,
so that I can track costs like visa fees or other unlinked spend against my budget.

## Acceptance Criteria

1. **Misc Expense entry** — When I click "Add Misc Expense" on the Budget tab, the new `TripAddExpenseModal` opens with a `field-row` stack: currency+amount row, category disclosure row (required, no default, no persistent required-marker — validated inline at save), date row (defaults to today, past dates allowed), note row (optional, multiline). (FR7, UX-DR10)

2. **Amount validation** — Amount must be >0, ≤2 decimal places, and ≤50,000 in entry currency. Rejected client- and server-side with inline validation messages. (FR7, NFR1)

3. **Currency default** — Currency defaults to Trip Currency (`trip.budgetCurrency`), falling back to the user's profile currency if no Trip Currency is set. (FR2/FR4)

4. **Category required** — Category is required with no default. If save is attempted without one, an inline validation message appears. No persistent dot/asterisk marker. `aria-required="true"` on the underlying control. (UX-DR10, Accessibility Floor)

5. **Dual conversion at save** — On save, the system performs a dual-conversion lookup (Trip Currency + profile currency) via `lib/currency.ts::convertDual()` using the entry's date. If the lookup fails, the expense is saved unconverted (null conversion fields) and the client receives a `conversionError: true` flag. (FR8, NFR2, UX-DR16)

6. **Server Action gating** — `createExpense` is gated by `requireUser()` + `assertTripAccess(tripId, user.id!, "editor")`. `revalidatePath(\`/trips/\${tripId}\`)` fires after every mutation, matching existing conventions. (Architecture compliance)

7. **Immediate Budget tab update** — After save, the modal closes and the Budget tab's Actual figure and category tiles update via revalidation. (UX-DR13)

8. **"Add Misc Expense" always visible** — The button in the Budget tab toolbar is always visible regardless of trip expense state. (UX-DR13)

9. **Shared components** — The modal uses the existing `CurrencyPicker` and `CategoryPicker` components (shared across `CostDialog`, `TripEditBudget`, and this modal). (Architecture enforcement, UX-DR7, UX-DR8)

10. **Full keyboard operability** — Tab order: amount → currency → category → date → note → save/cancel. Currency picker and category picker: `Esc` dismisses without change, focus returns to the trigger. (NFR3)

11. **Conversion failure toast** — When the `createExpense` action returns `conversionError: true`, the modal shows a sonner toast: "Couldn't convert currency — try again." The expense is saved unconverted (no partial state). (UX-DR16, NFR2)

## Tasks / Subtasks

- [ ] Fix `validateCreateExpenseInput` in `budget/actions.ts` — allow both `eventId` and `reservationId` to be null for unlinked expenses (currently rejects at line 113-115) (AC: 1)
- [ ] Create `src/components/packt/trip-add-expense-modal.tsx` — shadcn Dialog with field-row layout (AC: 1, 2, 3, 4, 9, 10)
  - [ ] Amount input with validation (>0, ≤2 decimals, ≤50,000), associated `<label>` or `aria-label`
  - [ ] Currency field using `CurrencyPicker` (defaults to Trip Currency then profile currency)
  - [ ] Category field using `CategoryPicker` (required, no default, `aria-required="true"`)
  - [ ] Date input (defaults today, past allowed, ISO format), associated `<label>` or `aria-label`
  - [ ] Note textarea (optional, multiline), associated `<label>` or `aria-label`
  - [ ] Save calls `createExpense(tripId, input)` from `budget/actions.ts`
  - [ ] On `conversionError`: toast "Couldn't convert currency — try again."
  - [ ] On success: close modal (parent revalidates via action)
  - [ ] On error: inline validation or toast
  - [ ] Tab order: amount → currency → category → date → note → save/cancel
  - [ ] Expose `TripAddExpenseModalProps` interface
- [ ] Modify `src/components/packt/trip-budget-tab.tsx` — add toolbar with "Add Misc Expense" button, wire modal (AC: 7, 8)
  - [ ] Add `tripId` prop
  - [ ] Add internal state for modal open/close
  - [ ] Render toolbar between header and category tiles with primary "Add Misc Expense" button
  - [ ] Render `TripAddExpenseModal` controlled by open state
- [ ] Create `src/components/packt/trip-add-expense-modal.test.tsx` — unit tests (AC: all)
  - [ ] Renders all fields (amount, currency, category, date, note)
  - [ ] Amount validation (≤0, >2 decimals, >50,000)
  - [ ] Category required validation
  - [ ] Currency defaults to Trip Currency
  - [ ] Calls `createExpense` on save
  - [ ] Shows toast on conversion error
  - [ ] Keyboard tab order
- [ ] Update `src/components/packt/trip-budget-tab.test.tsx` — add toolbar tests (AC: 7, 8)
  - [ ] Shows "Add Misc Expense" button
  - [ ] Button opens modal
  - [ ] Always visible regardless of expenses

## Dev Notes

### What this story does

Adds the Misc Expense entry surface on top of Stories 1.2-1.4's existing infrastructure. Key difference from previous stories: this is the first entry point for **unlinked** expenses (no `eventId`/`reservationId`).

**This story does NOT add:**
- The "Recalculate Conversions" button (Story 1.6)
- The progress bar, status badge, or threshold indicators (Stories 1.8/1.9)
- The Trip Currency change dialog (Story 1.7)

### What must be preserved

- **Existing `createExpense` behavior for linked expenses** — the action must still work for event-linked and reservation-linked expenses (CostDialog in Story 1.6). The only validation change is relaxing the "must have eventId or reservationId" requirement.
- **Existing `TripBudgetTab` tests** — all 13 existing tests must continue to pass after adding the toolbar and props. The toolbar is additive.
- **`TripDetailTabBody` compatibility** — the existing `TripBudgetTab` is rendered at `trip-detail-tab-body.tsx:199-201` with `budget`, `expenses`, `onOpenEditBudget`. If we add `tripId`, we must either thread it through or provide it another way (defaultExpenseCurrency already exists in the tab body props — same source of truth for Trip Currency).

### Critical bug to fix

`src/app/(app)/trips/[tripId]/budget/actions.ts:113-115` — `validateCreateExpenseInput` requires `eventId` or `reservationId`:
```ts
if (!input.eventId && !input.reservationId) {
  throw new Error("Expense must be linked to an event or reservation.");
}
```
This validation must be relaxed to allow both `null` (unlinked Misc Expense). The existing `createExpense` action body already handles `null` correctly (line 136-138 passes `null`). Only the validation function needs the fix.

### Existing code state — read before editing

**`src/app/(app)/trips/[tripId]/budget/actions.ts:104-120`** — `validateCreateExpenseInput` rejects unlinked expenses. Remove the eventId/reservationId requirement check. The rest of the action is correct.

**`src/app/(app)/trips/[tripId]/budget/actions.ts`** — already has `createExpense`, `updateExpense`, `deleteExpense` with proper auth gating, dual conversion, revalidation. No new action needed for this story.

**`src/components/packt/trip-budget-tab.tsx:55`** — `TripBudgetTab` currently takes `budget`, `expenses`, `onOpenEditBudget`. Add `tripId: string` prop. Add toolbar with "Add Misc Expense" button and modal state.

**`src/components/packt/trip-budget-tab.test.tsx`** — 13 existing tests. Add tests for the toolbar button and modal integration.

**`src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx:199-201`** — renders `<TripBudgetTab budget={trip.budget} expenses={expenses} onOpenEditBudget={onOpenEditBudget} />`. Must pass `tripId` when added to `TripBudgetTabProps`.

**`src/components/packt/currency-picker.tsx`** — exists, searchable. Per UX-DR7 the Misc Expense modal uses the shared `currency-picker-row` — reuse this component.

**`src/components/packt/category-picker.tsx`** — exists, uses shared `ExpenseCategory` enum. Reuse directly.

**`src/data/types.ts:760-774`** — `CreateExpenseInput` exists. No changes needed.

### Architecture compliance

- **Actions in `budget/actions.ts`** — `createExpense` already lives in the correct file and follows the `assertTripAccess`/`revalidatePath` pattern. Only validation logic needs fixing.
- **Shared `ExpenseCategory` enum** — use `ExpenseCategory` from `@/data/types`, not hardcoded strings.
- **Shared `CurrencyPicker`/`CategoryPicker`** — import from the existing components; do not duplicate.
- **Math stays in `lib/budget.ts`** — no new calculation functions in this story; the modal just creates an expense row, and the Budget tab already recomputes from the fresh data.
- **CSS custom properties only** — no hardcoded hex colors; use `var(--fg)`, `var(--fg-3)`, `var(--line)`, etc.
- **No zod** — inline validation only, matching existing conventions.

### File structure requirements

**MODIFIED files:**
| File | Change |
|------|--------|
| `src/app/(app)/trips/[tripId]/budget/actions.ts` | Fix `validateCreateExpenseInput` to allow unlinked expenses (both eventId/reservationId null) |
| `src/components/packt/trip-budget-tab.tsx` | Add `tripId` prop, toolbar with "Add Misc Expense" button, modal state wiring |
| `src/components/packt/trip-budget-tab.test.tsx` | Add tests for toolbar button and modal |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Pass `tripId` prop to `TripBudgetTab` |

**NEW files:**
| File | Purpose |
|------|---------|
| `src/components/packt/trip-add-expense-modal.tsx` | Misc Expense entry modal (shadcn Dialog) |
| `src/components/packt/trip-add-expense-modal.test.tsx` | Unit tests |

### Library requirements

- No new npm packages
- `@/components/ui/dialog` (already installed — shadcn Dialog)
- `@/components/ui/button` (already used)
- `@/components/ui/input` (already used)
- `CurrencyPicker` from `@/components/packt/currency-picker` (exists)
- `CategoryPicker` from `@/components/packt/category-picker` (exists)
- `ExpenseCategory`, `CreateExpenseInput` from `@/data/types` (exist)
- `cn()` from `@/lib/utils` (exists)
- `toast` from `sonner` (exists, project-wide)
- `createExpense` from `@/app/(app)/trips/[tripId]/budget/actions` (exists, needs validation fix)

### Key design decisions

- **All-or-nothing conversion failure** — matches existing `createExpense` behavior: saves unconverted with null conversion fields + `conversionError: true` flag. The modal surfaces this via sonner toast. (NFR2, UX-DR16)
- **No search in currency picker for modal** — UX-DR7 specifies the shared `currency-picker-row` has no search field (full scrollable list). The existing `CurrencyPicker` has `searchable` prop; set it to `false` when used in the modal per spec.
- **Category inline validation at save, not persistent marker** — matches UX-DR6's "no persistent required-marker on category" spec. No dot/asterisk; `aria-required="true"` behind the scenes and inline error on save attempt without selection.
- **Amount input in entry currency** — the 50,000 ceiling is in the entry currency, not Trip Currency. Matches PRD Assumptions Index and the PRD/architecture resolution.
- **Date format** — ISO 8601 date string (`YYYY-MM-DD`), matching project convention. Use a native `<input type="date">` or matching UX pattern.

### Testing requirements

**`trip-add-expense-modal.test.tsx`:**
- Renders all form fields (amount input, currency, category, date, note textarea)
- Amount validation: rejects 0, negative, >2 decimals, >50,000 with inline messages
- Category required: reject save without selection with inline message
- Currency defaults to Trip Currency when budget exists
- Currency falls back to profile currency when no Trip Currency set
- Calls `createExpense` with correct input on valid save
- Shows sonner toast on `conversionError: true`
- Closes modal on successful save
- Tab order matches spec (amount → currency → category → date → note → save/cancel)
- Esc on currency picker/category picker dismisses without change

**`trip-budget-tab.test.tsx` additions:**
- Shows "Add Misc Expense" button in toolbar area
- Button triggers modal open
- "Add Misc Expense" visible regardless of expense array length (including empty)
- Existing tests continue to pass

**`actions.test.ts` additions (in `budget/actions.test.ts`):**
- Existing test at line 132-143 asserts that unlinked expenses are rejected — this test must be updated to accept unlinked expenses instead
- New test: creates an unlinked expense (no eventId, no reservationId) successfully
- New test: validates amount ceiling at 50,000 for unlinked expenses (if not already tested)

### Previous story intelligence (Story 1.4)

**Dev patterns established:**
- `budget/actions.ts` uses `assertTripAccess(tripId, user.id!, "editor")` on every action — already in place
- `revalidatePath(\`/trips/\${tripId}\`)` after every mutation — already in place
- Toast via `sonner`: `toast.error(message)`, `toast.success(message)`
- No new npm packages — all dependencies already available
- `dbExpenseToType` validates category against `ExpenseCategory` values, falls back to Misc — reuse this mapper; never map raw DB rows directly

**Review findings from Story 1.4 that apply here:**
- NaN/Infinity guards needed in currency formatting — already in `trip-budget-tab.tsx`
- `Number.isFinite` guard before formatting
- CSS custom properties for all colors

**Testing patterns established:**
- Colocated `*.test.ts`/`*.test.tsx` files next to source
- `vi.fn()` for callback mocks
- `@testing-library/user-event` for interaction tests
- `describe`/`it` blocks (not `test`)
- `@vitest-environment node` for server action tests

### References

- [Source: epics.md §Epic 1 Story 1.5] — ACs, user story, FR7 details
- [Source: architecture.md §Data Architecture] — `expenses` table schema, dual-conversion columns, 50,000 max amount ceiling
- [Source: architecture.md §Implementation Patterns] — action naming, file locations, auth gating
- [Source: architecture.md §Enforcement Guidelines] — use `ExpenseCategory` enum, route mutations through `budget/actions.ts`, use `dbExpenseToType()`
- [Source: architecture.md §Project Structure] — `budget/actions.ts` location, file organization
- [Source: DESIGN.md §Components] — `field-row`, `currency-picker-row`, `category-picker` visual specs
- [Source: EXPERIENCE.md §Component Patterns] — Misc Expense modal `field-row` layout, "Add Misc Expense" always visible, toolbar position
- [Source: EXPERIENCE.md §State Patterns] — Conversion lookup failure: toast "Couldn't convert currency — try again."; entry saved unconverted
- [Source: EXPERIENCE.md §Voice and Tone] — "$3,760 spent" (not "You've spent..."); "No expenses yet" (not "Looks like you haven't...")
- [Source: EXPERIENCE.md §Accessibility Floor] — `aria-required="true"` for category, keyboard dismissable pickers, tab order spec
- [Source: EXPERIENCE.md §Interaction Primitives] — Tab order: amount → currency → category → date → note → save/cancel. Esc on currency/category picker dismisses without change, focus returns to trigger.
- [Source: addendum.md §Implementation Sequence step 8] — Misc Expense modal depends on expenses table (#2) and Frankfurter utility (#7)
- [Source: addendum.md §Component-Level Notes] — `TripAddExpenseModal` is a shadcn Dialog with currency, category, amount, date, note fields
- [Source: PRD §4.4 FR-7] — Amount validation (>0, ≤2 decimals, ≤50,000), currency defaults, category required, note optional
- [Source: project-context.md] — CSS custom properties, `cn()` convention, `"use client"` rule, file placement, type conventions

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad create-story)

### Debug Log References

- `npx vitest run src/components/packt/trip-budget-tab.test.tsx` — 13 existing tests, verify all pass after toolbar additions
- `npx vitest run src/app/(app)/trips/[tripId]/budget/actions.test.ts` — verify existing tests pass after validation fix, plus new unlinked-expense test
- `npx vitest run src/components/packt/trip-add-expense-modal.test.tsx` — new test suite

### Completion Notes List

- Story 1.5 adds the "Add Misc Expense" entry point — the Budget tab toolbar, the `TripAddExpenseModal`, and fixes the `createExpense` validation to accept unlinked expenses.
- Shared `CurrencyPicker` and `CategoryPicker` components already exist from the CostDialog work — reused, not duplicated.
- `createExpense` Server Action already exists in `budget/actions.ts` with proper auth, dual conversion, and revalidation — the only fix needed is relaxing the eventId/reservationId requirement.
- Thread `tripId` through `trip-detail-tab-body.tsx` into `TripBudgetTab` so the modal can pass it to `createExpense`.

### File List

- `_bmad-output/implementation-artifacts/1-5-add-misc-expenses.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/(app)/trips/[tripId]/budget/actions.ts`
- `src/app/(app)/trips/[tripId]/budget/actions.test.ts`
- `src/components/packt/trip-budget-tab.tsx`
- `src/components/packt/trip-budget-tab.test.tsx`
- `src/components/packt/trip-add-expense-modal.tsx`
- `src/components/packt/trip-add-expense-modal.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`
