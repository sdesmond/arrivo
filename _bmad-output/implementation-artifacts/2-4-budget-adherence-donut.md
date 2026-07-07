---
baseline_commit: ba27b83
---

# Story 2.4: Budget Adherence Donut

Status: in-progress

## Story

As a user,
I want to see how many of my trips came in under, on, or over budget,
So that I can gauge my overall budgeting accuracy across all my travel.

## Acceptance Criteria

1. **3-segment donut renders under/on/over counts** — When the Spending view has filtered data with `budgetAdherence` entries, a `chart-card` wrapping a `donut-chart` shows 3 segments — under budget (`var(--accent-brand)`), on budget (`var(--warning)`), over budget (`var(--destructive)`) — counting how many filtered trips fall in each band, centered on total trip count ("4 Trips" / "1 Trip", singular/plural handled) (FR17, UX-DR21, UX-DR23).

2. **"On budget" = ±2% band** — "On budget" means each trip's Actual/Budget percentage falls within ±2% of 100% (i.e. spendPercentage >= 98% and spendPercentage <= 102%). This means `buildSpendingSummary()` in `src/lib/spending.ts` MUST be updated from its current `< 100 / === 100 / > 100` classification to use the ±2% band.

3. **Caption explains ±2% band** — A caption or legend note states "on budget means within 2% of the budget total" — the band isn't self-evident from the chart alone (UX-DR23).

4. **Trips without budget excluded** — Filtered trips with no budget set are excluded from the count entirely (FR17). No zero-budget segment, no error state for missing budget.

5. **Accessibility** — Root SVG/PieChart element carries `role="img"` + a data-summarizing `aria-label` (e.g. "Budget adherence donut chart: Under budget 4 trips, On budget 2 trips, Over budget 1 trip") independent of on-screen legend text (UX-DR27). Same pattern as `CategoryBreakdownDonut` and `DestinationBreakdownDonut`.

6. **Integrated into Spending view** — The budget adherence donut renders inside the `<section aria-live="polite">` area of `spending-view.tsx`, inside its own `chart-card`, as a third item in the same `repeat(auto-fit, minmax(360px, 1fr))` grid as the category and destination donuts (not as a separate full-width card below — adjusted during implementation per user review of the rendered layout, see Dev Agent Record).

## Tasks / Subtasks

### 1. Fix budget adherence calculation in buildSpendingSummary (AC: 2)

- [x] **`src/lib/spending.ts`** — MODIFY the `buildSpendingSummary` budget adherence logic
  - Change the per-trip classification from the current `< 100 / === 100 / > 100` to:
    - `spendPercentage < 98` → `underBudget += 1`
    - `spendPercentage >= 98 && spendPercentage <= 102` → `onBudget += 1`
    - `spendPercentage > 102` → `overBudget += 1`
  - The existing `budgetTotal != null && budgetTotal > 0` guard stays unchanged (trips without budget still excluded)
  - `budgetAdherence` return shape `{ underBudget: number; onBudget: number; overBudget: number }` is unchanged — this is a classification change only

- [x] **`src/lib/spending.test.ts`** — MODIFY existing test and add new tests
  - Modify `"budgetAdherence counts under/on/over using trip spend vs budget total"` — the existing test data (trip-under: 100/200=50%, trip-on: 100/100=100%, trip-over: 100/50=200%) still produces under=1, on=1, over=1 under the ±2% rule (50% is under, 100% is on-budget within ±2%, 200% is over) — but update the test title/description to reference the ±2% band
  - Add: "classifies trips with spend between 98% and 102% as on budget" — test boundary values: 97.9% → under, 98% → on, 102% → on, 102.1% → over
  - Add: "still excludes trips without a budget from adherence count" — pre-existing test, confirm it still passes

### 2. Build budget-adherence-donut component (AC: 1, 3, 5)

