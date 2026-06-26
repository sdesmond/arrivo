---
baseline_commit: 00f6232
---

# Story 1.6: Recalculate Conversions

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trip owner/editor,
I want to manually re-fetch conversion rates for my mismatched expenses,
so that I can refresh stale conversions on demand without waiting for a new entry.

## Acceptance Criteria

1. **Button visibility** — When at least one `expenses` row on this trip still needs its Trip-Currency conversion recalculated (its `currency` differs from Trip Currency, AND the stored rate may not yet be the real historical rate — see AC7), the Budget tab toolbar shows a "Recalculate Conversions" button (secondary), positioned alongside "Add Misc Expense". (FR9, UX-DR13)

2. **Button hidden** — When every `expenses` row's currency already matches Trip Currency, the trip has zero `expenses` rows, or every mismatched row already holds a fixed historical rate (computed on or after its own `date` — recalculating it again would return the identical rate), the "Recalculate Conversions" button is hidden entirely. (FR9, addendum to UX-DR13; refined 2026-06-26 — see Change Log)

3. **All-or-nothing success** — When I click "Recalculate Conversions" and every re-fetch succeeds, every mismatched `expenses` row's Trip-Currency conversion fields are updated with fresh rates. The Budget tab's Actual figure reflects the new amounts immediately (via `revalidatePath`). (FR9)

4. **All-or-nothing failure** — When the action fails partway through, no `expenses` row is left partially updated. A sonner toast appears: "Recalculation failed — no amounts were changed. Try again." (UX-DR16, NFR2)

