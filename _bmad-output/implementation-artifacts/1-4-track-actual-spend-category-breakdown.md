---
baseline_commit: 48e70897a4ffd66f552f662196fdd234c1d651c6
---

# Story 1.4: Track Actual Spend & Category Breakdown

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trip owner/editor,
I want to see my actual spend and a category breakdown on the Budget tab,
so that I know how much I've spent and where it's going without doing any math myself.

## Acceptance Criteria

1. **Actual spend header** — When a trip has ≥1 `expenses` rows, the Budget tab shows a header with a large "Actual spent" figure: the sum of all `expenses` for this trip, each converted to Trip Currency at its own locked rate. Budget total and Remaining are shown smaller beneath. (FR5, UX-DR13)

2. **Category tile grid** — When expenses span multiple `ExpenseCategory` values, the Budget tab shows one `category-tile` per category with ≥1 item, each showing the category name (fg-3) above a subtotal figure (fg). Categories with 0 items are omitted. Tiles wrap at least 2 per row on the narrowest supported viewport. (FR6, UX-DR5)

3. **Zero-entries empty state** — When a trip has zero `expenses` rows, the category tile grid area shows an inline "No expenses yet" message. The toolbar area remains visible. (UX-DR13)

4. **Shared `lib/budget.ts`** — `calculateActual(expenses, tripCurrency)` and `calculateCategoryBreakdown(expenses, tripCurrency)` live in a new shared module. Both `TripBudgetTab` and `TripEditBudget`'s read-only summary import from it — neither reimplements the math. (Architecture enforcement: prevents the same gap `lib/budget.ts` was created to close.)

5. **No-budget-set state preserved** — When `trip.budget` is undefined or has no total, the Budget tab still shows the actual spend figure (summing expenses independently of budget). The bar/badge/Remaining are hidden and replaced by the existing "Set a budget" prompt (inherited from Story 1.1).

6. **All expenses included** — `getTripDetail` already fetches all `tripExpenses` (queries.ts:293). The unlinked expenses (neither `eventId` nor `reservationId`) must be included in `TripDetailPayload` so the Budget tab receives the full set. Currently only event-linked and reservation-linked expenses reach the client.

## Tasks / Subtasks

- [x] Create `src/lib/budget.ts` — shared calculation functions (AC: 4)
  - [x] `calculateActual(expenses: Expense[], currency: string): number` — sum of `convertedAmountTrip` (falling back to `amount` when null), always in Trip Currency
  - [x] `calculateCategoryBreakdown(expenses: Expense[], currency: string): { category: ExpenseCategory; subtotal: number; count: number }[]` — group by category, sum converted amounts, filter out zero-count categories
  - [x] Both functions accept `currency` param for future use (not needed yet since `convertedAmountTrip` is always in Trip Currency)

- [x] Create `src/lib/budget.test.ts` — unit tests for shared calculations (AC: 4)
  - [x] `calculateActual` returns 0 for empty array
  - [x] `calculateActual` sums `convertedAmountTrip` values
  - [x] `calculateActual` falls back to `amount` when `convertedAmountTrip` is null
  - [x] `calculateCategoryBreakdown` groups by category correctly
  - [x] `calculateCategoryBreakdown` omits zero-count categories
  - [x] `calculateCategoryBreakdown` returns sorted by subtotal descending

- [x] Modify `src/data/types.ts` — add `expenses: Expense[]` to `TripDetailPayload` (AC: 6)

- [x] Modify `src/lib/queries.ts::getTripDetail` — collect unlinked expenses (`eventId` and `reservationId` both null) and return them in the payload alongside linked ones (AC: 6)

- [x] Modify `src/app/(app)/trips/[tripId]/page.tsx` — no changes needed (already passes `detail` which will now include expenses)

- [x] Modify `src/app/(app)/trips/[tripId]/page-client.tsx` — destructure `expenses` from `detail` and pass to `TripDetailTabBody` (AC: 6)

- [x] Modify `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` — accept `expenses` prop and pass to `TripBudgetTab` (AC: 6)

- [x] Rewrite `src/components/packt/trip-budget-tab.tsx` — expand from budget-only display to full actual-spend + category breakdown (AC: 1, 2, 3, 5)
  - [x] Accept new `expenses: Expense[]` prop in addition to existing `budget`/`onOpenEditBudget`
  - [x] Header section: large Actual figure, smaller Budget total and Remaining beneath (when budget exists)
  - [x] No-budget-set state: show Actual figure only, show "Set a budget" prompt, hide bar/badge/Remaining
  - [x] Zero-entries state: "No expenses yet" in tile grid area, toolbar stays visible
  - [x] Category tile grid: one tile per category with subtotal, 2+ per row
  - [x] Use `cn()` for className merging per project convention
  - [x] Use CSS custom properties for all colors (var(--fg), var(--fg-3), var(--surface), var(--line), etc.)
  - [x] Use Tailwind for layout/spacing; inline style for dynamic values
  - [x] Define explicit `TripBudgetTabProps` interface
  - [x] Import calculation functions from `@/lib/budget`

