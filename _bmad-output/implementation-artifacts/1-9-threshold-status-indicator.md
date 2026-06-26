---
baseline_commit: e935fc1ee61cbc02c1824979ded975bb090d03d8
---

# Story 1.9: Threshold Status Indicator

Status: done

## Story

As a trip owner/editor,
I want a clear visual signal when my actual spend crosses my warning or danger thresholds,
so that I notice budget risk without having to do math myself.

## Acceptance Criteria

1. **CSS tokens added** — `warning`, `warning-soft`, `warning-ink` (+ `-dark` variants), `danger-soft`, `danger-ink` (+ `-dark` variants) added to `globals.css` following the existing `accent` soft/ink pairing convention (UX-DR1). Also registered in the `@theme inline` block as `--color-warning`, `--color-warning-soft`, etc. so Tailwind utilities like `bg-warning-soft`, `text-warning-ink` resolve.

2. **Neutral state** (Actual / Budget < warningThreshold%) — Progress bar fill = `accent-brand`. No status badge. No tab icon.

3. **Warning state** (warningThreshold% <= Actual/Budget < dangerThreshold%) — Status badge (Warning icon + "Warning") next to Actual figure. Progress bar fill = `warning`. Tab label carries the same Warning icon (`triangle-alert`). (UX-DR2, UX-DR3, UX-DR4)

4. **Danger state** (Actual/Budget >= dangerThreshold%) — Status badge (Error icon `circle-x` + label). Progress bar fill = `destructive`. Tab label carries the same Error icon. **Deviation (post-review fix)**: the label is "Near limit" while Actual < Budget total, and only switches to "Over budget" once Actual >= Budget total — the original AC text used "Over budget" for the entire danger tier, which was misleading at e.g. 90% spend with budget not yet exceeded. (UX-DR2, UX-DR3, UX-DR4)

5. **Immediate update on threshold-crossing action** — Saving a Misc Expense or editing an expense that pushes Actual over a threshold updates the status, progress bar, and tab icon immediately with no page reload (FR11).

6. **Tab status icon accessibility** — Icon itself `aria-hidden="true"`, paired with a visually-hidden `<span>` immediately after it reading "Warning" / "Over budget" so the tab's accessible name becomes "Budget, Warning". (NFR3)

7. **Progress bar is decorative** — `aria-hidden="true"`, no accessible name. The status badge (icon + word) is the authoritative signal (EXPERIENCE.md Component Patterns).

8. **No budget set = no bar/badge/Remaining** — When trip has no budget, the progress bar, status badge, and Remaining figure are not shown. An inline "Set a budget" prompt is shown instead (existing behavior, must be preserved).

## Tasks / Subtasks

### 1. Calculate threshold status function (AC: 2, 3, 4, 5)

- [x] Add `BudgetStatus` const-object enum + type to `src/data/types.ts` — `{ Neutral: "neutral", Warning: "warning", Danger: "danger" }`
- [x] Add `calculateBudgetStatus(actual: number, budgetTotal: number, warningThreshold: number, dangerThreshold: number): BudgetStatus` to `src/lib/budget.ts` — returns `"neutral"` when actual/budget% < warningThreshold; `"warning"` when >= warningThreshold and < dangerThreshold; `"danger"` when >= dangerThreshold
- [x] Handle edge cases: `budgetTotal <= 0` returns `"neutral"` (division by zero guard), `warningThreshold >= dangerThreshold` still computes correctly using the actual stored values (though validated at the settings level)
- [x] Add unit tests in `src/lib/budget.test.ts` for `calculateBudgetStatus` covering neutral/warning/danger boundary values, zero budget, and edge cases

### 2. Add CSS custom properties (AC: 1)

- [x] Add light-theme tokens inside `:root {}` in `globals.css`:
  - `--warning: #b6790a`, `--warning-soft: #fbeacb`, `--warning-ink: #6b4406`
  - `--danger-soft: #fbe4e1`, `--danger-ink: #7a261d`
