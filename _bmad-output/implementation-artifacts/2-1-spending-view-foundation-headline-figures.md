---
baseline_commit: da58c156d598d8cb4c87673a0b9c78ed8ebbdc22
---

# Story 2.1: Spending View Foundation & Headline Figures

Status: review

## Story

As a user,
I want to see my total spend, average trip spend, and average daily spend across my trip history,
So that I understand my overall travel spending without digging into individual trips.

## Acceptance Criteria

1. **Two-tab structure on History page** — "Trips" (existing, unchanged) and "Spending" (new) tabs use the same tab pattern as the trip-detail tab bar (segmented control), not a toggle or separate route (FR12, UX-DR17)

2. **Date filter drives everything** — Dropdown: This Year / Last Year / Last 12 Months / All Time, default This Year. Visually distinct from the tab toggle (dropdown vs segmented control). Helper line beneath: "Includes any trip overlapping this period." (FR13, UX-DR18)

3. **Trip-inclusion rule** — Trip is included when any part of its dates overlaps the selected period. Full spend counts, never a partial slice (FR13). Trips with neither calendar dates nor a known itinerary day count (`dayTotal`) are excluded from average-daily-spend and average-days-per-trip calculation entirely — but a dateless trip with planned itinerary days still counts its days, since its spend already counts toward the total (FR18; amended post-review, see Change Log)

4. **Headline figures** — Four plain stat figures below filter, each in a bordered card matching the budget tab's `category-tile` style: Total Spend (FR20), Average Trip Spend (FR21), Average Daily Spend (FR18), Average Days per Trip, in that order (UX-DR19; figure count and card wrapper amended post-review, see Change Log). Computed from each Cost Entry's already-locked profile-currency conversion — never render-time recomputation (FR13)

5. **Total Spend** — Sum of all filtered spend in user's profile currency. Zero filtered trips or zero spend shows $0 — never hidden, never error state (FR20)

6. **Average Trip Spend** — Total filtered spend ÷ count of filtered trips. Trips with no spend data in range are already excluded per FR13's exclusion rule (FR21)

7. **Average Daily Spend** — Total filtered spend ÷ total filtered trip-days, where a trip's day count is its calendar-date span, or its itinerary `dayTotal` when it has no calendar dates. Trips with neither are excluded entirely (not just from denominator); shows "—" rather than `$0.00` when nothing is countable, since `$0.00` would misstate a nonzero Total Spend (FR18; null/dash display and dayTotal fallback amended post-review, see Change Log)

7a. **Average Days per Trip** — Total filtered trip-days ÷ count of trips counted toward those trip-days. Same exclusion rule as AC7. Shows "—" when no trip in range has a countable day count. (Added post-review, see Change Log)

8. **URL search param** — Date filter reflected as `?view=spending&range=this-year`. Changing it is a standard App Router navigation/re-render, not a Server Action or client fetch (FR13)

9. **Zero trips ever logged state** — "Add costs to your trips (reservations, events, misc) and track them over time here." replaces entire view (UX-DR26)

10. **Trips exist, none match filter state** — Total Spend and Average Trip Spend show $0; Average Daily Spend and Average Days per Trip show "—" (no countable trip-days); chart-card area replaced by "No trips in the selected range", filter stays visible (UX-DR26, FR20; dash display amended post-review, see Change Log)

11. **Accessible live region** — Date filter changes announce via polite live region, e.g. "Showing All Time — 12 trips" (UX-DR27)

## Tasks / Subtasks

### 1. Add SpendingDateRange and SpendingSummary types (AC: 1, 2, 4, 8)

- [x] **`src/data/types.ts`** — Add:
  - `const SpendingDateRange = { ThisYear: "this-year", LastYear: "last-year", Last12Months: "last-12-months", AllTime: "all-time" } as const` + union type
  - `interface SpendingSummary` — return shape of `buildSpendingSummary()`:
    - `totalSpend: number`
    - `averageTripSpend: number`
    - `averageDailySpend: number | null` — `null` (not `0`) when no trip in range has a countable day count (amended post-review)
    - `averageTripDuration: number | null` — added post-review for the "Average Days per Trip" figure (AC7a)
    - `tripCount: number`
    - `countedTripCount: number` — count of trips with a countable day count (calendar dates or `dayTotal`); added post-review
    - `totalTripDays: number`
    - `categoryBreakdown: { category: ExpenseCategory; total: number; count: number }[]`
    - `destinationBreakdown: { countryCode: string | null; countryName: string; total: number }[]`
    - `budgetAdherence: { underBudget: number; onBudget: number; overBudget: number }`