- [x] **`src/components/packt/budget-adherence-donut.tsx`** — NEW
  - `"use client"`
  - Props:
    ```ts
    export interface BudgetAdherenceDonutProps {
      data: { underBudget: number; onBudget: number; overBudget: number };
    }
    ```
  - Computes sorted segments from `data` (largest first by count): builds `DonutChart` data array with 3 fixed entries:
    - `{ name: "Under budget", value: underBudget, color: "var(--accent-brand)" }`
    - `{ name: "On budget", value: onBudget, color: "var(--warning)" }`
    - `{ name: "Over budget", value: overBudget, color: "var(--destructive)" }`
  - Colors match UX DESIGN.md `budget-adherence-donut` spec: under=`var(--accent-brand)`, on=`var(--warning)`, over=`var(--destructive)` — these are fixed 1:1 semantic mappings, NOT palette-cycling
  - Generates `accessibleLabel` summarizing all segments: `"Budget adherence donut chart: Under budget ${underBudget} ${plural}, On budget ${onBudget} ${plural}, Over budget ${overBudget} ${plural}"`
  - Center figure = trip count summary (e.g. "7 Trips" / "1 Trip") — `DonutChart`'s `centerFigure` and `centerLabel`. Center figure shows total count (under+on+over). Center label = "Trips" if total !== 1, else "Trip".
  - Renders inside `chart-card` wrapping `donut-chart`
  - Include a caption element below the donut (below the legend, inside the chart-card) reading: "On budget means within 2% of the budget total" — styled small, `fg-3` color, no decorative icon (UX-DR23).

### 3. Update spending-view.tsx — integrate budget adherence donut (AC: 6)

- [x] **`src/components/packt/spending-view.tsx`** — MODIFY
  - Import `BudgetAdherenceDonut`
  - Add budget adherence donut as a third item inside the existing `repeat(auto-fit, minmax(360px, 1fr))` grid, alongside category + destination donuts, inside the `<section aria-live="polite">` when `hasTripsInRange`
  - Pass `initialSummary.budgetAdherence`
  - When `!hasTripsInRange`, the entire chart area (including budget adherence) is replaced by "No trips in the selected range"

### 4. Register new components in feature-map.mjs (CI gate)

- [x] **`tests/e2e/feature-map.mjs`** — MODIFY
  - Add new file paths to the existing `spending` entry's glob list:
    - `src/components/packt/budget-adherence-donut.tsx`

### 5. Unit tests (AC: 1, 2, 3, 5)

- [x] **`src/components/packt/budget-adherence-donut.test.tsx`** — NEW
  - "renders 3 segments: Under budget, On budget, Over budget"
  - "Under budget segment uses var(--accent-brand) color"
  - "On budget segment uses var(--warning) color"
  - "Over budget segment uses var(--destructive) color"
  - "segments sorted largest count first"
  - "generates accessibleLabel summarizing all 3 segments"
  - "renders center figure showing total trip count with plural/singular label"
  - "shows caption explaining ±2% on-budget band"
  - "renders inside chart-card wrapper"
  - "all-zero data still renders 3 segments with center figure '0 Trips'"

- [x] **`src/components/packt/spending-view.test.tsx`** — MODIFY
  - "renders budget adherence donut when summary has budget adherence data with non-zero counts"
  - "still shows 'No trips in the selected range' when no data"

### 6. E2E scenarios — budget adherence donut (AC: 1, 4)

- [x] **`tests/e2e/features/spending.feature`** — MODIFY
  - Add scenario: Spending view with trips spanning under/on/over budget → budget adherence donut renders 3 visible segments with correct counts
  - Add scenario: Trips without budget set → excluded from adherence count
- [x] **`tests/e2e/steps/spending.steps.ts`** — MODIFY — step definitions for new scenarios

## Dev Notes

### Architecture compliance