5. **Toast on success** — When the action completes successfully, a sonner toast appears: "Conversions recalculated." (follows the app's existing terse toast style, matching UX-DR15 Voice and Tone)

6. **Server Action gating** — `recalculateConversions` is gated by `requireUser()` + `assertTripAccess(tripId, user.id!, "editor")`. `revalidatePath(\`/trips/\${tripId}\`)` fires after the mutation. (Architecture compliance)

7. **Visibility computed client-side via `needsRecalculation`** — Whether the button shows is determined by `hasCurrencyMismatch(expenses, tripCurrency, now)` from `lib/budget.ts`, which delegates per-expense to `needsRecalculation(expense, tripCurrency, now)`. An expense needs recalculation when its `currency` differs from `tripCurrency` AND either: (a) its `date` is still in the future relative to `now` (a future-dated lookup is always clamped to "today" by `resolveLookupDate` in `lib/currency.ts`, so the stored rate is necessarily a proxy and always needs refreshing), or (b) its `date` is today/past but the conversion was last computed (`updatedAt` ?? `createdAt`) *before* that date arrived — meaning the original fetch used a proxy "today" rate rather than the real historical rate. Once a conversion is computed on or after its own `date`, the real historical rate is fixed forever and `needsRecalculation` returns `false`. Missing `updatedAt`/`createdAt` defaults to `true` (conservative — never silently skip). The Budget tab receives the full `expenses` list so it can compute this client-side via `useNow()`; no new Server Action for visibility. (Refined 2026-06-26 — see Change Log)

8. **Reuses `lib/currency.ts::recalculate()`** — The Server Action calls `recalculate(expenses, tripCurrency)`, which filters to only the expenses where `needsRecalculation(expense, tripCurrency, getNow())` is `true` (see AC7), then re-fetches rates via Frankfurter (`/v2/rates` endpoint, date-specific, multi-`quotes` batched) for each, using each expense's own `date` field. Expenses with an already-fixed historical rate are skipped (no wasted API call). On any fetch failure, the entire batch is rolled back. (Refined 2026-06-26 — see Change Log)

9. **Loading state** — While the recalculation is in-flight, the button shows a spinner and is disabled to prevent double-submit.

## Tasks / Subtasks

- [x] Add `hasCurrencyMismatch()` to `src/lib/budget.ts` (AC: 1, 2, 7)
  - [x] Pure function: `hasCurrencyMismatch(expenses: Expense[], tripCurrency: string): boolean`
  - [x] Returns `true` when any expense's `.currency` (uppercased) differs from `tripCurrency` (uppercased)
  - [x] Returns `false` for empty expenses array
- [x] Update `src/lib/budget.test.ts` — add `hasCurrencyMismatch` tests (AC: 1, 2, 7)
  - [x] Returns false for empty array
  - [x] Returns false when all currencies match trip currency
  - [x] Returns true when at least one expense has a different currency
  - [x] Case-insensitive comparison
- [x] Wire up `recalculate()` in `src/lib/currency.ts` (AC: 3, 4, 8)
  - [x] Replace the stub with a real implementation:
    ```ts
    export async function recalculate(
      expenses: Expense[],
      tripCurrency: string
    ): Promise<void>;
    ```
  - [x] Only processes expenses whose `.currency` differs from `tripCurrency` (case-insensitive)
  - [x] For each mismatched expense, calls `convertDual(expense.amount, expense.currency, [tripCurrency], expense.date)`
  - [x] Throws if **any** conversion fails — no partial results
  - [x] Returns the conversion results for the caller to persist (the action handles DB writes)
- [x] Create `src/lib/currency.test.ts` — add `recalculate` tests (AC: 3, 4, 8)
  - [x] Calls `convertDual` for mismatched expenses only
  - [x] Skips expenses whose currency already matches trip currency
  - [x] Throws on fetch failure (all-or-nothing)
  - [x] Returns correct results for multiple mismatched expenses
- [x] Add `recalculateConversions()` to `src/app/(app)/trips/[tripId]/budget/actions.ts` (AC: 3, 4, 5, 6)
  - [x] `export async function recalculateConversions(tripId: string): Promise<void>`
  - [x] `requireUser()` + `assertTripAccess(tripId, user.id!, "editor")`
  - [x] Fetch all expenses for the trip, plus the trip's budget currency
  - [x] Call `recalculate(expenses, tripCurrency)` — if it throws, catch and re-throw so caller gets failure toast
  - [x] On success: batch-update each mismatched expense row's Trip-Currency conversion fields (`convertedAmountTrip`, `conversionRateTrip`, `convertedCurrencyTrip`) with the returned results
  - [x] `revalidatePath(\`/trips/\${tripId}\`)`
  - [x] Return `{ recalculated: true }` on success (so caller can toast success)
- [x] Update `src/app/(app)/trips/[tripId]/budget/actions.test.ts` — add `recalculateConversions` tests (AC: 3, 4, 6)
  - [x] Requires auth (gated by `requireUser`)
  - [x] Requires editor access (gated by `assertTripAccess`)
  - [x] Updates conversion fields for mismatched expenses
  - [x] Throws and rolls back on fetch failure (all-or-nothing)
  - [x] Skips expenses already matching trip currency
  - [x] Calls `revalidatePath` on completion
- [x] Update `src/components/packt/trip-budget-tab.tsx` (AC: 1, 2, 9)
  - [x] Import `hasCurrencyMismatch` from `@/lib/budget`
  - [x] Import `recalculateConversions` from `@/app/(app)/trips/[tripId]/budget/actions`
  - [x] Add `[isRecalculating, setIsRecalculating] = useState(false)`
  - [x] Compute `showRecalculate = hasCurrencyMismatch(expenses, tripCurrency)`
  - [x] In the toolbar div (already exists with "Add Misc Expense"), add "Recalculate Conversions" button when `showRecalculate` is true:
    - `variant="secondary"`, `size="sm"` (matching UX-DR13 spec)
    - `disabled` when `isRecalculating`
    - Shows spinner icon when `isRecalculating`, text "Recalculating..." while loading
  - [x] On click: set `isRecalculating(true)`, call `await recalculateConversions(tripId)`, on success `toast.success("Conversions recalculated.")`, on error `toast.error("Recalculation failed — no amounts were changed. Try again.")`, finally `setIsRecalculating(false)`
- [x] Update `src/components/packt/trip-budget-tab.test.tsx` — add recalculate tests (AC: 1, 2, 9)
  - [x] All existing tests continue to pass (~13 tests from Story 1.4 + toolbar tests from Story 1.5)
  - [x] Button hidden when all expenses match trip currency
  - [x] Button hidden when expenses array is empty
  - [x] Button visible when at least one expense mismatches
  - [x] Shows spinner while recalculating
  - [x] Calls `recalculateConversions` on click
  - [x] Shows success toast on completion
  - [x] Shows error toast on failure

### Refinement: skip already-fixed historical rates (added 2026-06-26)

- [x] Add `needsRecalculation()` to `src/lib/budget.ts` (AC: 1, 2, 7, 8)
  - [x] Pure function: `needsRecalculation(expense: Expense, tripCurrency: string, now: Date): boolean`
  - [x] Returns `false` immediately when currency matches (case-insensitive)
  - [x] Returns `true` when `expense.date` is in the future relative to `now` (always a proxy rate)
  - [x] Returns `true` when no `updatedAt`/`createdAt` is recorded (conservative default)
  - [x] Otherwise compares `expense.date` to `updatedAt ?? createdAt` (date-only): `true` if the conversion was last computed before the expense's date (proxy), `false` if computed on/after (fixed historical rate)
- [x] Update `hasCurrencyMismatch()` signature to `(expenses: Expense[], tripCurrency: string, now: Date): boolean`, delegating to `needsRecalculation` per expense (AC: 1, 2, 7)
- [x] Update `src/lib/budget.test.ts` — add `needsRecalculation` tests + update `hasCurrencyMismatch` tests for the new `now` param and the fixed-rate-skip case
- [x] Update `recalculate()` in `src/lib/currency.ts` to filter via `needsRecalculation(expense, tripCurrency, getNow())` instead of raw currency mismatch (AC: 8)
- [x] Update `src/lib/currency.test.ts` — add tests: skips a past-dated expense already computed on/after its date; recalculates a past-dated expense computed before its date (proxy); always recalculates a future-dated expense regardless of `updatedAt`
- [x] Update `src/components/packt/trip-budget-tab.tsx` — call `useNow()` from `@/components/providers/mock-date-provider` and pass `now` into `hasCurrencyMismatch` (AC: 1, 2, 7)
- [x] Update `src/components/packt/trip-budget-tab.test.tsx` — add test confirming the button hides when the only mismatched expense already has a fixed historical rate (wrapped in `MockDateProvider` for deterministic `now`)

## Dev Notes

### What this story does

Adds the "Recalculate Conversions" action to the Budget tab toolbar — a manual trigger that re-fetches Frankfurter rates for every expense whose currency differs from Trip Currency. All-or-nothing semantics prevent partial updates.

**This story does NOT add:**
- The Trip Currency change confirmation dialog (Story 1.7) — that story reuses the same `recalculate()` function
- The progress bar, status badge, or threshold indicators (Stories 1.8/1.9)
- Settings threshold configuration (Story 1.8)

### What must be preserved

- **Existing `createExpense`/`updateExpense`/`deleteExpense` behavior** — the recalculation action must not change how any existing action works
- **Existing `TripBudgetTab` tests** — all existing tests must continue to pass after adding the toolbar button
- **Existing `TripAddExpenseModal`** — the modal is still rendered below the toolbar and must continue to work unchanged

### Existing code state — read before editing

**`src/lib/currency.ts:174-176`** — `recalculate()` is a no-op stub:
```ts
export async function recalculate(expenses: Expense[]): Promise<void> {
  void expenses;
}
```
The first parameter is `expenses: Expense[]` but the real implementation needs `tripCurrency: string` as a second param. The stub was written before the signature was finalized — change the signature to `(expenses: Expense[], tripCurrency: string)`.

**`src/lib/budget.ts`** — no `hasCurrencyMismatch` function exists. Add it as a pure function, same pattern as `calculateActual`.

**`src/app/(app)/trips/[tripId]/budget/actions.ts`** — has `createExpense`, `updateExpense`, `deleteExpense` but no `recalculateConversions`. Add it as a new export.

**`src/components/packt/trip-budget-tab.tsx`** — toolbar only has "Add Misc Expense" button. Add the secondary button conditionally.

**`src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`** — renders `<TripBudgetTab>` with props `tripId`, `budget`, `expenses`, `defaultExpenseCurrency`, `onOpenEditBudget`. No changes needed for this story.

### Architecture compliance

- **Actions in `budget/actions.ts`** — `recalculateConversions` follows the existing `assertTripAccess`/`revalidatePath` pattern
- **Math stays in `lib/budget.ts`** — `hasCurrencyMismatch` goes in `lib/budget.ts`, not inline in the component
- **Currency logic stays in `lib/currency.ts`** — `recalculate()` goes in `lib/currency.ts`, not inline in the action
- **`lib/currency.ts::convertDual()` already handles multi-target batching** — each mismatched expense may need Trip Currency + profile currency conversion; `convertDual()` already batches both targets in one request when they differ
- **CSS custom properties only** — no hardcoded hex colors
- **No zod** — inline validation only, matching existing conventions

### Key design decisions

- **All-or-nothing failure** — matches NFR2. If any conversion fetch fails, no rows are updated. The action catches the error and surfaces it via toast; the caller retries manually.
- **Button visibility from client** — `hasCurrencyMismatch()` is pure and synchronous, computed from the `expenses` array already on the client. No need for a separate Server Action or endpoint to determine button visibility.
- **Loading state** — simple boolean + disabled button. No need for a complex race-condition guard; the button is disabled during the async operation.
- **Toast on success** — follows the app's existing terse toast style per UX-DR15. "Conversions recalculated." — no exclamation, no embellishment.
- **Toast on failure** — matches UX-DR16 exactly: "Recalculation failed — no amounts were changed. Try again." The word "Try again." is part of the message per spec.
- **Spinner icon** — use `Loader2` from `lucide-react` with `className="animate-spin"`. `strokeWidth={1.5}` matches the project's icon convention. Set `aria-hidden="true"` on the icon since it's decorative (the "Recalculating..." text conveys the state).
- **Recalculate only Trip Currency conversions** — per the addendum and architecture, the manual recalculate re-fetches Trip Currency only. Profile-currency conversions are recalculated only during a Profile Currency change (Story 2.5). This keeps the story focused.

### E2E note

The "Recalculate Conversions" button adds a user-facing element but no `budget.feature` exists yet. Per the no-duplication rule: visibility logic and click behavior are covered by unit tests in this story. A comprehensive `budget.feature` covering the full Budget tab (Stories 1.5-1.9) should be created as a follow-up once all Budget tab features land — the feature-map.mjs `trips` entry already registers `trip-budget-tab.tsx` and `budget/actions.ts` so affected test selection will work.

### References

- [Source: epics.md §Epic 1 Story 1.6] — ACs, user story, FR9 details
- [Source: architecture.md §Data Architecture] — All-or-nothing semantics, `recalculateConversions` action location
- [Source: architecture.md §Implementation Patterns] — Action naming, file locations, auth gating
- [Source: architecture.md §Enforcement Guidelines] — Route mutations through `budget/actions.ts`, use `dbExpenseToType()`, never cache historical lookups
- [Source: EXPERIENCE.md §State Patterns] — Recalculation failure toast copy, button visibility rules
- [Source: EXPERIENCE.md §Information Architecture] — "Recalculate Conversions" in toolbar alongside "Add Misc Expense"
- [Source: EXPERIENCE.md §Component Patterns] — "Recalculate Conversions" button: secondary, positioned in toolbar
- [Source: EXPERIENCE.md §Voice and Tone] — Terse, plain toast messages: "Conversions recalculated." not "Your conversions have been successfully recalculated!"
- [Source: EXPERIENCE.md §Interaction Primitives] — Standard button activation (click/Enter/Space), no confirmation step
- [Source: EXPERIENCE.md §Banned] — No auto-refreshing conversion rates (background refresh explicitly banned)
- [Source: DESIGN.md] — Button positioning follows toolbar layout spec
- [Source: project-context.md] — CSS custom properties, `cn()` convention, `"use client"` rule, file placement, type conventions

### Previous story intelligence (Story 1.5)

**Dev patterns established:**
- `budget/actions.ts` uses `assertTripAccess(tripId, user.id!, "editor")` on every action — follow same pattern
- `revalidatePath(\`/trips/\${tripId}\`)` after every mutation — follow same pattern
- Toast via `sonner`: `toast.error(message)`, `toast.success(message)`
- No new npm packages — all dependencies already available
- `dbExpenseToType` validates category against `ExpenseCategory` values — but for recalculate, we use raw DB rows (the action reads from `expenses` table directly, no mapper needed since we just need existing conversion fields)

**Review findings from Story 1.5 that apply here:**
- Double-submit race condition guard (submittingRef ref-based) — use the simpler `disabled` prop + loading state for this story since the async call is isolated and doesn't modify form state
- Decimal-places check uses string-based approach for amounts — not relevant here since recalculate operates on existing amounts
- CSS custom properties for all colors — always use `var(--fg)` etc., never hardcoded hex

**Testing patterns established:**
- Colocated `*.test.ts`/`*.test.tsx` files next to source
- `vi.fn()` for callback mocks
- `@testing-library/user-event` for interaction tests
- `describe`/`it` blocks (not `test`)
- `@vitest-environment node` for server action tests

### File structure requirements

**MODIFIED files:**

| File | Change |
|------|--------|
| `src/lib/budget.ts` | Add `hasCurrencyMismatch()` pure function |
| `src/lib/budget.test.ts` | Add `hasCurrencyMismatch` unit tests |
| `src/lib/currency.ts` | Wire up `recalculate()` — replace stub with real implementation; update signature to accept `tripCurrency` param |
| `src/lib/currency.test.ts` | Add `recalculate` unit tests (file exists — check if tests exist) |
| `src/app/(app)/trips/[tripId]/budget/actions.ts` | Add `recalculateConversions()` Server Action |
| `src/app/(app)/trips/[tripId]/budget/actions.test.ts` | Add `recalculateConversions` unit tests |
| `src/components/packt/trip-budget-tab.tsx` | Add conditional "Recalculate Conversions" button, loading state, toast handlers |
| `src/components/packt/trip-budget-tab.test.tsx` | Add recalculate button visibility/behavior tests |

**NEW files:** None

### Library requirements

- No new npm packages
- `Loader2` from `lucide-react` (already installed)
- `toast` from `sonner` (already used project-wide)
- `recalculateConversions` from `@/app/(app)/trips/[tripId]/budget/actions` (new export)
- `hasCurrencyMismatch` from `@/lib/budget` (new export)

### Testing requirements

**`lib/budget.test.ts` additions:**
- `hasCurrencyMismatch` returns false for empty array
- `hasCurrencyMismatch` returns false when all currencies match trip currency
- `hasCurrencyMismatch` returns true when one expense mismatches
- `hasCurrencyMismatch` is case-insensitive (`"usd"` vs `"USD"`)

**`lib/currency.test.ts` additions:**
- `recalculate` checks existing tests (if any) for conventions, then adds:
  - Calls `convertDual` only for mismatched expenses (skips matching ones)
  - Throws on any fetch failure (all-or-nothing)
  - Returns correct conversion results
  - Uses each expense's own `date` field for the lookup

**`budget/actions.test.ts` additions:**
- Requires auth (mock `requireUser` to throw)
- Requires editor access (mock `assertTripAccess` to throw)
- Updates conversion fields for mismatched expenses
- Rolls back (no updates) on fetch failure
- Skips matching expenses
- Calls `revalidatePath`

**`trip-budget-tab.test.tsx` additions:**
- All existing tests pass
- Button hidden when all expenses match
- Button hidden when no expenses
- Button visible when mismatch exists
- Shows spinner during recalculation
- Calls action on click
- Success toast on completion
- Error toast on failure

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad create-story)

