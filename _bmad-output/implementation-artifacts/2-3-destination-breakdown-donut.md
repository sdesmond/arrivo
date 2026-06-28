---
baseline_commit: 7750e29044ba44de73f10bea40d1e099f1f6480d
---

# Story 2.3: Destination Breakdown Donut

Status: review

## Story

As a user,
I want to see my spend broken down by destination country across all my trips,
So that I know which places I've spent the most money traveling to.

## Acceptance Criteria

1. **Destination donut renders per-country segments** — When the Spending view has filtered data with `destinationBreakdown` entries, a `chart-card` wrapping a `donut-chart` shows one segment per distinct country present, sized by that country's total spend, centered on total spend (FR16). Grouping uses `destinationCountryCode` (structured ISO code, not the free-text `destinationCountry` display name).

2. **"Unknown" segment** — Filtered trips with no destination set are grouped under a single "Unknown" segment, slotted in by size like any other segment — `fg-4` fill color (`var(--fg-4)`), no demotion to smaller/separated wedge (FR16, UX-DR24).

3. **Dynamic palette (cycles `--chart-N` tokens)** — Follows the same hue-generation convention as the category palette: cycles through `--chart-1` through `--chart-11` CSS custom properties, sized to the number of distinct countries in the range (cycling if that count ever exceeds 11). Not a separate hand-picked palette (UX-DR24).

4. **Accessibility** — Root SVG/PieChart element carries `role="img"` + a data-summarizing `aria-label` (e.g. "Destination breakdown donut chart: United States $2,400, Japan $1,100, ...") independent of on-screen legend text (UX-DR27). Same pattern as `CategoryBreakdownDonut`.

5. **Integrated into Spending view** — The destination donut renders inside the `<section aria-live="polite">` area of `spending-view.tsx`, inside its own `chart-card`, below `CategoryBreakdownDonut` and above the future budget-adherence donut slot.

## Tasks / Subtasks

### 1. Build destination-breakdown-donut component (AC: 1, 2, 3, 4)

- [x] **`src/components/packt/destination-breakdown-donut.tsx`** — NEW
  - `"use client"`
  - Props:
    ```ts
    export interface DestinationBreakdownDonutProps {
      data: { countryCode: string | null; countryName: string; total: number }[];
      formatCurrency: (amount: number) => string;
    }
    ```
  - Computes sorted segments from `data` (largest first by total)
  - Generates dynamic palette: maps each segment to cycling `--chart-N` tokens (`var(--chart-1)`, `var(--chart-2)`, ..., `var(--chart-11)`, wrapping back to `var(--chart-1)` for the 12th+ segment), except:
    - "Unknown" segment (`countryCode === null`) always gets `var(--fg-4)` regardless of position
  - Generates `accessibleLabel` summarizing all segments: `"Destination breakdown donut chart: ${countryName} ${formatted}, ..."` — "Unknown" included in summary when present
  - Renders inside `chart-card` wrapping `donut-chart`

### 2. Inline destination palette logic (AC: 3)

- [x] **`src/components/packt/destination-breakdown-donut.tsx`** — add a module-private function for palette logic
  - Define `getDestinationSegmentColor(index: number, isUnknown: boolean): string`
  - Returns `"var(--fg-4)"` when `isUnknown === true`
  - Returns `"var(--chart-N)"` for the segment at `index` where `N = (index % 11) + 1` — cycles through all 11 chart tokens
  - Private to the component file (single consumer), not exported — tests cover color assignment through component rendering

### 3. Update spending-view.tsx — integrate destination donut (AC: 5)

- [x] **`src/components/packt/spending-view.tsx`** — MODIFY
  - Import `DestinationBreakdownDonut`
  - Add destination donut inside the chart area `<section>`, below `CategoryBreakdownDonut`, above the future budget-adherence slot
  - Pass `initialSummary.destinationBreakdown` and the existing `handleFormatCurrency` callback

### 4. Register new components in feature-map.mjs (CI gate)

- [x] **`tests/e2e/feature-map.mjs`** — MODIFY
  - Add new file paths to the existing `spending` entry's glob list:
    - `src/components/packt/destination-breakdown-donut.tsx`

### 5. Unit tests (AC: 1, 2, 3, 4)

- [x] **`src/components/packt/destination-breakdown-donut.test.tsx`** — NEW
  - "renders segments for each destination in sorted order (largest total first)"
  - "renders all segments including 'Unknown'"
  - "Unknown segment uses var(--fg-4) color"
  - "non-Unknown segments use cycling var(--chart-N) colors"
  - "generates accessibleLabel summarizing all segments including Unknown"
  - "renders inside chart-card wrapper"
  - "empty data returns nothing or null"
- [x] **`src/components/packt/spending-view.test.tsx`** — MODIFY
  - "renders destination breakdown donut when summary has destination data"
  - "still shows 'No trips in the selected range' when no data"

### 6. E2E scenarios — destination donut (AC: 1, 2)