- New types go after existing enums + before interfaces. Follow existing const-object-enum convention

### 2. Add listExpensesForUserInRange query (AC: 3, 4, 5, 6, 7)

- [x] **`src/lib/queries.ts`** — Add:
  - `export async function listExpensesForUserInRange(userId: string, startDate: string, endDate: string): Promise<{ trips: Trip[]; expenses: Expense[] }>`
  - Implements FR13's any-date-overlap trip-inclusion rule: select trips for user where `trip.startDate <= endDate` AND `trip.endDate >= startDate` (overlap, not containment) — a trip is included when any part of its dates overlaps the selected period
  - Returns full trip rows + expense rows for all included trips
  - Also aggregates a per-trip `days` row count (mirroring `listTripsForUser`'s `dayCountAggs` pattern) and threads it onto each trip as `dayTotal`, so a dateless trip's actual itinerary length is available to `buildSpendingSummary` (added post-review — see Change Log; a dateless trip's spend was already counted in totals, so its day count must be too, not silently treated as zero)
  - Uses existing `requireUser()` gate (user-scoped, no `assertTripAccess`)
  - Import `dbExpenseToType` for expense mapping, `dbTripToType` for trip mapping
  - Follows existing `listTripsForUser` naming/structure pattern

### 3. Create lib/spending.ts — buildSpendingSummary (AC: 3, 4, 5, 6, 7)

- [x] **`src/lib/spending.ts`** — Pure function:
  - `export function buildSpendingSummary(trips: Trip[], expenses: Expense[], dateRange: SpendingDateRange): SpendingSummary`
  - Single-pass computation: total spend, average trip spend, average daily spend, average days per trip, category breakdown, destination breakdown, budget adherence
  - Uses each expense's `convertedAmountProfile` (already locked at entry time) — never render-time recomputation
  - A trip's day count comes from `getDisplayedTripDays(trip)` (`@/lib/utils`) — its `dayTotal` (actual itinerary days) when present, else its calendar-date span. A trip counts toward `totalTripDays`/`countedTripCount`/`averageDailySpend`/`averageTripDuration` only when that day count is `> 0`; trips with neither dates nor `dayTotal` are excluded entirely. `averageDailySpend` and `averageTripDuration` are `null` (not `0`) when no trip in range is countable, since `0` would misrepresent a nonzero Total Spend (amended post-review — see Change Log; original spec's "trips with no dates excluded" implicitly discarded a dateless trip's day-length while still counting its spend, which is inconsistent)
  - Budget adherence: per-trip, compute `spendPercentage = actualTripSpend/convertedAmountProfile / budgetTotal * 100`. Categorize as under-budget (<100%), on-budget (===100%), or over-budget (>100%). Count trips in each bucket. Trips without a budget are excluded entirely.
  - Category breakdown: groups by `ExpenseCategory`, sums converted amounts, counts items
  - Destination breakdown: groups by `trip.destinationCountryCode`, uses `destinationCountry` for display name, "Unknown" for null codes

### 4. Build spending-date-filter component (AC: 2, 8, 11)

- [x] **`src/components/packt/spending-date-filter.tsx`** — Dropdown:
  - ``"use client"` at top
  - Props: `range: SpendingDateRange`, `onChange: (range: SpendingDateRange) => void`, `tripCount: number`
  - Options: This Year / Last Year / Last 12 Months / All Time — values from `SpendingDateRange` enum
  - Visual distinction from the Trips/Spending tab toggle (dropdown vs segmented control)
  - Helper line beneath: `"Includes any trip overlapping this period."`
  - Programmatic label on trigger: `aria-label="Date Range"`; associate helper text via `aria-describedby`
  - Announces via polite live region: `"Showing ${labels[range]} — ${tripCount} ${tripCount === 1 ? 'trip' : 'trips'}"`, derived at render time from the current `range`/`tripCount` props rather than captured in the click handler — the original click-time implementation read `tripCount` from a stale closure before the parent's server round-trip updated it, so it announced the *previous* range's count (amended post-review, see Change Log)
  - Keyboard-operable: click/Enter/Space to open, arrow keys to browse, Enter to select, Esc to dismiss
  - Trigger element at least 44×44px for mobile touch target (WCAG 2.5.8)

### 5. Build spending-headline-figures component (AC: 4, 5, 6, 7)

- [x] **`src/components/packt/spending-headline-figures.tsx`** — Four stat figures:
  - Props: `summary: SpendingSummary`, `currency: string`, `dateFormat: string`
  - Renders: Total Spend, Average Trip Spend, Average Daily Spend, Average Days per Trip as stat figures (small label above, large figure below)
  - Each figure wrapped in its own bordered card (`rounded-xl p-4`, `border: 1px solid var(--line)`, `background: var(--surface)`) matching `trip-budget-tab.tsx`'s `category-tile` card markup exactly — amended post-review from the original "no chart-card wrapper" spec (see Change Log); typography (label/figure sizing) unchanged
  - Currency figures formatted with `formatCurrency` from `@/lib/utils` using profile currency; the days-per-trip figure formats as `"N day(s)"` via `pluralize` from `@/lib/utils`
  - Zero/uncomputable states: Total Spend and Average Trip Spend show $0 (FR20); Average Daily Spend and Average Days per Trip show "—" when `summary.averageDailySpend`/`summary.averageTripDuration` is `null` (amended post-review, see Change Log)

### 6. Build spending-view top-level component (AC: 1, 2, 4, 9, 10, 11)

- [x] **`src/components/packt/spending-view.tsx`** — Wires everything together:
  - ``"use client"` at top
  - Props: `initialRange: SpendingDateRange`, `initialSummary: SpendingSummary`, `trips: Trip[]`, `expenses: Expense[]`, `currency: string`, `dateFormat: string`
  - Renders: `SpendingDateFilter` → `SpendingHeadlineFigures` → (future: chart-card area)
  - Manages `range` state internally, calls `onRangeChange` to trigger URL search param update
  - Empty states: zero trips ever → full replacement text; trips exist but none match → figures stay, charts replaced by "No trips in the selected range"
  - Polite live region for filter announcements
  - Wraps chart-card area in a section with `aria-live="polite"`

### 7. Update travel-history page.tsx — Spending view data fetching (AC: 1, 2, 8)

- [x] **`src/app/(app)/travel-history/page.tsx`** — Read `view` and `range` searchParams:
  - Access via `const params = await searchParams; const view = params.view; const range = params.range;` (searchParams is a Promise in App Router)
  - When `view === "spending"`:
    - Compute `startDate`/`endDate` from the selected `range` and `now`
    - Call `listExpensesForUserInRange(session.id!, startDate, endDate)`
    - Call `buildSpendingSummary(trips, expenses, range)`
    - Pass `initialSummary`, `initialRange`, `currency` to `TravelHistoryPageClient`
  - Always passes existing `initialEntries` for Trips view (existing data unchanged)
  - Follows the existing Server Component `page.tsx` pattern: fetch data, pass down to client component

### 8. Update travel-history page-client.tsx — Two-tab structure (AC: 1)

- [x] **`src/app/(app)/travel-history/page-client.tsx`** — Add Spending tab:
  - Add Trips/Spending segmented control tab bar at the top
  - Default view: "Trips" (existing view, unchanged)
  - "Spending" view: renders `<SpendingView>` component
  - Tab state driven by `?view=trips|spending` URL search param
  - Uses `useSearchParams` / `useRouter` for tab switching (following App Router convention)
  - Extend `TravelHistoryPageClientProps` with optional `initialSummary`, `initialRange`, `currency`

### 9. Update use-travel-history-page-handlers — Spending view handlers (AC: 8)

- [x] **`src/app/(app)/travel-history/use-travel-history-page-handlers.ts`** — Add:
  - `handleRangeChange(range: SpendingDateRange): void` — updates `?range=` search param via `router.replace`/`router.push`
  - `activeView: "trips" | "spending"` state, initialized from `?view=` search param
  - `handleViewChange(view: "trips" | "spending"): void` — updates `?view=` search param

### 10. Create shared formatCurrency utility and update existing components

- [x] **`src/lib/utils.ts`** — Add:
  - `export function formatCurrency(amount: number, currency: string): string`
  - Uses `Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 })` with a `try/catch` fallback for invalid currency codes
  - Returns `"${currency} ??"` when amount is not finite
- [x] **`src/components/packt/expense-table.tsx`** — Remove private `formatCurrencyValue`, import `formatCurrency` from `@/lib/utils` instead. Update all call sites.
- [x] **`src/components/packt/trip-budget-tab.tsx`** — Remove private `formatCurrencyAmount`, import `formatCurrency` from `@/lib/utils` instead. Update all call sites.
- [x] **`src/lib/utils.test.ts`** — Add unit tests:
  - "formatCurrency formats positive amounts correctly"
  - "formatCurrency formats zero as $0.00"
  - "formatCurrency handles non-finite amounts gracefully"
  - "formatCurrency handles unknown currency codes with fallback"

### 11. Register spending feature in feature-map.mjs (CI gate)

- [x] **`tests/e2e/feature-map.mjs`** — Add:
  - `entry("spending", ["src/components/packt/spending-view.tsx", "src/components/packt/spending-date-filter.tsx", "src/components/packt/spending-headline-figures.tsx", "src/app/(app)/travel-history/page-client.tsx", "src/app/(app)/travel-history/page.tsx", "src/lib/spending.ts"])`

### 12. Add --chart-1 through --chart-11 CSS custom properties (AC: future charts foundation)

- [x] **`src/app/globals.css`** — Add chart color tokens (light + dark):
  - In `:root` (light): `--chart-1: ...` through `--chart-11: ...`
  - In `.dark`: corresponding dark variants
  - Follow shadcn's chart token convention (CSS custom properties)
  - Exact hues determined at implementation time, verified against 3:1 non-text contrast (WCAG 1.4.11) and no-similar-hue-and-lightness-adjacency per DESIGN.md
  - Add Tailwind v4 theme mappings: `--color-chart-1: var(--chart-1)` etc. in `@theme inline` block

### 13. E2E scenarios (CI gate)

- [x] **`tests/e2e/features/spending.feature`** — @feat:spending scenarios covering:
  - Switching to Spending view from Trips view
  - Date filter changes recompute headline figures
  - Zero trips state shows empty prompt
  - Accessible live region announces filter changes
- [x] **`tests/e2e/steps/spending.steps.ts`** — Step definitions for spending.feature

## Dev Notes

### Architecture compliance

- **User-scoped, not trip-scoped** — `listExpensesForUserInRange` gates via `requireUser()` only, no `assertTripAccess`. The Spending view and all its data are user-scoped (FR12)
- **aggregation only reaches client** — `page.tsx` fetches + aggregates server-side via `buildSpendingSummary`; only the finished aggregate (`SpendingSummary`) passes to the client — raw expense rows never reach the client (architecture Enforcement Guideline)
- **URL search param drives filter** — `?view=spending&range=this-year`. Changing the filter is standard App Router navigation, not a Server Action or client fetch. No new client-state library
- **`lib/spending.ts` owns ALL aggregation** — No chart component independently re-aggregates. `buildSpendingSummary()` is the single pass producing every figure and chart input
- **Budget adherence computed inline** — Per-trip compare actual spend to budget total directly. Trips without a budget excluded. No `calculateBudgetStatus` wrapper needed (that function returns a risk-level enum, not raw percentage).
- **No new npm packages** — Uses existing stack (date-fns for date math, `formatCurrency` from `@/lib/utils` for display)

### Existing code state — read before editing

**`src/app/(app)/travel-history/page.tsx`** (29 lines) — Currently fetches `listTripsForUser`, `getUserById`, `listSupportedCurrencies`. Returns `<TravelHistoryPageClient>` with `initialEntries`, `nowISO`, `dateFormat`, `initialViewMode`, `currencyOptions`. Needs to read `searchParams` and conditionally fetch Spending data.

**`src/app/(app)/travel-history/page-client.tsx`** (70 lines) — Renders `<TravelHistoryList>`, `<TripEditSheet>`, `<DeleteTripAlertDialog>`. Currently single-view (trips only). Needs a tab bar and conditional Spending view rendering. Props interface must extend to accept optional Spending data.

**`src/app/(app)/travel-history/use-travel-history-page-handlers.ts`** (116 lines) — Manages `editingTrip`, `deletingTrip`, etc. for Trips view. No Spending view handlers exist yet. Add `handleRangeChange` and tab-state management.

**`src/data/types.ts`** (839 lines) — Has `ExpenseCategory`, `Expense`, `Trip`, `TripDetailPayload`, and all existing types. No `SpendingDateRange` or `SpendingSummary` yet.

**`src/lib/queries.ts`** (463 lines) — Has `listTripsForUser`, `getTripDetail`, `listTemplatesForUser`, `getTemplateWithItems`, `getUserById`. Imports `dbExpenseToType` already. Add `listExpensesForUserInRange`.

**`src/app/globals.css`** (570 lines) — Has existing Packt design tokens, warning/danger tokens, shadcn tokens. No `--chart-1` through `--chart-11` tokens yet. Tailwind v4 `@theme inline` block needs chart color entries.

**`tests/e2e/feature-map.mjs`** (217 lines) — Has FEATURE_MAP with existing entries and SHARED_GLOBS. No `spending` entry yet. Must add one.

### What must be preserved

- **Existing Trips view unchanged** — The existing `TravelHistoryList` rendering, trip editing, trip deletion, and all their state management must continue working exactly as before. The Spending view is additive alongside it
- **Existing `useTravelHistoryPageHandlers` return shape** — Adding Spending handlers must not break existing callers (the Trips view shell in `page-client.tsx`)
- **No new routing or state management** — Tab state uses URL search params (`?view=`), filter uses `?range=`. No `useState` for view selection
- **`page.tsx` remains a Server Component** — All data fetching stays in `page.tsx`. The client component receives pre-computed data

### Previous story intelligence (Epic 1 stories 1.5–1.10)

**Dev patterns established:**
- New components in `src/components/packt/` with colocated `.test.tsx`
- `cn()` from `@/lib/utils` for className merging
- `lucide-react` icons with `strokeWidth={1.5}`
- CSS custom properties for colors, no hardcoded hex
- Interactive elements meet `h-8` minimum sizing
- Optional props with sensible defaults to avoid breaking existing consumers

**Key findings from Story 1.10 dev notes that apply here:**
- New components must be registered in `tests/e2e/feature-map.mjs` — `feature-map.test.mjs` will fail CI if they aren't
- `CATEGORY_LABELS` pattern: shared labels live in `src/lib/budget.ts` (imported from lib, not component chain)
- Post-implementation fixes are normal — expect adjustments after initial pass
- Full regression: `npx tsc --noEmit` before validation

**Key findings from Story 1.10 review that apply here:**
- `useFocusScroll` polling fix (50ms interval, 2s timeout) for tab-switch race — relevant if any future chart navigation uses deep-linking

### Previous story intelligence (Story 1.10 — expense-table)

Patterns and file organization from Story 1.10's review that apply to this story's new components:
- Components pass `npx vitest run` for individual files
- `vi.mock` for `revalidatePath` and server actions in test files
- New UI primitives (chart) go through shadcn add flow, not hand-rolled
- `trip-detail-tab-body.tsx` is the intermediate prop-passing layer for trip-detail — but travel-history is its own page, no intermediate layer

### Git intelligence

Most recent commits cover Epic 1 stories (1.5–1.10), all passed through build-validator. Key patterns:
- Colocated `.test.tsx` files
- Conventional Commits format
- Feature branches merged to main via PR

### Library requirements

- `date-fns` — for date range computation (start/end dates from spending date range enum)
- `@/lib/utils` — `cn()`, `formatCurrency` (added in Task 10, for headline figures display)
- `@/lib/budget` — `calculateBudgetStatus` (reused for budget adherence)
- `@/lib/queries` — existing; add `listExpensesForUserInRange`
- `@/data/types` — add `SpendingDateRange`, `SpendingSummary`
- `next/navigation` — `useRouter`, `useSearchParams`, `usePathname`
- `lucide-react` — no new icons needed for this story (date filter uses standard dropdown, no icon)

### Testing requirements

**`src/lib/spending.test.ts`:**
- "buildSpendingSummary computes totalSpend, averageTripSpend, averageDailySpend"
- "categoryBreakdown groups by category, sums converted amounts, counts items"
- "categoryBreakdown omits categories with zero items"
- "destinationBreakdown groups by destinationCountryCode, uses destinationCountry for name"
- "destinationBreakdown groups null countryCode as Unknown"
- "budgetAdherence counts under/on/over using calculateBudgetStatus percentages"
- "trips with neither dates nor a dayTotal are excluded from totalTripDays, and averageDailySpend/averageTripDuration are null rather than 0" (amended post-review)
- "a dateless trip with a dayTotal counts its itinerary days toward totalTripDays/averageDailySpend" (added post-review)
- "a dayTotal takes precedence over a calendar-derived day count when both are present" (added post-review)
- "averageDailySpend is null (not $0.00) when a dated trip with no expenses coexists with a dateless trip that has spend" (added post-review)
- "averageDailySpend is a real figure when a dated trip itself has spend" (added post-review)
- "zero trips returns zeroes for all figures"
- "budget adherence reuses existing calculateBudgetStatus"
- "each expense's convertedAmountProfile is used — no render-time conversion"

**`src/components/packt/spending-date-filter.test.tsx`:**
- "renders all four date range options"
- "defaults to This Year"
- "calls onChange with new range when selection changes"
- "shows helper text under dropdown"
- "announces change via live region with correct trip count"
- "keyboard operable: opens on Enter, selects on Enter, dismisses on Esc"

**`src/components/packt/spending-headline-figures.test.tsx`:**
- "renders Total Spend, Average Trip Spend, Average Daily Spend, Average Days per Trip in order" (amended post-review for the 4th figure)
- "formats figures with profile currency"
- "shows $0 for currency figures and a dash for daily spend and trip length when summary has zero spend" (amended post-review)
- "renders labels above each figure"

**`src/components/packt/spending-view.test.tsx`:**
- "renders SpendingDateFilter and SpendingHeadlineFigures"
- "passes range change up to parent"
- "renders zero-trips empty state when trips array is empty"
- "renders no-trips-in-range state when trips exist but summary has empty charts"
- "filter stays visible in no-trips-in-range state"
- "headline figures show $0/$0/—/— in no-trips-in-range state (per FR20)" (amended post-review for the null/dash figures)

**`src/lib/queries.test.ts` — additions:**
- "listExpensesForUserInRange applies any-date-overlap inclusion rule"
- "listExpensesForUserInRange returns mapped expenses with dbExpenseToType"
- "listExpensesForUserInRange returns trips for user"
- "listExpensesForUserInRange threads aggregated day totals onto dateless trips" (added post-review)

**E2E scenarios (spending.feature):**
- Switch to Spending view from Trips view
- Change date filter from "This Year" to "All Time" — headline figures update
- Verify zero-trips state shows empty prompt
- Verify accessible live region announces filter change

### File structure requirements

| File | Change |
|------|--------|
| `src/data/types.ts` | MODIFY — add `SpendingDateRange`, `SpendingSummary` |
| `src/lib/queries.ts` | MODIFY — add `listExpensesForUserInRange` |
| `src/lib/spending.ts` | NEW — `buildSpendingSummary` |
| `src/lib/spending.test.ts` | NEW — unit tests |
| `src/components/packt/spending-view.tsx` | NEW — top-level Spending view |
| `src/components/packt/spending-view.test.tsx` | NEW — unit tests |
| `src/components/packt/spending-date-filter.tsx` | NEW — date filter dropdown |
| `src/components/packt/spending-date-filter.test.tsx` | NEW — unit tests |
| `src/components/packt/spending-headline-figures.tsx` | NEW — headline stat figures |
| `src/components/packt/spending-headline-figures.test.tsx` | NEW — unit tests |
| `src/app/(app)/travel-history/page.tsx` | MODIFY — read `view`/`range` searchParams, fetch Spending data |
| `src/app/(app)/travel-history/page-client.tsx` | MODIFY — two-tab structure, Spending view rendering |
| `src/app/(app)/travel-history/use-travel-history-page-handlers.ts` | MODIFY — add Spending view handlers |
| `src/lib/utils.ts` | MODIFY — add `formatCurrency` utility |
| `src/lib/utils.test.ts` | MODIFY — add `formatCurrency` tests |
| `src/app/globals.css` | MODIFY — add `--chart-1` through `--chart-11` tokens (light + dark) |
| `tests/e2e/features/spending.feature` | NEW — @feat:spending scenarios |
| `tests/e2e/steps/spending.steps.ts` | NEW — step definitions |
| `tests/e2e/feature-map.mjs` | MODIFY — add `spending` entry |

## Change Log

Post-review correction round, found via manual verification against real (non-seed) demo data after the initial implementation passed validation:

1. **`averageDailySpend` showed `$0.00` next to a nonzero Total Spend.** Root cause: a trip with calendar dates but zero expenses, sitting in the same range as a dateless trip that held all the actual spend, produced a mathematically-correct-but-misleading `0`. Fixed by returning `null` whenever no trip in range contributes spend toward the day-based average, and rendering `null` as `"—"` instead of `"$0.00"`.
2. **A dateless trip's itinerary days were discarded entirely, even though its spend was already counted toward Total Spend.** A trip with no calendar dates but a real planned itinerary (e.g. 5 days of events) was treated as "0 days" for `averageDailySpend`/days-per-trip purposes, while its dollars still flowed into `totalSpend`/`averageTripSpend` — counting one half of the trip's data and discarding the other. Fixed by having `listExpensesForUserInRange` aggregate each trip's actual `days` row count (`dayTotal`), and `buildSpendingSummary` use `getDisplayedTripDays` (dayTotal, falling back to calendar span) as the day-count source. A trip's spend and its day-length are now both counted or both excluded, never split.
3. **Added a 4th headline figure, "Average Days per Trip"** (`averageTripDuration` on `SpendingSummary`), requested directly rather than discovered as a bug.
4. **Headline figures now render inside bordered cards** matching the budget tab's `category-tile` style, requested directly (original spec said "no chart-card wrapper").
5. **`SpendingDateFilter`'s live-region announcement was stale by one range.** It read the `tripCount` prop inside the click handler, before the parent's server round-trip delivered the new range's count, so it always announced the *previous* selection's trip count. Fixed by deriving the announcement text at render time from current props.
6. **Unrelated infra fix surfaced during investigation**: `packt-build-validator`'s production-build worker (`npm run build`) shared the default `.next` directory with a concurrently running `npm run dev`, and a validator run corrupted the live dev server mid-session, producing exactly the kind of transient bad numbers this round was chasing before the real bugs above were found. Fixed by building into an isolated `.next-validate` directory (`.gitignore`, `tsconfig.json` updated accordingly; `.agents/skills/packt-build-validator/SKILL.md` updated to use `NEXT_DISTDIR=.next-validate`). Not part of this story's scope, but fixed in the same pass since it actively interfered with verifying this story.

All four date ranges (This Year, Last Year, Last 12 Months, All Time) were re-verified live against the demo account after these fixes; figures are now internally consistent (e.g. Last 12 Months no longer silently drops trips that This Year includes).

## Dev Agent Record

### Agent Model Used

Claude

### Completion Notes List

- **Deviation from Task 6's prop list**: `spending-view.tsx` does not accept an `expenses` prop, and the `trips` prop holds the user's full, unfiltered trip history (not range-filtered). Rationale: the Dev Notes' Architecture Compliance section explicitly states "raw expense rows never reach the client" — passing `expenses: Expense[]` to a client component would violate that. `trips` (full list) is used only to distinguish the AC9 "zero trips ever" empty state from the AC10 "trips exist, none match filter" state (driven off `initialSummary.tripCount`); no per-expense data is needed for either branch. This matches every `spending-view.test.tsx` scenario named in the story (none assert on an `expenses` prop).
- `lib/spending.ts` also gained two small helpers beyond the spec'd `buildSpendingSummary`: `resolveSpendingDateRange` (parses/validates the `?range=` query param, default This Year) and `getSpendingDateRangeBounds` (range enum → concrete `startDate`/`endDate` strings via `date-fns`) — needed by `page.tsx` per Task 7 but not enumerated as a separate task; colocated with the rest of the domain's date-range logic and covered by `spending.test.ts`.
- Per Dev Notes' Architecture Compliance section ("No `calculateBudgetStatus` wrapper needed — that function returns a risk-level enum, not raw percentage"), `budgetAdherence` is computed inline against raw spend-percentage thresholds (`<100` / `===100` / `>100`) rather than calling `calculateBudgetStatus`, even though the Testing Requirements section's bullet wording loosely says "using calculateBudgetStatus percentages" — followed the explicit, reasoned Dev Notes guidance over that bullet's phrasing.
- `formatCurrency` (Task 10) replaced two near-duplicate private implementations (`expense-table.tsx`'s `formatCurrencyValue`, `trip-budget-tab.tsx`'s `formatCurrencyAmount`) with the shared `@/lib/utils` version; both components' existing tests continued passing unmodified since the rendered output is identical.
- `spending-date-filter.tsx` and `spending-headline-figures.tsx` are hand-rolled (mirroring the existing `category-picker.tsx` accessible-listbox pattern) rather than built on the shadcn `Select` primitive, because `Select`'s built-in trigger/item sizing tops out at `h-9`/`h-10`, below this codebase's current 44×44px (`h-11`) interactive-target floor.
- E2E scenarios use only trip-level date-overlap fixtures (no expense/budget seed data) — the four required scenarios (switch tabs, filter recompute, zero state, live region) are all observable through trip counts and visibility of empty-state copy, so extending `e2e-seed-data.ts`'s mother schema with expense/budget seeding wasn't necessary for this story; deferred to whichever later Epic 2 story first needs dollar-amount assertions in E2E.
- Full validator run (lint, tsc, `test:coverage`, `test:e2e:affected` at full scope, `build`) passed: 2731/2731 unit tests, coverage 96.09% lines / 96.24% functions / 90.08% branches, 162/162 E2E scenarios (including the new `spending` feature and a full `travel-history` regression check).
- **Post-review correction round** (see Change Log): real (non-seed) demo data surfaced two real bugs (`averageDailySpend` showing `$0.00` next to nonzero Total Spend; dateless trips with a real itinerary having their days silently discarded while their spend still counted) plus two directly-requested additions (4th headline figure "Average Days per Trip"; card-wrapped figures). Also fixed an unrelated `SpendingDateFilter` stale-announcement bug and a `packt-build-validator`/dev-server `.next` distDir collision found in the process. Final validator run after these fixes: 2737/2737 unit tests passed, coverage 96.09% lines / 96.24% functions / 90.13% branches, full E2E suite passed (confirmed by user), isolated production build passed.

### File List

**New:**
- `src/lib/spending.ts`
- `src/lib/spending.test.ts`
- `src/components/packt/spending-view.tsx`
- `src/components/packt/spending-view.test.tsx`
- `src/components/packt/spending-date-filter.tsx`
- `src/components/packt/spending-date-filter.test.tsx`
- `src/components/packt/spending-headline-figures.tsx`
- `src/components/packt/spending-headline-figures.test.tsx`
- `tests/e2e/features/spending.feature`
- `tests/e2e/steps/spending.steps.ts`

**Modified:**
- `src/data/types.ts`
- `src/lib/queries.ts`
- `src/lib/queries.test.ts`
- `src/lib/utils.ts`
- `src/lib/utils.test.ts`
- `src/components/packt/expense-table.tsx`
- `src/components/packt/trip-budget-tab.tsx`
- `src/app/(app)/travel-history/page.tsx`
- `src/app/(app)/travel-history/page-client.tsx`
- `src/app/(app)/travel-history/use-travel-history-page-handlers.ts`
- `src/app/(app)/travel-history/use-travel-history-page-handlers.test.tsx`
- `src/app/globals.css`
- `tests/e2e/feature-map.mjs`