### Debug Log References

- `npx vitest run src/lib/budget.test.ts` — `hasCurrencyMismatch`/`needsRecalculation` tests, 22 passed
- `npx vitest run src/lib/currency.test.ts` — `recalculate` tests, 23 passed
- `npx vitest run "src/app/(app)/trips/[tripId]/budget/actions.test.ts"` — `recalculateConversions` action tests, 22 passed (incl. `updatedAt`-stamping regression test)
- `npx vitest run src/components/packt/trip-budget-tab.test.tsx` — existing + new recalculate tests, 28 passed
- `npx vitest run` — full regression, 171 files / 2533 tests passed
- `npx eslint <changed files>` — clean
- `npx tsc --noEmit` — clean
- `npm run test:coverage` — 95.07% statements / 90.56% branches / 96.15% functions / 96.48% lines (re-verified after the `updatedAt` fix; meets ≥95%/≥90% thresholds)

### Completion Notes List

- Story 1.6 adds the manual "Recalculate Conversions" button to the Budget tab toolbar — a secondary button shown only when at least one expense still needs its Trip-Currency conversion recalculated.
- `recalculate()` in `lib/currency.ts` is the shared implementation reused by Story 1.7 (Trip Currency change) and Story 2.5 (Profile Currency change) — follow the all-or-nothing contract. Returns `RecalculateResult[]` (`expenseId`, `convertedAmount`, `rate`) for expenses still needing recalculation only; rejects with no partial results on any fetch failure.
- `hasCurrencyMismatch()` in `lib/budget.ts` delegates per-expense to `needsRecalculation()` — the visibility check is computed client-side from the existing expenses array plus `now` (via `useNow()`).
- `needsRecalculation()` in `lib/budget.ts` encodes the staleness rule: future-dated expenses always need a refresh (proxy rate, per `resolveLookupDate`'s clamping in `lib/currency.ts`); past/today-dated expenses only need one if their conversion was last computed before their own date (also a proxy); once computed on/after their date, the historical rate is fixed and `needsRecalculation` returns `false` thereafter.
- The `recalculateConversions` Server Action re-fetches only Trip Currency conversions for this story (profile currency conversions are handled during profile currency change in Epic 2). It reads expense rows via `dbExpenseToType()` per architecture convention rather than hand-mapping raw rows.
- Failure propagates naturally (no explicit catch/re-throw needed in the action) since `recalculate()` rejects before any DB writes occur — the `Promise.all` over `db.update` calls only runs after `recalculate()` resolves successfully, preserving all-or-nothing semantics.

## Change Log

- **2026-06-26** — Refined the recalculation trigger from "any currency mismatch" to "currency mismatch AND rate may still be a proxy" (AC1, AC2, AC7, AC8). Added `needsRecalculation()` to `lib/budget.ts`; `hasCurrencyMismatch()` now takes a `now: Date` param and delegates to it; `recalculate()` in `lib/currency.ts` filters through the same predicate via `getNow()`. Rationale: historical Frankfurter rates never change once fetched for their real date, so re-fetching an already-fixed past-dated conversion was a wasted API call and DB write with no effect — this change makes the button (and the recalculate action) a no-op for those rows while still always refreshing future-dated proxy rates and unresolved past-dated proxies.
- **2026-06-26** — Fixed a bug surfaced while verifying the above refinement: `recalculateConversions` (`budget/actions.ts`) updated `convertedAmountTrip`/`conversionRateTrip`/`convertedCurrencyTrip` but never stamped `updatedAt`, so `needsRecalculation` would keep treating an already-corrected row as stale forever (the button would never hide, and every click would re-fetch the same rate from Frankfurter indefinitely). Added `updatedAt: new Date()` to the update's `.set()` call, matching the convention already used by `updateExpense`. Documented a related dev-only limitation in `deferred-work.md`: the dev mock-date picker doesn't affect real `createdAt`/`updatedAt` timestamps (those are always real wall-clock by codebase-wide convention), so jumping the mock date forward after entering a future-dated expense won't reliably surface the button in dev — confirmed not reproducible in real usage, since `getNow()` falls through to `new Date()` in production.

### File List

- `_bmad-output/implementation-artifacts/1-6-recalculate-conversions.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `src/lib/budget.ts`
- `src/lib/budget.test.ts`
- `src/lib/currency.ts`
- `src/lib/currency.test.ts`
- `src/app/(app)/trips/[tripId]/budget/actions.ts`
- `src/app/(app)/trips/[tripId]/budget/actions.test.ts`
- `src/components/packt/trip-budget-tab.tsx`
- `src/components/packt/trip-budget-tab.test.tsx`