- [x] **`tests/e2e/features/spending.feature`** — MODIFY
  - Add scenario: Spending view has trips across multiple destinations → destination donut renders visible segments including "Unknown"
  - Add scenario: No destination data → destination donut area handles gracefully (shows "Unknown" segment or hides)
- [x] **`tests/e2e/steps/spending.steps.ts`** — MODIFY — step definitions for new scenarios

## Dev Notes

### Architecture compliance

- **All aggregation comes from `buildSpendingSummary()`** (Story 2.1) — `DestinationBreakdownDonut` receives pre-computed `destinationBreakdown` from `initialSummary`, never queries or re-aggregates itself (architecture Enforcement Guideline)
- **`destinationBreakdown` data shape** — from `src/lib/spending.ts::buildSpendingSummary`:
  ```ts
  { countryCode: string | null; countryName: string; total: number }[]
  ```
  - `countryCode = null` → "Unknown" segment
  - `countryName` is the human-readable country name (or "Unknown")
  - `total` is in user's profile currency (uses `convertedAmountProfile`, already locked at entry time)
- **Chart color tokens already exist** — `--chart-1` through `--chart-11` were added in `globals.css` (Story 2.1). The destination palette cycles through these same tokens rather than defining a separate palette (UX-DR24)
- **`role="img"` + `aria-label` on every chart** — architecture Enforcement Guideline, same as category donut. Leverage the existing `DonutChart`'s built-in `accessibleLabel` prop
- **"Unknown" uses `fg-4`** — `var(--fg-4)` for the special "Unknown" segment color, matching DESIGN.md `destination-donut-palette.unknown-segment-color`

### Existing code state — read before editing

**`src/components/packt/spending-view.tsx`** (64 lines) — Currently renders inside the chart `<section>`:
```tsx
<section aria-live="polite">
  {hasTripsInRange ? (
    <CategoryBreakdownDonut data={initialSummary.categoryBreakdown} formatCurrency={handleFormatCurrency} />
  ) : (
    <p style={{ color: "var(--fg-2)" }}>No trips in the selected range</p>
  )}
</section>
```
Must add `DestinationBreakdownDonut` after `CategoryBreakdownDonut` in the `hasTripsInRange` branch.

**`src/lib/spending.ts`** (124 lines) — `buildSpendingSummary()` already returns `destinationBreakdown`. Current implementation groups by `countryCode` (with null → "unknown" key), sums `expenseProfileAmount()`. No changes needed.

**`src/data/types.ts`** — `SpendingSummary.destinationBreakdown` type already matches `{ countryCode: string | null; countryName: string; total: number }[]`. No changes needed.

**`src/components/packt/category-breakdown-donut.tsx`** — Reference implementation for the destination donut. Follow same pattern: `chart-card` wrapping `donut-chart`, `formatCurrency` callback, `accessibleLabel` generation.

**`src/components/packt/donut-chart.tsx`** (80 lines) — Shared base already handles `role="img"` + `aria-label`, centered figure, legend below. No changes needed.

**`src/components/ui/chart-card.tsx`** — Exists from Story 2.2. Simple bordered/rounded/padded wrapper. No changes needed.

**`src/lib/budget.ts`** (170 lines) — Has `CATEGORY_CHART_COLORS` with the 11 fixed mappings. Destination palette is dynamic (not fixed), so destination color logic is inlined in `destination-breakdown-donut.tsx`, not in `spending.ts` or `budget.ts`.

**`tests/e2e/feature-map.mjs`** (217+ lines) — Has `spending` entry from Story 2.1/2.2. Must extend with new component path.

### What must be preserved

- **Existing Spending view behavior** — Date filter, headline figures, zero-trips state, "No trips in selected range" state, and category donut must continue working exactly as before
- **No per-chart re-query** — The destination donut receives pre-computed data; no chart component independently queries or aggregates
- **`chart-card` is generic** — Same shared component used by category donut; no Spending-specific coupling
- **`DonutChart` shared base** — Must remain generic for all 3 donut types. The destination donut is the second consumer; budget adherence donut follows as Story 2.4
- **"Unknown" segment order** — Placed by size like any other segment, not demoted to last or separated (UX-DR24). Sorting by `total` descending handles this naturally

### Previous story intelligence (Story 2.2)

**Key patterns to follow:**
- New components in `src/components/packt/` with colocated `.test.tsx`
- `cn()` from `@/lib/utils` for className merging
- CSS custom properties for colors, no hardcoded hex
- Interactive elements meet `h-11` minimum sizing (WCAG 2.5.8) — chart elements intentionally NOT interactive per EXPERIENCE.md
- New components must be registered in `tests/e2e/feature-map.mjs` or CI will fail
- E2E scenarios must use scenario-owned fixture creation (`createTrip` with expenses via `ExpenseSeed` mother) — no shared state between scenarios

**Key findings that apply here:**
- `DonutChart` passes `role="img"` + `aria-label` as a container `<div>` wrapping the PieChart (not directly on `<PieChart>`)
- Recharts renders fine in jsdom unit tests via shadcn's `ChartContainer` (which uses `initialDimension` fallback when `ResizeObserver` absent) — no extra test setup needed
- `buildSpendingSummary` already computes `destinationBreakdown` — confirmed during Story 2.2
- `packt-build-validator` uses `NEXT_DISTDIR=.next-validate` — won't collide with dev server