- [x] Update `src/components/packt/trip-budget-tab.test.tsx` — comprehensive tests for all new states (AC: 1, 2, 3, 5)
  - [x] Renders Actual spent header with converted amounts
  - [x] Shows Budget total and Remaining when budget exists
  - [x] Shows category tiles for each category with items
  - [x] Omits categories with zero items
  - [x] Shows "No expenses yet" for empty expenses array
  - [x] Shows "Set a budget" prompt when budget absent
  - [x] Existing tests continue to pass

## Dev Notes

### What this story does

Adds the actual-spend tracking layer on top of Story 1.3's conversion infrastructure. The `expenses` table already exists (Story 1.2), conversions are already populated at entry time (Story 1.3). This story:

1. Creates shared calculation utilities in `lib/budget.ts`
2. Passes expenses through the component tree so the Budget tab can use them
3. Rebuilds `TripBudgetTab` from a budget-only display to an actual-spend + category breakdown view

**This story does NOT add:**
- The progress bar, status badge, or threshold indicators (Stories 1.8/1.9)
- The "Recalculate Conversions" button (Story 1.6)
- The "Add Misc Expense" button's action wiring (Story 1.5)
- The warning/danger CSS tokens (Story 1.9)

### What must be preserved

- **Existing TripBudgetTab no-budget behavior** — the "Set a budget" prompt and "Edit budget" button must still work when budget is absent/present
- **TripDetailPayload compatibility** — all existing consumers of the payload (page.tsx, page-client.tsx, handlers) must continue to work; adding `expenses` is additive, not breaking
- **Existing test suite** — all existing tests must pass after modifications
- **`dbExpenseToType` mapper** — already exists, use it for mapping raw DB rows to `Expense` types
- **`requireUser()` + `assertTripAccess()`** — `getTripDetail` already gates on these; no new auth changes needed

### Existing code state — read before editing

**`src/lib/budget.ts`** — does NOT exist yet. Create it fresh.

**`src/data/types.ts:583-592`** — `TripDetailPayload` has NO `expenses` field currently. Add one.

**`src/lib/queries.ts:420-459`** — `getTripDetail` already fetches `tripExpenses` (line 293) and maps them into event/reservation expense links (lines 312-321, 436, 451). The raw `tripExpenses` rows need `dbExpenseToType()` mapping for the unlinked subset (those where `eventId` AND `reservationId` are both null) and returned as `expenses` in the payload.

**`src/app/(app)/trips/[tripId]/page-client.tsx:78`** — currently destructures `{ trip, days, unscheduledEvents, docs, packingItems, packingLists, reservations }` from `detail`. Add `expenses`.

**`src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`** — `TripBudgetTab` is rendered at line 196 with only `budget` and `onOpenEditBudget`. Add `expenses` prop.

**`src/components/packt/trip-budget-tab.tsx`** — currently a 66-line stub showing budget total/currency with an "Edit budget" button. The component must be rewritten to:
- Accept `expenses: Expense[]` prop
- Import `calculateActual` and `calculateCategoryBreakdown` from `@/lib/budget`
- Render the full actual-spend header + category tile grid
- Still support the "Set a budget" prompt for no-budget state
- Still support the "Edit budget" button for populated budget state

### Architecture compliance

- **Calculation logic in `lib/budget.ts` only** — neither `TripBudgetTab` nor `TripEditBudget` reimplements sum/breakdown math
- **Use `ExpenseCategory` const-object enum** — never hardcode category strings; import from `@/data/types`
- **`convertedAmountTrip` is the canonical field** — always use the Trip Currency conversion for the Budget tab's Actual figure; the original `amount` is only a fallback when conversion was never run (null conversion fields from pre-conversion entries)
- **Categories with 0 items are omitted** — matching both the epics spec and UX-DR5
- **CSS custom properties only** — no hardcoded hex colors; use `var(--fg)`, `var(--fg-3)`, `var(--surface)`, `var(--line)`, etc.
- **No zod** — inline validation only, matching existing conventions

### File structure requirements

**NEW files:**
| File | Purpose |
|------|---------|
| `src/lib/budget.ts` | `calculateActual()`, `calculateCategoryBreakdown()` |
| `src/lib/budget.test.ts` | Unit tests for budget calculations |