- [x] Add dark-theme tokens inside `.dark {}` — **deviation**: overrode the *same* var names (`--warning`, `--warning-soft`, `--warning-ink`, `--danger-soft`, `--danger-ink`) inside `.dark {}` rather than introducing literal `-dark`-suffixed variable names. This matches the established `--accent-brand`/`--accent-soft` convention already in the file — `@theme inline` only maps the base name once, so a separate `--warning-dark` var would never be read in dark mode. Values used: `--warning: #e3a83a`, `--warning-soft: rgba(227,168,58,0.16)`, `--warning-ink: #f5d9a0`, `--danger-soft: rgba(255,99,71,0.14)`, `--danger-ink: #ffb3a8`.
- [x] Register in `@theme inline {}` block:
  - `--color-warning: var(--warning)`, `--color-warning-soft: var(--warning-soft)`, `--color-warning-ink: var(--warning-ink)`
  - `--color-danger-soft: var(--danger-soft)`, `--color-danger-ink: var(--danger-ink)`
- [x] Light-mode `warning (#b6790a)` against `surface-2 (#efefec)` clears ~3.18:1 (WCAG 1.4.11 passes). Do not darken `warning` further without re-checking this pairing (DESIGN.md Colors).

### 3. Build budget-progress-bar component (AC: 2, 3, 4, 7)