- **All aggregation comes from `buildSpendingSummary()`** (Story 2.1) — `BudgetAdherenceDonut` receives pre-computed `budgetAdherence` from `initialSummary`, never queries or re-aggregates itself (architecture Enforcement Guideline)
- **`budgetAdherence` data shape** — from `src/lib/spending.ts::buildSpendingSummary`:
  ```ts
  { underBudget: number; onBudget: number; overBudget: number }
  ```
  - `underBudget` = trips where spendPercentage < 98% (after this story's fix)
  - `onBudget` = trips where 98% <= spendPercentage <= 102%
  - `overBudget` = trips where spendPercentage > 102%
- **CRITICAL CHANGE: `buildSpendingSummary` budget adherence fix** — The current implementation in `spending.ts` line 100-108 uses `< 100 / === 100 / > 100` classification. This must be updated to ±2% band per FR17. The return shape stays the same; only the classification thresholds change. Existing test for budget adherence (line 99) happens to still pass since the test uses values at 50%/100%/200% that don't cross the ±2% boundaries — but this is a coincidence, NOT evidence that the current code satisfies FR17.
- **Fixed 1:1 segment colors** — Unlike category and destination donuts (which use cycling `--chart-N` palette tokens), the budget adherence donut uses 3 fixed semantic colors: `var(--accent-brand)` for under, `var(--warning)` for on, `var(--destructive)` for over. These **MUST NOT** use palette cycling — the mapping is semantic per UX DESIGN.md `budget-adherence-donut` spec.
- **`role="img"` + `aria-label` on every chart** — architecture Enforcement Guideline, same as category/destination donuts. Leverage `DonutChart`'s built-in `accessibleLabel` prop.
- **`formatCurrency` NOT used for center value** — The budget adherence donut centers on trip count, not currency amount. The `DonutChart`'s `centerFigure` shows "X Trips" / "1 Trip". A custom `formatCount` or inline formatting handles singular/plural — NOT `formatCurrency`.

### Existing code state — read before editing

**`src/components/packt/spending-view.tsx`** (71 lines) — Currently renders inside the chart `<section>`:
```tsx
<section aria-live="polite">
  {hasTripsInRange ? (
    <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
      <CategoryBreakdownDonut ... />
      <DestinationBreakdownDonut ... />
    </div>
  ) : (
    <p style={{ color: "var(--fg-2)" }}>No trips in the selected range</p>
  )}
</section>
```
Must add `BudgetAdherenceDonut` after the closing `</div>` inside the `hasTripsInRange` branch, below the existing donuts grid, as a standalone `ChartCard` (not part of the grid).

**`src/lib/spending.ts`** (124 lines) — `buildSpendingSummary()` returns `budgetAdherence`. Current budget adherence logic at lines 99-109:
```ts
const budgetTotal = trip.budget?.total;
if (budgetTotal != null && budgetTotal > 0) {
  const spendPercentage = (tripSpend / budgetTotal) * 100;
  if (spendPercentage < 100) {
    underBudget += 1;
  } else if (spendPercentage === 100) {
    onBudget += 1;
  } else {
    overBudget += 1;
  }
}
```
Must change thresholds to `< 98`, `>= 98 && <= 102`, `> 102`. The simplest implementation:
```ts
if (spendPercentage < 98) {
  underBudget += 1;
} else if (spendPercentage <= 102) {
  onBudget += 1;
} else {
  overBudget += 1;
}
```

**`src/data/types.ts`** — `SpendingSummary.budgetAdherence` type already matches `{ underBudget: number; onBudget: number; overBudget: number }`. No changes needed.

**`src/components/packt/donut-chart.tsx`** (80 lines) — Shared base already handles `role="img"` + `aria-label`, centered figure, legend below. No changes needed. The `centerFigure` and `centerLabel` props are used for the trip count display — `centerFigure` = "7", `centerLabel` = "Trips" (or "Trip" for singular).

**`src/components/ui/chart-card.tsx`** (33 lines) — Exists from Story 2.2. Simple bordered/rounded/padded wrapper. No changes needed. Supports optional `title` prop added in Story 2.3 (displayed as `<h3>`).

**`src/lib/budget.ts`** (170 lines) — Has `calculateBudgetStatus()` but this function computes warning/danger threshold states (used by the per-trip Budget tab status), NOT the under/on/over budget adherence classification for the Spending view. Do NOT confuse the two — the Spending view's ±2% classification is computed within `buildSpendingSummary()` directly, NOT by calling `calculateBudgetStatus()`.

**`tests/e2e/feature-map.mjs`** (165 lines) — Has `spending` entry from Story 2.1/2.2/2.3. Must extend with new component path.

### What must be preserved

- **Existing Spending view behavior** — Date filter, headline figures, zero-trips state, "No trips in selected range" state, category donut, and destination donut must continue working exactly as before
- **No per-chart re-query** — The budget adherence donut receives pre-computed data; no chart component independently queries or aggregates
- **`chart-card` is generic** — Same shared component used by category/destination donuts; no Spending-specific coupling. Use optional `title="Budget Adherence"` prop for the card heading
- **`DonutChart` shared base** — Must remain generic for all 3 donut types. This is the third and final consumer; no changes needed to `DonutChart`
- **Segment order** — "Under budget", "On budget", "Over budget" in sorted order (largest count first), matching the convention established by category/destination donuts. The `DonutChart` sorts segments client-side by `value` descending
- **FR17 exclusion rule** — Trips with no budget set are excluded from all 3 counts, matching existing behavior

### Previous story intelligence (Story 2.3)

**Key patterns to follow:**
- New components in `src/components/packt/` with colocated `.test.tsx`
- `cn()` from `@/lib/utils` for className merging
- CSS custom properties for colors, no hardcoded hex
- Interactive elements meet `h-11` minimum sizing (WCAG 2.5.8) — chart elements intentionally NOT interactive per EXPERIENCE.md
- New components must be registered in `tests/e2e/feature-map.mjs` or CI will fail
- E2E scenarios must use scenario-owned fixture creation — no shared state between scenarios
- Build new E2E trip/expense data using the existing `createTrip`/`ExpenseSeed` mother helpers in `tests/e2e/e2e-seed-data.ts`

**Key findings that apply here:**
- `DonutChart` passes `role="img"` + `aria-label` as a container `<div>` wrapping the PieChart (not directly on `<PieChart>`)
- Recharts renders fine in jsdom unit tests via shadcn's `ChartContainer` (which uses `initialDimension` fallback when `ResizeObserver` absent) — no extra test setup needed
- `packt-build-validator` uses `NEXT_DISTDIR=.next-validate` — won't collide with dev server
- `strokeWidth={2}` on `Pie` with `stroke={segment.color}` on each `Cell` prevents white gaps between segments
- `outerRadius="90%"` (not `"100%"`) prevents clipping at container edges
- Legend wrapped in same `role="img"` container with `aria-hidden` on the legend — both chart and legend hidden behind one accessible name
- `formatCurrency` callback wrapped in `useCallback` in the parent — NOT applicable here (budget adherence donut uses count, not currency)

**Key review findings from Story 2.3 that apply here:**
- Story 2.3 code review found a grid layout issue when a donut renders null — resolved by using CSS grid `repeat(auto-fit, minmax(360px, 1fr))`, which handles variable child counts gracefully. Budget adherence donut lives OUTSIDE this grid (it's a full-width card below), so this doesn't apply.

### Library requirements

- `@/components/packt/donut-chart` — shared donut base (exists from Story 2.2)
- `@/components/ui/chart-card` — shared bordered card wrapper (exists from Story 2.2)
- `@/components/ui/chart` — shadcn chart primitive (exists from Story 2.2)
- `@/lib/utils` — `cn()`
- `@/data/types` — `SpendingSummary`
- `lucide-react` — no new icons needed for this story

### Testing requirements (coverage ≥95% lines/functions, ≥90% branches)

**`src/components/packt/budget-adherence-donut.test.tsx`** — NEW:
- "renders 3 segments: Under budget, On budget, Over budget"
- "segments sorted largest count first"
- "Under budget uses var(--accent-brand) color"
- "On budget uses var(--warning) color"
- "Over budget uses var(--destructive) color"
- "generates accessibleLabel summarizing all segments with counts"
- "center figure shows total with 'Trips' plural (total !== 1)"
- "center figure shows '1 Trip' singular (total === 1)"
- "caption explains ±2% on-budget band"
- "renders inside chart-card wrapper"
- "all-zero data renders with center figure '0 Trips'"

**`src/lib/spending.test.ts`** — MODIFY:
- Existing `"budgetAdherence counts under/on/over using trip spend vs budget total"` — update test description to reference ±2%; test data (50%/100%/200%) is unchanged since these values don't cross the new boundaries
- New: `"classifies spend at 97.9% as under budget (below 98% threshold)"`
- New: `"classifies spend at 98% as on budget (within ±2%)"`
- New: `"classifies spend at 102% as on budget (within ±2%)"`
- New: `"classifies spend at 102.1% as over budget (above 102% threshold)"`
- Existing `"budget adherence excludes trips without a budget"` — unchanged

**`src/components/packt/spending-view.test.tsx`** — MODIFY:
- "renders budget adherence donut when summary has non-zero budget adherence data"
- "still shows 'No trips in the selected range' when no data" — existing test covers this for the section

**E2E scenarios (spending.feature additions):**
- Budget adherence donut renders 3 segments with correct counts when trips span under/on/over budget categories
- Trips with no budget set are excluded from donut appearance

### File structure requirements

| File | Change |
|------|--------|
| `src/components/packt/budget-adherence-donut.tsx` | NEW — budget adherence donut component |
| `src/components/packt/budget-adherence-donut.test.tsx` | NEW — unit tests |
| `src/lib/spending.ts` | MODIFY — fix budget adherence to ±2% band |
| `src/lib/spending.test.ts` | MODIFY — add ±2% boundary tests |
| `src/components/packt/spending-view.tsx` | MODIFY — integrate budget adherence donut below existing grid |
| `src/components/packt/spending-view.test.tsx` | MODIFY — extend tests for budget adherence donut |
| `tests/e2e/features/spending.feature` | MODIFY — budget adherence donut scenarios |
| `tests/e2e/steps/spending.steps.ts` | MODIFY — step definitions |
| `tests/e2e/feature-map.mjs` | MODIFY — extend `spending` entry with new component path |

### Review Findings

#### Patch

- [x] [Review][Patch] Add rounding guard on percentage comparison to prevent floating-point drift at +/-2% boundaries [`src/lib/spending.ts:100`]
- [x] [Review][Patch] Fix garbled `+/-` character encoding in test descriptions [`src/lib/spending.test.ts:96,103,112`]
- [x] [Review][Patch] Isolate center-figure tspan queries with a data attribute to avoid fragile selector [`src/components/packt/budget-adherence-donut.test.tsx`]
- [ ] [Review][Patch] Add secondary sort criterion (by name) for deterministic tiebreaking when segment counts are equal [`src/components/packt/budget-adherence-donut.test.tsx`]

#### Deferred

- [x] [Review][Defer] No floating-point boundary test values — pre-existing concern, coverage otherwise solid [`src/lib/spending.test.ts`]

## Dev Agent Record

### Agent Model Used

Claude (claude-sonnet-4-6)

### Debug Log References

### Completion Notes List

- `buildSpendingSummary()` budget adherence classification changed from `< 100 / === 100 / > 100` to `< 98 / 98-102 / > 102` (±2% band); existing 50%/100%/200% test data unaffected, added 4 new boundary tests (97.9%, 98%, 102%, 102.1%).
- New `BudgetAdherenceDonut` component follows the same pattern as `CategoryBreakdownDonut`/`DestinationBreakdownDonut` but with fixed semantic colors (not palette-cycling) and a count-based (not currency) center figure + explanatory caption.
- **Deviation from story spec (AC6/Task 3):** per direct user review of the rendered Spending view, the budget adherence donut was placed as a third item inside the existing `repeat(auto-fit, minmax(360px, 1fr))` grid alongside the category/destination donuts, rather than as a separate full-width card below the grid as originally specified. The story's AC6 and Task 3 text were updated to reflect this. All other behavior (chart-card wrapping, accessibility, exclusion rules) is unchanged.
- Extended the E2E trip mother/materializer (`TripSeed.budgetCurrency`/`budgetTotal`, `scenario-fixture.ts` trip insert) since no prior E2E scenario needed to seed a trip budget.
- Added 2 new E2E scenarios: under/on/over budget trips render correct donut counts; a trip with no budget is excluded (all-zero donut).
- Full validator run (lint, tsc, coverage, full E2E, build) passed: coverage 94.67%/90.13%/96.23%/96.02% (statements/branches/functions/lines), 168/168 E2E scenarios passed.

### File List

- `src/lib/spending.ts` — MODIFY
- `src/lib/spending.test.ts` — MODIFY
- `src/components/packt/budget-adherence-donut.tsx` — NEW
- `src/components/packt/budget-adherence-donut.test.tsx` — NEW
- `src/components/packt/spending-view.tsx` — MODIFY
- `src/components/packt/spending-view.test.tsx` — MODIFY
- `tests/e2e/feature-map.mjs` — MODIFY
- `tests/e2e/e2e-seed-data.ts` — MODIFY (added `budgetCurrency`/`budgetTotal` to `TripSeed`)
- `tests/e2e/scenario-fixture.ts` — MODIFY (materialize trip budget fields)
- `tests/e2e/features/spending.feature` — MODIFY
- `tests/e2e/steps/spending.steps.ts` — MODIFY

### Change Log

- 2026-06-28: Implemented Story 2.4 — ±2% budget adherence classification fix, new `BudgetAdherenceDonut` component, Spending view integration (in-grid placement per user review), feature-map registration, E2E budget seed support + scenarios. Full validator passed.