**MODIFIED files:**
| File | Change |
|------|--------|
| `src/data/types.ts` | Add `expenses: Expense[]` to `TripDetailPayload` |
| `src/lib/queries.ts` | Collect unlinked expenses + `dbExpenseToType()` mapping in `getTripDetail` return |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Destructure `expenses` and pass to tab body |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Accept `expenses` prop, pass to `TripBudgetTab` |
| `src/components/packt/trip-budget-tab.tsx` | Rewrite: actual spend header + category tile grid |
| `src/components/packt/trip-budget-tab.test.tsx` | Comprehensive new tests |
| `src/lib/queries.test.ts` | Add assertion that unlinked expenses appear in `getTripDetail` result |

### Library requirements

- No new npm packages
- `Expense` and `ExpenseCategory` types from `@/data/types`
- `calculateActual` / `calculateCategoryBreakdown` from `@/lib/budget`
- `cn()` from `@/lib/utils` for className merging
- date-fns during test setup for mock data (already in project)

### Key design decisions

- **All expenses passed, not just unlinked** — The `TripDetailPayload.expenses` field should include ALL trip expenses (linked + unlinked) so the Budget tab has one flat list to compute against. The events/reservations still carry their individual expense links for the cost-chip display.
- **Category tiles = the only chart primitive on the Budget tab** — per UX-DR13's explicit boundary: no charts on the per-trip Budget tab, only category tiles with figures. Charts live exclusively in Travel Retrospective's Spending view.
- **Trip Currency conversion always wins** — `convertedAmountTrip` is the authoritative spend figure per FR5. Only fall back to raw `amount` when conversion was never stored (null).
- **No percentage formatting or threshold logic** — this story shows raw figures only. Percentage-of-budget and threshold coloring land in Story 1.9.
- **Locale-aware currency formatting for the Actual figure** — follow the pattern already established in the existing `TripBudgetTab`'s `formatBudgetAmount()`: use `Intl.NumberFormat` with the trip's budget currency, fall back to code-prefixed string when formatting fails.

### Testing requirements

**`lib/budget.test.ts`:**
- `calculateActual([])` returns 0
- `calculateActual` sums `convertedAmountTrip` across multiple expenses
- `calculateActual` falls back to raw `amount` when `convertedAmountTrip` is null
- `calculateActual` ignores expenses with different currencies (the conversion is already done in `convertedAmountTrip`)
- `calculateCategoryBreakdown` groups by category and sums correctly
- `calculateCategoryBreakdown` filters out categories with 0 count
- `calculateCategoryBreakdown` returns items sorted by subtotal descending

**`trip-budget-tab.test.tsx` additions:**
- Renders Actual spent figure for converted expenses
- Renders category tiles with subtotals for multi-category expenses
- Shows "No expenses yet" for empty expenses array
- Shows Actual figure even without budget set (no-budget state)
- Hides Remaining/bar in no-budget state
- Existing budget-only tests still pass

**`queries.test.ts` additions:**
- `getTripDetail` returns unlinked expenses in the result payload

### Previous story intelligence (Story 1.3)

**Dev patterns established:**
- `budget/actions.ts` uses `assertTripAccess(tripId, user.id!, "editor")` on every action
- `revalidatePath(\`/trips/\${tripId}\`)` after every mutation
- Toast via `sonner`: `toast.error(message)`, `toast.success(message)`
- No new npm packages — native `fetch` for Frankfurter API
- `globalThis.__currencyCache` pattern for currency cache

**Review findings from Story 1.3 that apply here:**
- `dbExpenseToType` validates category against `ExpenseCategory` values, falls back to Misc — reuse this mapper; never map raw DB rows directly
- `TripDetailPayload` type changes are additive (adding a field) — test existing code doesn't break

**Testing patterns established:**
- Colocated `*.test.ts` files next to source
- `vi.fn()` for callback mocks
- `@testing-library/user-event` for interaction tests
- `describe`/`it` blocks (not `test`)

### References