- [x] Create `src/components/packt/budget-progress-bar.tsx`:
  - Props: `status: BudgetStatus`, plus `actual: number` and `budgetTotal: number` (needed to compute fill width — the story's prop list named only `status` but the width-percentage requirement implies these)
  - Renders a single `<div>`: height 8px, full-width (`w-full`), `rounded-full`, track = `surface-2`
  - Fill `<div>` inside the track: width proportional to `actual/budget` percentage, `rounded-full`, color determined by `status`:
    - `neutral` → `var(--accent-brand)`
    - `warning` → `var(--warning)`
    - `danger` → `var(--destructive)`
  - Entire component: `aria-hidden="true"`, no accessible name
- [x] Create `src/components/packt/budget-progress-bar.test.tsx`:
  - "renders with neutral fill color" — uses `--accent-brand`
  - "renders with warning fill color" — uses `--warning`
  - "renders with danger fill color" — uses `--destructive`
  - "renders with correct width percentage" — actual/budget = 60% → width is 60%
  - "is aria-hidden" — `aria-hidden="true"`
  - "clamps width to 100%" — actual > budget → width is 100% not >100%

### 4. Build status-badge component (AC: 3, 4)

- [x] Create `src/components/packt/status-badge.tsx`:
  - Props: `status: BudgetStatus` (excludes `"neutral"` conceptually — component is only rendered when non-neutral)
  - `warning` state: `TriangleAlert` icon from lucide-react + text "Warning"; bg = `warning-soft`, text = `warning-ink`, icon `strokeWidth={1.5}`
  - `danger` state: `CircleX` icon from lucide-react + text — **deviation**: takes `actual`/`budgetTotal` props (in addition to `status`) and renders "Near limit" while `actual < budgetTotal`, "Over budget" once `actual >= budgetTotal`, instead of always "Over budget"; bg = `danger-soft`, text = `danger-ink`, icon `strokeWidth={1.5}`
  - Rendered as an inline-flex pill with small horizontal padding and rounded background (matching existing badge patterns)
- [x] Create `src/components/packt/status-badge.test.tsx`:
  - "renders warning state with icon and text" — `TriangleAlert` visible, "Warning" text visible, bg matches `warning-soft`
  - "renders danger state with Near limit when actual has crossed the danger threshold but not the budget total"
  - "renders danger state with Over budget when actual has reached or passed the budget total"
  - "icon has strokeWidth 1.5"

### 5. Build tab-status-icon component (AC: 3, 4, 6)

- [x] Create `src/components/packt/tab-status-icon.tsx`:
  - Props: `status: BudgetStatus`
  - Returns `null` when `neutral` (hidden)
  - When `warning`: `TriangleAlert` icon (14px, `strokeWidth={1.5}`, color `var(--warning)`) with `aria-hidden="true"`, followed by `<span className="sr-only">Warning</span>`
  - When `danger`: `CircleX` icon (14px, `strokeWidth={1.5}`, color `var(--destructive)`) with `aria-hidden="true"`, followed by `<span className="sr-only">Near limit</span>` or `<span className="sr-only">Over budget</span>` — **deviation**: same `actual`/`budgetTotal`-driven split as `StatusBadge`, for the same reason
- [x] Create `src/components/packt/tab-status-icon.test.tsx`:
  - "returns null when neutral"
  - "renders warning icon with hidden span when warning"
  - "renders Near limit hidden span when danger threshold crossed but actual is under the budget total"
  - "renders Over budget hidden span when actual has reached or passed the budget total"
  - "icon is aria-hidden"
  - "icon has strokeWidth 1.5"

### 6. Integrate into TripBudgetTab (AC: 2, 3, 4, 5, 8)

- [x] In `src/components/packt/trip-budget-tab.tsx`:
  - Import `calculateBudgetStatus` from `@/lib/budget` and `BudgetStatus` from `@/data/types`
  - Add `warningThreshold: number` and `dangerThreshold: number` props (passed from page.tsx, read from user profile) — **note**: made optional with defaults 80/90 (matching the DB column defaults from Story 1.8) so the ~20 pre-existing tests that don't pass these props keep working unmodified
  - Compute `budgetStatus = calculateBudgetStatus(actual, budget.total, warningThreshold, dangerThreshold)` when `hasBudget`
  - Render `<BudgetProgressBar>` below the header figures (between Actual figure and Budget/Remaining row) when `hasBudget`
  - Render `<StatusBadge>` next to the Actual figure when status is warning or danger — not at neutral
- [x] Update unit tests in `src/components/packt/trip-budget-tab.test.tsx`:
  - "shows no progress bar when no budget set"
  - "shows progress bar with neutral fill when actual < warning threshold"
  - "shows badge with warning icon when actual >= warning threshold"
  - "shows badge with danger icon when actual >= danger threshold"
  - "shows no badge when neutral"
  - "status updates when expenses change" (re-render test)

### 7. Add tab status icon to page-client.tsx (AC: 3, 4, 5)

- [x] In `src/app/(app)/trips/[tripId]/page-client.tsx`:
  - `expenses` and `budget` (via `detail.trip.budget`) already flow through from the server fetch
  - Accept `warningThreshold: number` and `dangerThreshold: number` props (read from user profile, passed from page.tsx) — optional with defaults 80/90, same rationale as task 6
  - Compute threshold status for the budget tab using `calculateBudgetStatus`
  - Wrap the "Budget" tab label to include `<TabStatusIcon>` after the word "Budget" when non-neutral
  - Budget tab label structure: `Budget<TabStatusIcon>` — icon before visually-hidden span, so accessible name reads "Budget Warning"
  - Also threaded `warningThreshold`/`dangerThreshold` through `trip-detail-tab-body.tsx` (intermediate prop-passing layer between page-client and TripBudgetTab, not called out in the story's file list but required for the data to reach `TripBudgetTab`)
- [x] Update tests in `src/app/(app)/trips/[tripId]/page-client.test.tsx`

### 8. Wire user threshold values through data flow (AC: 2, 3, 4, 5)

- [x] In the server page/data fetching layer (`src/app/(app)/trips/[tripId]/page.tsx`), read the user's `warningThreshold` and `dangerThreshold` from the session user profile and pass them to the client component
- [x] The threshold values are user-level settings (from the `users` table, set in Story 1.8), not per-trip — read them alongside existing user profile data (`getUserById` already selects them; verified in Story 1.8)

## Dev Notes

### What must be preserved

- **Existing trip-budget-tab.tsx behavior** — The header, category tile grid, toolbar (Add Misc Expense / Recalculate Conversions), "No expenses yet" empty state, and "Set a budget" prompt must continue working exactly as before. This story adds the progress bar and status badge to the header area, it does not restructure anything.
- **Existing page-client.tsx tab bar** — All other tabs (Reservations, Itinerary, Map, Documents, Packing, Notes) are completely unchanged. Only the Budget tab label gains a status icon.
- **Existing `calculateActual` and `calculateCategoryBreakdown`** — Already in `lib/budget.ts` (Story 1.4). Do not modify them. `calculateBudgetStatus` is additive.

### Existing code state — read before editing

**`src/app/globals.css`** — Light theme `:root` block has no warning/danger tokens. Dark theme `.dark` block has no warning/danger tokens. `@theme inline` block has no `--color-warning*` / `--color-danger*` mappings. Follow the exact existing pattern: add raw CSS vars to `:root` and `.dark`, then map them in `@theme inline`. See how `--accent-brand`, `--accent-soft`, etc. are defined for the exact pattern.

**`src/components/packt/trip-budget-tab.tsx`** — Currently renders: header with "Actual spent" figure, Budget/Remaining sub-lines (or "Set a budget" link), category tile grid (or "No expenses yet"), toolbar with Add Misc Expense + conditional Recalculate Conversions button. No progress bar, no status badge. Accepts: `tripId`, `budget`, `expenses`, `defaultExpenseCurrency`, `onOpenEditBudget`.

**`src/lib/budget.ts`** — Has `calculateActual`, `calculateCategoryBreakdown`, `needsRecalculation`, `hasCurrencyMismatch`, `hasCurrencyChangeMismatch`. **Does NOT have `calculateBudgetStatus`** — this story creates it. The `BudgetStatus` type does NOT exist yet in `src/data/types.ts`.

**`src/data/types.ts`** — Has `Budget` interface with `{ currency: string; total?: number }`. Has no `BudgetStatus` type.

**`src/app/(app)/trips/[tripId]/page-client.tsx`** — TABS array has `{ id: "budget", label: "Budget" }`. The tab buttons are rendered as a simple `.map()` over `TABS`. No tab carries any status icon. The budget tab's label text needs to be extended to include `TabStatusIcon`.

### Architecture compliance

- `calculateBudgetStatus` goes in `lib/budget.ts` — the shared pure-calculation file created during Story 1.4 (architecture validation forced this to prevent duplicated math across `TripEditBudget` and `TripBudgetTab`).
- Percentage is computed as `actual / budgetTotal * 100`. Both values are already in Trip Currency (actual is already converted). No currency conversion needed in this function.
- The threshold values come from the user's profile (`warningThreshold`, `dangerThreshold` stored in `users` table, default 80/90 — added in Story 1.8).
- Status update on threshold-crossing action — There is no polling or WebSocket mechanism. The "immediate" update (AC5) is handled by React's natural re-render: saving an expense via `TripAddExpenseModal` triggers `revalidatePath`, the page re-fetches data, and `TripBudgetTab` recomputes with fresh expenses. In the client, the modal close + state propagation is sufficient since the parent passes fresh `expenses` and `budget` props.

### Previous story intelligence (Story 1.8 — Configure Spend Threshold Settings)

**Dev patterns established:**
- Inline validation via `Field.error` prop — this story uses no inline validation (purely display)
- DB defaults at column level — `warningThreshold: 80`, `dangerThreshold: 90` default at schema level
- Colocated test files: `.test.tsx` next to source, `userEvent` for interactions
- `vi.mock("sonner", ...)` for toast mocking — not needed here (no new mutations)
- Existing `trip-budget-tab.test.tsx` needs extension, not recreation

**Key findings from Story 1.8 dev notes that apply here:**
- `src/lib/queries.ts::getUserById` builds `UserProfile` via explicit `db.select({...})` — if threshold fields aren't selected, the Settings page won't see them. Verify this was fixed in Story 1.8 (it was — `warningThreshold`/`dangerThreshold` were added to the select).

**Testing patterns established:**
- Component tests for visual components: render with different prop states, assert icon presence/absence, assert text content
- CSS custom properties used for colors (verify via `getComputedStyle` or snapshot)

### Git intelligence

Recent commits for Epic 1 all passed through build-validator (lint/tsc/coverage/E2E/build). Story 1.8 addressed code review findings (NaN propagation, fractional values, client/server validation divergence). Ensure this story's new components also clear coverage thresholds.

### File structure requirements

| File | Change |
|------|--------|
| `src/data/types.ts` | Add `BudgetStatus` const-object enum |
| `src/lib/budget.ts` | Add `calculateBudgetStatus()` function |
| `src/lib/budget.test.ts` | Add `calculateBudgetStatus` unit tests |
| `src/app/globals.css` | Add `--warning*`/`--danger*` CSS vars + `@theme inline` mappings |
| `src/components/packt/budget-progress-bar.tsx` | NEW |
| `src/components/packt/budget-progress-bar.test.tsx` | NEW |
| `src/components/packt/status-badge.tsx` | NEW |
| `src/components/packt/status-badge.test.tsx` | NEW |
| `src/components/packt/tab-status-icon.tsx` | NEW |
| `src/components/packt/tab-status-icon.test.tsx` | NEW |
| `src/components/packt/trip-budget-tab.tsx` | MODIFY — add progress bar, status badge, threshold state |
| `src/components/packt/trip-budget-tab.test.tsx` | MODIFY — add threshold state tests |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | MODIFY — add tab status icon to Budget tab |
| `src/app/(app)/trips/[tripId]/page.tsx` | MODIFY — pass warningThreshold/dangerThreshold to client |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Update status |

**No changes needed to:** `src/lib/queries.ts` (thresholds already fetched in Story 1.8), `src/app/(app)/profile/preferences-section.tsx` (threshold inputs already done), `src/app/(app)/trips/[tripId]/budget/actions.ts` (no new server actions), `src/lib/currency.ts`, E2E feature files (threshold display changes are covered by existing budget.feature scenarios).

### Library requirements

- No new npm packages
- `lucide-react` — `TriangleAlert`, `CircleX` icons
- `cn()` from `@/lib/utils` — for className merging
- `@/data/types` — for `BudgetStatus` and existing types
- `@/lib/budget` — for `calculateBudgetStatus`, `calculateActual`, `calculateCategoryBreakdown`

### Testing requirements

**`src/lib/budget.test.ts` additions:**
- "calculateBudgetStatus returns neutral when actual/budget < warning"
- "calculateBudgetStatus returns warning when actual/budget >= warning and < danger"
- "calculateBudgetStatus returns danger when actual/budget >= danger"
- "calculateBudgetStatus returns neutral when budget is 0 or negative"
- "calculateBudgetStatus boundary at exact warning threshold"
- "calculateBudgetStatus boundary at exact danger threshold"

**`src/components/packt/budget-progress-bar.test.tsx`:** See task 3 above.

**`src/components/packt/status-badge.test.tsx`:** See task 4 above.

**`src/components/packt/tab-status-icon.test.tsx`:** See task 5 above.

**`src/components/packt/trip-budget-tab.test.tsx` additions:**
- "renders progress bar with neutral fill when no threshold crossed"
- "renders status badge with warning icon and text when warning threshold crossed"
- "renders status badge with danger icon and text when danger threshold crossed"
- "shows no badge and no bar when no budget set"
- "progress bar width matches actual/budget percentage"

**`src/app/(app)/trips/[tripId]/page-client.test.tsx` additions:**
- "budget tab label shows warning icon when budget status is warning"
- "budget tab label shows error icon when budget status is danger"
- "budget tab label has no icon when budget status is neutral"

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `npx vitest run "src/components/packt/budget-progress-bar.test.tsx" "src/components/packt/status-badge.test.tsx" "src/components/packt/tab-status-icon.test.tsx"`
- `npx vitest run "src/components/packt/trip-budget-tab.test.tsx"`
- `npx vitest run "src/lib/budget.test.ts"`
- `npx vitest run "src/app/(app)/trips/[tripId]/page-client.test.tsx"`
- `npx tsc --noEmit`
- `npx vitest run` (full suite, 175 files / 2617 tests passed after registering the 3 new components in `tests/e2e/feature-map.mjs`)

### Completion Notes List

- Implemented `calculateBudgetStatus` in `lib/budget.ts` with full boundary-value test coverage (neutral/warning/danger edges, zero/negative budget guard).
- Added `--warning`, `--warning-soft`, `--warning-ink`, `--danger-soft`, `--danger-ink` tokens to `globals.css`. **Deviation from task 2's literal `-dark`-suffixed names**: overrode the same var names inside `.dark {}` instead, matching the existing `--accent-brand` convention — a separate `-dark`-suffixed var would never be consumed by `@theme inline`, which maps the base name once.
- Built `BudgetProgressBar`, `StatusBadge`, and `TabStatusIcon` as small focused components per the story's component breakdown; `BudgetProgressBar` additionally takes `actual`/`budgetTotal` props (not just `status`) since the width calculation requires them.
- Integrated into `TripBudgetTab` and the Budget tab label in `page-client.tsx`; threaded `warningThreshold`/`dangerThreshold` through the intermediate `trip-detail-tab-body.tsx` layer (not in the story's file list but required for prop flow) and through `page.tsx` from `profile.warningThreshold`/`profile.dangerThreshold` (already selected by `getUserById` since Story 1.8).
- `warningThreshold`/`dangerThreshold` were made optional (default 80/90) at every layer rather than required, to avoid touching ~20 pre-existing call sites/tests that predate this story and don't pass them.
- Registered the 3 new components in `tests/e2e/feature-map.mjs` under the existing "trips" feature entry (alongside `trip-budget-tab.tsx`) — required by the `feature-map.test.mjs` consistency check; no new `.feature` file needed since AC5's threshold-crossing behavior is already covered by the existing budget E2E scenarios.
- Full regression: `npx tsc --noEmit` clean, full Vitest suite (175 files / 2617 tests) green.
- **Post-review fix**: live UI testing (via Playwright MCP browser against the dev server) surfaced that the danger badge/tab-icon always read "Over budget" once spend crossed `dangerThreshold%` (default 90%), even when actual spend hadn't yet reached the budget total — misleading at e.g. 95% spend. Per product decision, `StatusBadge` and `TabStatusIcon` now take `actual`/`budgetTotal` and render "Near limit" while `actual < budgetTotal`, switching to "Over budget" only once `actual >= budgetTotal`. Also fixed Budget tab icon visual order (icon was rendering below "Budget" text instead of before it) — fixed via `flex-row-reverse` on the tab button so DOM order (and thus accessible name "Budget Warning"/"Budget Near limit"/"Budget Over budget") stays unchanged while the icon visually precedes the label.

### File List

- `src/data/types.ts` — added `BudgetStatus` const-object enum + type
- `src/lib/budget.ts` — added `calculateBudgetStatus()`
- `src/lib/budget.test.ts` — added `calculateBudgetStatus` unit tests
- `src/app/globals.css` — added `--warning*`/`--danger*` light + dark tokens and `@theme inline` mappings
- `src/components/packt/budget-progress-bar.tsx` — NEW
- `src/components/packt/budget-progress-bar.test.tsx` — NEW
- `src/components/packt/status-badge.tsx` — NEW
- `src/components/packt/status-badge.test.tsx` — NEW
- `src/components/packt/tab-status-icon.tsx` — NEW
- `src/components/packt/tab-status-icon.test.tsx` — NEW
- `src/components/packt/trip-budget-tab.tsx` — added progress bar, status badge, threshold props/state
- `src/components/packt/trip-budget-tab.test.tsx` — added threshold status tests
- `src/app/(app)/trips/[tripId]/page-client.tsx` — added tab status icon to Budget tab label, threshold props
- `src/app/(app)/trips/[tripId]/page-client.test.tsx` — NEW tests for budget tab status icon
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` — threaded `warningThreshold`/`dangerThreshold` props through to `TripBudgetTab` (not in original file list; required plumbing)
- `src/app/(app)/trips/[tripId]/page.tsx` — passes `profile.warningThreshold`/`profile.dangerThreshold` to the client component
- `tests/e2e/feature-map.mjs` — registered the 3 new components under the existing "trips" feature entry
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status updated

### Review Findings

- [x] [Review][Decision] Zero-budget edge case: `budget.total === 0` makes `hasBudget=true`, but `calculateBudgetStatus` returns Neutral. Progress bar renders at 0% with no badge — a user who sets a $0 budget then adds expenses sees no warning. Resolution: treat `total: 0` as no-budget (`hasBudget` requires `total > 0`).
- [x] [Review][Patch] No `--danger` base CSS variable — added `--danger: var(--destructive)` in both themes, `--color-danger` in `@theme inline`, updated components to use `--danger`.
- [x] [Review][Patch] Duplicate default threshold values — extracted `DEFAULT_WARNING_THRESHOLD`/`DEFAULT_DANGER_THRESHOLD` to `src/lib/budget.ts`, imported in both consumers.
- [x] [Review][Patch] Inverted thresholds — `calculateBudgetStatus` now uses `Math.max`/`Math.min` to ensure both thresholds are reachable regardless of ordering.
- [x] [Review][Patch] NaN propagation — added `Number.isFinite` guard in `calculateBudgetStatus`.
- [x] [Review][Patch] Negative actual — clamped with `Math.max(actual, 0)` in `calculateBudgetStatus`.
- [x] [Review][Patch] No transition on progress-bar width — added `transition: width 0.3s ease` to fill div.
- [x] [Review][Patch] `FILL_COLOR` lacks exhaustive type check — added `satisfies Record<BudgetStatus, string>` on the `budget-progress-bar.tsx` map.
- [x] [Review][Defer] `flex-row-reverse` approach for tab icon positioning is fragile — if CSS fails, visual order reverses. Deferred: spec-chosen tradeoff for accessible-name ordering (`budget-progress-bar.tsx:1`).