**Review findings from Story 2.2 that apply here:**
- `strokeWidth={2}` on `Pie` with `stroke={segment.color}` on each `Cell` prevents white gaps between segments
- `outerRadius="90%"` (not `"100%"`) prevents clipping at container edges
- Legend wrapped in same `role="img"` container with `aria-hidden` on the legend — both chart and legend hidden behind one accessible name
- `formatCurrency` callback wrapped in `useCallback` in the parent to avoid recreate-on-every-render

### Library requirements

- `@/components/packt/donut-chart` — shared donut base (exists from Story 2.2)
- `@/components/ui/chart-card` — shared bordered card wrapper (exists from Story 2.2)
- `@/components/ui/chart` — shadcn chart primitive (exists from Story 2.2)
- `@/lib/utils` — `cn()`, `formatCurrency`
- `@/data/types` — `SpendingSummary`
- `lucide-react` — no new icons needed for this story

### Testing requirements

**`src/components/packt/destination-breakdown-donut.test.tsx`:**
- "renders segments for each destination in sorted order (largest total first)"
- "renders all segments including 'Unknown'"
- "Unknown segment uses var(--fg-4) color"
- "non-Unknown segments use cycling var(--chart-N) colors (wraps after 11)"
- "generates accessibleLabel summarizing all segments including Unknown"
- "renders inside chart-card wrapper"
- "empty data renders nothing"

**`src/components/packt/spending-view.test.tsx` — modifications:**
- "renders destination breakdown donut when summary has destination data"
- "still shows no-trips-in-range state when no data"

**E2E scenarios (spending.feature additions):**
- Destination donut renders visible segments when trips span multiple destination countries
- Unknown segment renders when a trip has no destination set

### File structure requirements

| File | Change |
|------|--------|
| `src/components/packt/destination-breakdown-donut.tsx` | NEW — destination breakdown donut component |
| `src/components/packt/destination-breakdown-donut.test.tsx` | NEW — unit tests |
| `src/components/packt/spending-view.tsx` | MODIFY — integrate destination donut below category donut |
| `src/components/packt/spending-view.test.tsx` | MODIFY — extend tests for destination donut |
| — (palette logic inlined in component file) | No change needed |
| `tests/e2e/features/spending.feature` | MODIFY — destination donut scenarios |
| `tests/e2e/steps/spending.steps.ts` | MODIFY — step definitions |
| `tests/e2e/feature-map.mjs` | MODIFY — extend `spending` entry with new component path |

## Dev Agent Record

### Agent Model Used

Claude (claude-sonnet-4-6)

### Debug Log References

None — implementation went green on first pass for all new tests.

### Completion Notes List

- Built `DestinationBreakdownDonut` following `CategoryBreakdownDonut` exactly: same `chart-card` + `donut-chart` composition, same accessibleLabel pattern.
- `getDestinationSegmentColor` inlined per spec — colors by overall sorted-segment index (`N = (index % 11) + 1`), with "Unknown" forced to `var(--fg-4)` regardless of index. Unknown still consumes an index slot, matching the story's literal palette-logic spec.
- Wrapped the two donuts in spending-view.tsx's chart section with a `flex flex-col gap-6` div for consistent vertical spacing, matching the outer layout convention already used in the page.
- Fixed a pre-existing, unrelated bug found while typechecking: `tests/e2e/steps/spending.steps.ts` imported `../../src/data/types` (wrong relative depth) instead of `../../../src/data/types`. Predates this story (introduced in story 2.2's commit) but blocked a clean `tsc --noEmit`, so corrected it in this change.
- packt-build-validator: lint/tsc/coverage/build all green; full E2E suite green (166/166) on an isolated re-run. One drag-and-drop scenario in the unrelated `packing-tab` feature flaked under the validator's 5-way parallel load (contention, not a regression) and passed cleanly when the full suite was re-run alone.

### File List

- `src/components/packt/destination-breakdown-donut.tsx` — NEW
- `src/components/packt/destination-breakdown-donut.test.tsx` — NEW
- `src/components/packt/spending-view.tsx` — MODIFY
- `src/components/packt/spending-view.test.tsx` — MODIFY
- `tests/e2e/feature-map.mjs` — MODIFY
- `tests/e2e/features/spending.feature` — MODIFY
- `tests/e2e/steps/spending.steps.ts` — MODIFY (new step definitions + pre-existing import-path fix)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFY (status tracking)

### Change Log

- Added `DestinationBreakdownDonut` component with dynamic `--chart-N` palette cycling and `fg-4` "Unknown" segment, integrated into Spending view below the category donut.
- Added unit tests for the new component and extended `spending-view.test.tsx` coverage.
- Registered the new component in `feature-map.mjs` and added two E2E scenarios (multi-destination + unknown-destination) with supporting step definitions.
- Fixed unrelated pre-existing wrong-depth relative import in `spending.steps.ts` that broke `tsc --noEmit`.