- [Source: epics.md §Epic 1 Story 1.4] — ACs, user story, shared `lib/budget.ts`, category tiles
- [Source: architecture.md §Data Architecture] — expenses dual-conversion columns, numeric-string money fields
- [Source: architecture.md §Implementation Patterns] — `ExpenseCategory` enum, `dbExpenseToType()` usage, `lib/budget.ts` shared calculations
- [Source: architecture.md §Enforcement Guidelines] — route all expense reads through typed `Expense`/mapper layer
- [Source: architecture.md §Project Structure] — `TripDetailPayload` structure, file organization
- [Source: DESIGN.md §Components] — `category-tile` visual spec (fg-3 label, fg figure, border, rounded, min-width 120px, 2+ per row)
- [Source: EXPERIENCE.md §Component Patterns] — Budget header: big "Actual spent" figure, Budget + Remaining smaller beneath; no-budget-set state removes bar/badge/Remaining, shows "Set a budget" prompt; zero-entries: "No expenses yet"
- [Source: EXPERIENCE.md §State Patterns] — No-budget set (Actual-only, no bar/badge/Remaining); Zero Cost Entries ("No expenses yet", toolbar stays)
- [Source: EXPERIENCE.md §Voice and Tone] — "$3,760 spent" (not "You've spent..."); "No expenses yet" (not "Looks like you haven't...")
- [Source: project-context.md] — CSS custom properties, `cn()` convention, `"use client"` rule, file placement, type conventions

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story)

### Debug Log References

- `npx vitest run src/lib/budget.test.ts` — 9 passed
- `npx vitest run src/lib/queries.test.ts` — 5 passed
- `npx vitest run src/components/packt/trip-budget-tab.test.tsx` — 13 passed
- `npx tsc --noEmit` — clean

### Completion Notes List

- Added shared `src/lib/budget.ts` with `calculateActual` and `calculateCategoryBreakdown`; both accept `currency` (reserved for future use, `convertedAmountTrip` is already Trip Currency) and fall back to raw `amount` only when conversion is absent. Breakdown omits zero-count categories and sorts by subtotal descending.
- `TripDetailPayload.expenses` now carries ALL trip expenses (linked + unlinked), mapped through `dbExpenseToType()`; events/reservations keep their individual expense links unchanged.
- Threaded `expenses` through `page-client.tsx` → `trip-detail-tab-body.tsx` → `TripBudgetTab`. `page.tsx` required no change (passes `detail` through).
- Rewrote `TripBudgetTab`: large "Actual spent" figure (locale-aware, code-prefixed fallback), Budget + Remaining beneath when a budget exists, "Set a budget" prompt + hidden Remaining in the no-budget state, category tile grid (auto-fill `minmax(140px, 1fr)` → 2+ per row), and "No expenses yet" empty state with the toolbar still visible. Display currency resolves from `budget.currency`, falling back to expense `convertedCurrencyTrip`/`currency`.
- `TripEditBudget` has no read-only spend summary and performs no spend math, so AC4's "neither reimplements the math" holds without changes there.
- No new E2E flow: `trip-budget-tab.tsx` already maps to the `trips` feature; expense creation/budget flows are pre-existing and the new display is derived state covered by unit tests.

### File List

- `_bmad-output/implementation-artifacts/1-4-track-actual-spend-category-breakdown.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/lib/budget.ts`
- `src/lib/budget.test.ts`
- `src/data/types.ts`
- `src/lib/queries.ts`
- `src/lib/queries.test.ts`
- `src/app/(app)/trips/[tripId]/page-client.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`
- `src/components/packt/trip-budget-tab.tsx`
- `src/components/packt/trip-budget-tab.test.tsx`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx`
- `src/app/(app)/trips/[tripId]/page.test.tsx`
- `src/app/(app)/trips/[tripId]/page-client.test.tsx`

### Review Findings

- [x] [Review][Patch] NaN propagates to render as "NaN" in `formatCurrencyAmount` [trip-budget-tab.tsx:39] — fixed: added `Number.isFinite` guard before formatting.
- [x] [Review][Patch] Overspent budget renders negative remaining with zero test coverage [trip-budget-tab.test.tsx] — fixed: added test for overspent state.
- [x] [Review][Patch] `resolveTripCurrency` may misrepresent trip currency when budget has total but no currency [trip-budget-tab.tsx:44] — fixed: `hasBudget` now checks `!!budget.currency`.
- [x] [Review][Defer] Currency label mismatch when expenses lack conversion data — deferred, pre-existing design constraint (spec explicitly falls back to raw amount for unconverted entries).
- [x] [Review][Defer] `convertedCurrencyTrip` first-match assumption with no consistency check — deferred, low probability, minor impact.
- [x] [Review][Defer] `CategoryBreakdownEntry.count` computed but never surfaced in UI — deferred, harmless future-proofing.

### Change Log

- 2026-06-26: Implemented Story 1.4 — shared `lib/budget.ts` calculations, `expenses` threaded through `TripDetailPayload`, and `TripBudgetTab` rewritten for actual spend + category breakdown. Status → review.
- 2026-06-26: Code review — 3 patch findings, 3 deferred, 9 dismissed.
