---
baseline_commit: fec1ac9fc8d7d38defd1d63ddc733c9ee5bf54ab
---

# Story 2.2: Category Breakdown Donut

Status: review

## Story

As a user,
I want to see my spend broken down by category across all my trips,
So that I know where my travel money actually goes.

## Acceptance Criteria

1. **Chart card + donut base infrastructure** — New shared `chart-card` (bordered, rounded, padded card matching `field-row`'s treatment per UX-DR20) and `donut-chart` base (centered figure + legend below, per UX-DR21) must exist before any chart can render. The `donut-chart` base accepts configurable center figure (total spend or trip count) and a legend.

2. **Category donut renders** — When the Spending view has filtered data with `categoryBreakdown` entries, a `chart-card` wrapping a `donut-chart` showing one segment per `ExpenseCategory` present, sized by category subtotal, centered on total category-tagged spend (FR15). Segments render as a donut (pie with hole) via Recharts `PieChart` + `Cell` with a centered `<text>` node inside the ring.

3. **Chart color palette** — Uses `--chart-1` through `--chart-11` CSS custom properties (light + dark, already defined in `globals.css` from Story 2.1) mapped to `ExpenseCategory` in stable order (Food→chart-1, Lodging→chart-2, Transport→chart-3, Activity→chart-4, Sightseeing→chart-5, Gas→chart-6, Groceries→chart-7, Flights→chart-8, CarRental→chart-9, Shopping→chart-10, Misc→chart-11). Every adjacent segment pair must clear 3:1 non-text contrast (WCAG 1.4.11).

4. **Direct segment labels where space allows** — Segments show labels directly on/near the segment arc if the segment share is large enough; small segments fall back to legend + tooltip (UX-DR22). Color is secondary to label/legend text.

5. **Accessibility** — Root SVG/PieChart element carries `role="img"` + a data-summarizing `aria-label` (e.g. "Category breakdown donut chart: Lodging $1,200, Food $640...") independent of on-screen legend text (UX-DR27, architecture Enforcement Guideline). Legend text is the primary signal, color is secondary.

6. **Zero-item categories omitted** — Categories with zero spend in the filtered range are not rendered as segments (FR15 → FR-6 consistency).

7. **Integrated into Spending view** — The category donut renders inside the `<section aria-live="polite">` area of `spending-view.tsx`, inside its own `chart-card`, below `SpendingHeadlineFigures` and above the future destination/budget-adherence chart slots.

## Tasks / Subtasks

### 1. Install shadcn chart primitive (AC: 1)

- [x] Run `npx shadcn@latest add chart` to install `src/components/ui/chart.tsx` (Recharts-based, shadcn-themed) — confirmed available in the project's `@shadcn` registry
- [x] No separate card install needed — `src/components/ui/card.tsx` already exists

### 2. Build shared chart-card component (AC: 1)

- [x] **`src/components/ui/chart-card.tsx`** — NEW
  - Props: `children: ReactNode`, optional `className`
  - Bordered, rounded, padded wrapper (matching `field-row`'s card treatment per DESIGN.md):
    - `background: var(--surface)`, `border: 1px solid var(--line)`, `border-radius: var(--radius-lg)`, `padding: var(--spacing-4)` (i.e., `className="rounded-xl border p-4"` with `style={{ background: "var(--surface)", borderColor: "var(--line)" }}`)
  - Renders its children inside the card — no heading, no title prop; this story's chart provides its own label/signal via legend and accessible name
- [x] **`src/components/ui/chart-card.test.tsx`** — NEW
  - "renders children inside bordered card"
  - "applies custom className"

### 3. Build shared donut-chart base component (AC: 1)

- [x] **`src/components/packt/donut-chart.tsx`** — NEW
  - `"use client"`
  - Props:
    ```ts
    export interface DonutChartProps {
      data: { name: string; value: number; color: string }[];
      centerFigure: string;
      centerLabel?: string;
      formatValue?: (value: number) => string;
      accessibleLabel: string;
    }
    ```
  - Renders a Recharts `PieChart` with `Pie` + `Cell` for each segment, inner radius ~60% of outer (creating the donut hole)
  - Center text: `<text>` SVG element inside the `PieChart` (true text node, never image/canvas per UX-DR27) showing `centerFigure` (large) and optional `centerLabel` (smaller, `fg-3` color)
  - Legend rendered below the chart as a `<div>` grid or flex list, matching `chart-card`'s width
  - Root element of the chart SVG carries `role="img"` + `aria-label={accessibleLabel}` per DESIGN.md `donut-chart.accessible-name`
  - Uses shadcn `ChartContainer` from `src/components/ui/chart.tsx` for theming integration
- [x] **`src/components/packt/donut-chart.test.tsx`** — NEW
  - "renders PieChart with correct number of segments"
  - "renders center figure and label"
  - "renders legend below chart"
  - "root element has role=img and accessibleLabel"
  - "uses formatValue for tooltip/legend values"

### 4. Build category-breakdown-donut component (AC: 2, 3, 4, 5, 6)

- [x] **`src/components/packt/category-breakdown-donut.tsx`** — NEW
  - `"use client"`
  - Props:
    ```ts
    export interface CategoryBreakdownDonutProps {
      data: { category: ExpenseCategory; total: number; count: number }[];
      formatCurrency: (amount: number) => string;
    }
    ```
  - Computes sorted segments from `data` (largest first) — stable order
  - Maps `ExpenseCategory` enum to `--chart-N` CSS variables:
    - Use a `CATEGORY_CHART_COLORS` map (imported from shared location, e.g. `src/lib/budget.ts` where `CATEGORY_LABELS` already lives) mapping `ExpenseCategory` → `var(--chart-N)` CSS variable string
    - Stable order: Food=1, Lodging=2, Transport=3, Activity=4, Sightseeing=5, Gas=6, Groceries=7, Flights=8, CarRental=9, Shopping=10, Misc=11
  - Generates `accessibleLabel` summarizing all segments: `"Category breakdown donut chart: ${label} ${formatted}, ..."`
  - Renders inside `chart-card` wrapping `donut-chart`

### 5. Create CATEGORY_CHART_COLORS mapping (AC: 3)

- [x] **`src/lib/budget.ts`** — MODIFY
  - Add `CATEGORY_CHART_COLORS` const export (mirroring existing `CATEGORY_LABELS` pattern from Story 1.10):
    ```ts
    export const CATEGORY_CHART_COLORS: Record<ExpenseCategory, string> = {
      [ExpenseCategory.Food]: "var(--chart-1)",
      [ExpenseCategory.Lodging]: "var(--chart-2)",
      [ExpenseCategory.Transport]: "var(--chart-3)",
      [ExpenseCategory.Activity]: "var(--chart-4)",
      [ExpenseCategory.Sightseeing]: "var(--chart-5)",
      [ExpenseCategory.Gas]: "var(--chart-6)",
      [ExpenseCategory.Groceries]: "var(--chart-7)",
      [ExpenseCategory.Flights]: "var(--chart-8)",
      [ExpenseCategory.CarRental]: "var(--chart-9)",
      [ExpenseCategory.Shopping]: "var(--chart-10)",
      [ExpenseCategory.Misc]: "var(--chart-11)",
    };
    ```
  - This is the source of truth for color mapping — not duplicated in the chart component

### 6. Update spending-view.tsx — integrate category donut (AC: 7)

- [x] **`src/components/packt/spending-view.tsx`** — MODIFY
  - Import `CategoryBreakdownDonut`
  - Replace the `null` (or empty) branch inside the `<section aria-live="polite">` with the category donut when `hasTripsInRange` is true
  - Pass `initialSummary.categoryBreakdown` and a `formatCurrency` callback to the donut
  - Structure inside the section (top to bottom): `CategoryBreakdownDonut` → (future: destination donut slot → budget adherence donut slot)

### 7. Register new components in feature-map.mjs (CI gate)

- [x] **`tests/e2e/feature-map.mjs`** — MODIFY
  - Add new file paths to the existing `spending` entry's glob list:
    - `src/components/ui/chart-card.tsx`
    - `src/components/packt/donut-chart.tsx`
    - `src/components/packt/category-breakdown-donut.tsx`

### 8. E2E scenarios — category donut

- [x] **`tests/e2e/features/spending.feature`** — MODIFY
  - Add scenario: Spending view has trips with category spend data → category donut renders visible segments
  - Add scenario: No category spend data → no category donut (or excluded gracefully)
- [x] **`tests/e2e/steps/spending.steps.ts`** — MODIFY — step definitions for new scenarios

## Dev Notes

### Architecture compliance

- **All aggregation comes from `buildSpendingSummary()`** (Story 2.1) — `CategoryBreakdownDonut` receives pre-computed `categoryBreakdown`, never queries or re-aggregates itself (architecture Enforcement Guideline)
- **Chart color tokens already exist** — `--chart-1` through `--chart-11` were added in `globals.css` (Story 2.1). Verify 3:1 non-text contrast for adjacent segments during implementation (DESIGN.md `category-donut-palette.contrast-requirement`)
- **Shadcn chart component needed** — Run `npx shadcn@latest add chart` before writing chart code. The chart component is Recharts-based and integrates with the CSS custom property token system
- **`role="img"` + `aria-label` on every chart** — architecture Enforcement Guideline, caught as gap during architecture validation and already resolved. Do not skip.
- **CATEGORY_CHART_COLORS in `@/lib/budget`** — follows the existing `CATEGORY_LABELS` convention (Story 1.10 dev notes: "shared labels live in src/lib/budget.ts, imported from lib, not component chain")

### Existing code state — read before editing

**`src/components/packt/spending-view.tsx`** (56 lines) — Client component, renders `SpendingDateFilter` + `SpendingHeadlineFigures`. Has a `<section aria-live="polite">` placeholder showing "No trips in the selected range" or null for the chart-card area. Must add category donut inside this section. Props don't carry individual chart data — `initialSummary.categoryBreakdown` is the data source.

**`src/lib/spending.ts`** (124 lines) — `buildSpendingSummary()` returns `SpendingSummary` with `categoryBreakdown: { category: ExpenseCategory; total: number; count: number }[]`. Values use `convertedAmountProfile` (already locked at entry time, never render-time recomputation). Stable data shape, no changes needed.

**`src/data/types.ts`** — `SpendingSummary.categoryBreakdown` type matches the data shape above. `ExpenseCategory` enum (11 values) already defined.

**`src/lib/budget.ts`** — Has `CATEGORY_LABELS` export (used by expense-table and other components). Add `CATEGORY_CHART_COLORS` alongside it.

**`src/app/globals.css`** (570+ lines) — Already has `--chart-1` through `--chart-11` (light + dark variants) and their Tailwind v4 `@theme inline` mappings (`--color-chart-1: var(--chart-1)` etc.). No changes needed unless contrast verification reveals issues.

**`tests/e2e/feature-map.mjs`** (217+ lines) — Has `spending` entry from Story 2.1. Must extend with new component paths.

### What must be preserved

- **Existing Spending view behavior** — The date filter, headline figures, zero-trips state, and "No trips in the selected range" state must continue working exactly as before. The section replace the null branch with the donut when data exists
- **No per-chart re-query** — The donut receives pre-computed data; no chart component independently queries or aggregates
- **`chart-card` is generic** — Must accept any children, no Spending-specific coupling. Shared by future donut components (destination, budget adherence)
- **`donut-chart` shared base** — Must be generic enough for all 3 donut types. The category donut is the first consumer; destination and budget adherence follow as separate stories

### Previous story intelligence (Story 2.1)

**Key patterns to follow:**
- New components in `src/components/packt/` with colocated `.test.tsx`
- `cn()` from `@/lib/utils` for className merging
- CSS custom properties for colors, no hardcoded hex
- Interactive elements meet `h-11` minimum sizing (WCAG 2.5.8) — but chart elements intentionally NOT interactive per EXPERIENCE.md
- New components must be registered in `tests/e2e/feature-map.mjs` — `feature-map.test.mjs` will fail CI if they aren't
- `CATEGORY_LABELS` pattern in `src/lib/budget.ts` — match it for chart colors

**Key findings that apply here:**
- `spending-date-filter.tsx` is hand-rolled (not shadcn Select) because Select's sizing tops out at `h-10`, below codebase's `h-11` floor — don't assume shadcn primitives are always available for sizing reasons
- Shadcn chart component was deferred — must install in this story's Task 1
- E2E scenarios use only trip-level date-overlap fixtures (no expense/budget seed data) — this story may need to extend `e2e-seed-data.ts` with expense seeding if dollar-amount E2E assertions are added

**Change Log learnings from Story 2.1:**
- `averageDailySpend` null-vs-zero rendering pattern: when no countable data exists, show `"---"` not `$0.00` — not directly relevant to category donut but useful context
- `packt-build-validator` uses `NEXT_DISTDIR=.next-validate` — won't collide with dev server

### Library requirements

- `recharts` (installed as dependency of shadcn `chart` add)
- `@/components/ui/chart` (shadcn chart primitive, installed via `npx shadcn@latest add chart`)
- `@/components/ui/card` — already installed
- `@/lib/budget` — `CATEGORY_LABELS` and new `CATEGORY_CHART_COLORS`
- `@/lib/utils` — `cn()`, `formatCurrency`
- `@/data/types` — `ExpenseCategory`, `SpendingSummary`
- `lucide-react` — no new icons needed for this story

### Testing requirements

**`src/lib/budget.test.ts` — additions:**
- "CATEGORY_CHART_COLORS maps all 11 ExpenseCategory values"
- "CATEGORY_CHART_COLORS values are CSS variable references"

**`src/components/ui/chart-card.test.tsx`:**
- "renders children inside bordered card"
- "applies custom className"

**`src/components/packt/donut-chart.test.tsx`:**
- "renders PieChart with correct number of segments"
- "renders center figure and label"
- "renders legend below chart"
- "root element has role=img and accessibleLabel"
- "uses formatValue for tooltip/legend values"

**`src/components/packt/category-breakdown-donut.test.tsx`:**
- "renders segments for each category in sorted order (largest first)"
- "uses CATEGORY_CHART_COLORS for segment colors"
- "generates accessibleLabel summarizing all segments"
- "renders inside chart-card wrapper"
- "zero items data array renders nothing or empty state"

**`src/components/packt/spending-view.test.tsx` — modifications:**
- "renders category breakdown donut when summary has category data"
- "still shows no-trips-in-range state when no data"

**E2E scenarios (spending.feature additions):**
- Category donut renders visible segments when trips have categorized expenses
- Category donut not rendered (or area shows correctly) when no category spend exists

### File structure requirements

| File | Change |
|------|--------|
| `src/components/ui/chart.tsx` | NEW — installed via `npx shadcn@latest add chart` |
| `src/components/ui/chart-card.tsx` | NEW — shared bordered card wrapper |
| `src/components/ui/chart-card.test.tsx` | NEW — unit tests |
| `src/components/packt/donut-chart.tsx` | NEW — shared donut base |
| `src/components/packt/donut-chart.test.tsx` | NEW — unit tests |
| `src/components/packt/category-breakdown-donut.tsx` | NEW — category breakdown donut |
| `src/components/packt/category-breakdown-donut.test.tsx` | NEW — unit tests |
| `src/components/packt/spending-view.tsx` | MODIFY — integrate category donut in chart area |
| `src/components/packt/spending-view.test.tsx` | MODIFY — extend existing tests for category donut |
| `src/lib/budget.ts` | MODIFY — add `CATEGORY_CHART_COLORS` |
| `src/lib/budget.test.ts` | MODIFY — add chart colors tests |
| `tests/e2e/features/spending.feature` | MODIFY — category donut scenarios |
| `tests/e2e/steps/spending.steps.ts` | MODIFY — step definitions |
| `tests/e2e/feature-map.mjs` | MODIFY — extend `spending` entry with new component paths |

## Dev Agent Record

### Agent Model Used

Claude

### Completion Notes List

- Installed shadcn `chart` (Recharts-based) via `npx shadcn@latest add chart`; declined the card.tsx overwrite prompt to preserve the project's existing customized Card.
- `DonutChart` passes `role="img"` + `aria-label` directly as props on Recharts' `<PieChart>` — confirmed via recharts internals (`svgPropertiesNoEvents`/`RootSurface`) that these land on the actual root `<svg>` element, satisfying AC5 literally rather than via a wrapping div.
- Recharts charts render in jsdom unit tests without a `ResizeObserver` polyfill because shadcn's `ChartContainer` passes a fixed `initialDimension` (320×200) to `ResponsiveContainer`, which is used as the permanent size when no `ResizeObserver` is available — no extra test setup needed.
- `CategoryBreakdownDonut` returns `null` when all segments are zero/absent (AC6); `SpendingView` renders it only when `hasTripsInRange`, falling back to the existing "No trips in the selected range" message otherwise.
- Extended `tests/e2e/e2e-seed-data.ts` and `scenario-fixture.ts` with `ExpenseSeed`/`expenses` support on the trip mother (per Story 2.1 dev notes anticipating this need) so E2E scenarios can seed real categorized expenses; cascade delete on `expenses.tripId` means no extra cleanup logic was needed.
- Full affected E2E suite (164 scenarios, including both new category-donut scenarios) passed. `packt-build-validator` (lint/typecheck/coverage/full build) was intentionally not run in the original session per user instruction to stop beforehand.
- Post-implementation polish (separate follow-up pass): fixed donut segment colors not rendering (was a stale dev-build CSS cache, not a code bug — confirmed via live browser inspection) and legend label/value spacing (grid `1fr` columns + `ml-auto` stretched too wide; switched to a flex-wrap row). Also added the category name to the hover tooltip alongside the value.
- Ran `packt-build-validator` (full scope, including the full `npm run test:e2e` suite as the pre-merge gate, not just affected) — all five checks pass: lint (1 pre-existing unrelated warning), tsc, coverage (96.09% lines / 96.2% functions / 90.13% branches), e2e (164/164), build. Story moved to review.

### File List

- `src/components/ui/chart.tsx` (NEW — shadcn-installed)
- `src/components/ui/chart-card.tsx` (NEW)
- `src/components/ui/chart-card.test.tsx` (NEW)
- `src/components/packt/donut-chart.tsx` (NEW)
- `src/components/packt/donut-chart.test.tsx` (NEW)
- `src/components/packt/category-breakdown-donut.tsx` (NEW)
- `src/components/packt/category-breakdown-donut.test.tsx` (NEW)
- `src/components/packt/spending-view.tsx` (MODIFY)
- `src/components/packt/spending-view.test.tsx` (MODIFY)
- `src/lib/budget.ts` (MODIFY)
- `src/lib/budget.test.ts` (MODIFY)
- `tests/e2e/feature-map.mjs` (MODIFY)
- `tests/e2e/features/spending.feature` (MODIFY)
- `tests/e2e/steps/spending.steps.ts` (MODIFY)
- `tests/e2e/e2e-seed-data.ts` (MODIFY — added `ExpenseSeed`, `E2E_CATEGORY_EXPENSES`, `expenses` field on trip mothers)
- `tests/e2e/scenario-fixture.ts` (MODIFY — expense insertion in `createTrip`)
- `package.json` / `package-lock.json` (MODIFY — added `recharts` dependency via shadcn)
