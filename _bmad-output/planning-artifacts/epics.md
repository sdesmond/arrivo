---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-06-23/prd.md
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-06-23/addendum.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-06-24/EXPERIENCE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-06-24/DESIGN.md
---

# Packt - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Packt, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories. Scope: Trip Budget Management & Travel Retrospective (`prd-packt-2026-06-23`) — both features are fully in scope, FR-1–FR-22 less FR-14 (retired during the UX pass, see PRD §6 Non-Goals).

## Requirements Inventory

### Functional Requirements

FR1: Trip owner/editor can set a budget total and currency on a trip (existing capability) and see it used as the comparison target for Actual everywhere actual spend is shown.

FR2: Within a given trip's Budget tab, all amounts display in that trip's Trip Currency, regardless of the user's profile currency preference.

FR3: When the trip owner/editor changes Trip Currency on a trip that has at least one Cost Entry whose stored currency differs from the new Trip Currency, the system shows a warning before committing the change, offering Cancel / Continue and recalculate / Continue and leave as-is.

FR4: When a trip owner/editor sets or edits the cost on an event or reservation, the system creates or edits a linked Cost Entry under the hood — with amount, currency (defaults to Trip Currency, or user's profile currency if none set), category (required, no default), and date.

FR5: System computes Actual as a single sum over the expenses store, filtered to the trip, with each Cost Entry's amount converted to Trip Currency using the rate locked at that Cost Entry's own entry time.

FR6: Budget tab shows Actual broken down by category (the shared enum from FR4/FR7) with a count of items per category.

FR7: Trip owner/editor can add a Misc Expense from the Budget tab with amount (required, >0, 2 decimals, capped at 50,000), currency (required, defaults to Trip Currency), category (required, no default), date (defaults to today, past dates allowed), and note (optional).

FR8: When any Cost Entry's currency differs from Trip Currency, the system converts it at entry time using a one-time lookup (no background rate updates) and stores both the original amount/currency and the converted amount/rate.

FR9: Trip owner/editor can trigger a "Recalculate conversions" action that re-fetches current rates and updates the converted amount for every Cost Entry whose original currency differs from Trip Currency.

FR10: User can set a warning threshold and a danger threshold (each 0–100%, default 80%/90%, warning must be less than danger) in Settings → Preferences → Budget.

FR11: Budget tab status indicator shows a neutral state below the warning threshold, a warning state between warning and danger (paired with a Warning icon), and a danger state at or above danger (paired with an Error icon) — icon plus app color together, never color alone.

FR12: The existing History page gains a second view, "Spending," alongside the existing "Trips" view (unchanged) — cross-trip reporting: category/destination/budget-adherence donut charts, headline figures (total spend, average trip spend, average daily spend), all driven by a single date filter.

FR13: A single date filter (This Year / Last Year / Last 12 Months / All Time, default This Year) drives every chart and figure on the Spending view. A trip is included whenever any part of its dates overlaps the selected period — its full spend counts, never a partial slice. Trips with no spend data in the selected range are excluded from all charts and figures (not shown as errors or empty placeholders); a trip's profile-currency contribution uses its already-locked conversion, never a render-time recomputation.

FR15: Spending view shows a category breakdown donut chart (same `ExpenseCategory` enum as the trip-level Budget tab), centered on total category-tagged spend, with a legend inside its own chart-card.

FR16: Spending view shows a destination breakdown donut chart, grouped by each trip's `destinationCountryCode` (country-level only — no state/city or continent rollup). Trips with no destination set fall under "Unknown," slotted in by size like any other segment.

FR17: Spending view shows a budget-adherence donut chart (3 segments: under / on / over budget) counting how many trips fall in each band; "on budget" means within ±2% of the trip's budget total. Trips with no budget set are excluded from the count.

FR18: Spending view shows an average-daily-spend figure: total filtered spend ÷ total filtered trip-days. Trips with no dates are excluded entirely (not just from the denominator).

FR19: When the user changes their profile currency and at least one Cost Entry's profile-currency conversion was locked under the old value, the system shows a confirmation (mirrors FR3's Trip Currency change dialog) before committing the change; recalculation runs synchronously (no background job, given current single-user scale).

FR20: Spending view shows a total-spend figure: sum of all filtered spend in the user's profile currency. Zero filtered trips, or zero spend in range, shows $0 — never hidden, never an error state.

FR21: Spending view shows an average-trip-spend figure: total filtered spend ÷ count of filtered trips. Inherits FR13's exclusion rule (trips with no spend data in range don't dilute the average).

FR22: Budget tab shows a line-item table of every expense for the trip (event-linked, reservation-linked, and Misc), sitting beneath the category tile grid, sortable by date, amount, category, and title. Clicking an event/reservation-linked row navigates to and highlights that event/reservation; clicking a Misc Expense row opens the Misc Expense modal in edit mode (with Remove), fulfilling FR7's edit/delete consequence which had no UI until this requirement. Sorting is client-side; no new query.

**Retired:** FR14 (Spend-over-time bar chart) — considered and cut during the UX pass; no distinct value over the headline figures and donut breakdowns already on the view. Left as a numbering gap, not renumbered (see PRD `.decision-log.md`).

### NonFunctional Requirements

NFR1: Financial data accuracy — all amount fields validate >0, max 2 decimal places, client- and server-side; stored as Postgres `numeric` strings (existing `db-mappers.ts` convention) — no floating-point currency math.

NFR2: External dependency reliability — the currency conversion lookup (Frankfurter/ECB, historical-date-specific at entry) is a synchronous dependency of FR3, FR4, FR7, FR9, and FR19; on failure, no partial save/update occurs, and retry is user-initiated only, never automatic.

NFR3: Accessibility — Threshold Alert states (FR11) pair a Warning icon and an Error icon with the app's existing warning/danger colors — never color alone (WCAG 2.1 AA, color-blind-safe). The Misc Expense modal and CostDialog are fully keyboard-operable end to end. Travel Retrospective's donut charts (FR15–FR17) extend the same floor to chart form: every chart's root graphic element carries `role="img"` + a data-summarizing `aria-label`; the category/destination palette and the "Unknown"/budget-adherence colors must clear 3:1 non-text contrast against adjacent segments and the chart-card surface; labels/legend are the primary signal, color is secondary; date-filter changes announce via a polite live region.

NFR4: Data migration — the existing `cost` field on `Event`/`Reservation` is dropped, not migrated; this is explicit, intentional data loss for pre-feature trips, not an oversight.

### Additional Requirements

- Brownfield feature on an established stack (Next.js 16.2.4, Drizzle/Postgres, Auth.js v5) — no starter template or project initialization step.
- New `expenses` table (`trip_id`, nullable `event_id`/`reservation_id`, `category`, `amount`, `currency`, dual-conversion columns `converted_amount_trip`/`conversion_rate_trip`/`converted_currency_trip` + `converted_amount_profile`/`conversion_rate_profile`/`converted_currency_profile`, `date`, `note`) with FK cascade matching the existing `documents` table precedent (all three FKs `onDelete: "cascade"`). Ships with the dual-conversion columns from the start — not a migration, since the table doesn't exist yet.
- `Event.cost`/`Reservation.cost` dropped from schema; every existing reader of those fields must be located and updated in the same change (addendum flags this as the largest single implementation step).
- New `dbExpenseToType()` mapper in `db-mappers.ts`; `dbEventToType()`/`dbReservationToType()` lose their `cost` mapping.
- New `ExpenseCategory` const-object enum (11 values: Food, Lodging, Transport, Activity, Sightseeing, Gas, Groceries, Flights, CarRental [`"car-rental"`], Shopping, Misc) in `src/data/types.ts`.
- New `SpendingDateRange` const-object enum (`this-year`/`last-year`/`last-12-months`/`all-time`) in `src/data/types.ts`, doubling as the literal value set for the Spending view's `range` URL search param.
- New `SpendingSummary` interface in `src/data/types.ts` — the return shape of `buildSpendingSummary()`.
- New `lib/currency.ts`: Frankfurter (ECB) API client using the historical date-specific endpoint (`/v1/{date}`, not `/latest`), batching both target currencies in one request via `?to=X,Y` when they differ. In-memory rate cache (`globalThis`-persisted survival across hot reloads) keyed by currency-pair only and used **only for today-dated lookups** — any historical (non-today) date bypasses the cache and fetches directly, keeping the cache's key-space bounded. Shared by all 6 conversion call sites.
- New `lib/budget.ts`: shared pure calculation functions (`calculateActual`, `calculateCategoryBreakdown`, `calculateBudgetStatus`, `hasCurrencyMismatch`) consumed by both `TripEditBudget`'s summary and `TripBudgetTab`'s header — added during architecture validation to prevent duplicated math.
- New `lib/spending.ts`: `buildSpendingSummary(trips, expenses, dateRange)` — one pure function computing total spend, average trip spend, average daily spend, category breakdown, destination breakdown, and budget adherence in a single pass. Budget adherence reuses `lib/budget.ts::calculateBudgetStatus` per-trip (currency-invariant percentage) rather than a separate profile-currency calculation.
- New `lib/queries.ts::listExpensesForUserInRange(userId, startDate, endDate)` — applies FR13's any-date-overlap trip-inclusion rule at the trip level, then returns expense rows for every included trip.
- New `src/app/(app)/trips/[tripId]/budget/actions.ts` houses all new Server Actions (createExpense, updateExpense, deleteExpense, recalculateConversions, changeTripCurrency), each gated by `assertTripAccess(tripId, user.id!, "editor")`, matching every existing write in `actions.ts`.
- New `changeProfileCurrency` Server Action, added to the existing Preferences/profile actions file — `requireUser()` only, no trip-role gate (Travel Retrospective's Spending view and this action are user-scoped, not trip-scoped).
- Spending view's date filter is reflected in a URL search param (`/travel-history?view=spending&range=this-year`) — `page.tsx` reads `searchParams`, fetches + aggregates server-side, passes the result down. No new Server Action or client-fetch mechanism for reads; changing the filter is a standard App Router navigation/re-render. Aggregated chart/figure data only ever reaches the client — raw expense rows for a user's full history never do.
- shadcn's chart component (Recharts-based) confirmed as the chart library — installed into `src/components/ui/chart.tsx` via the standard shadcn add flow.
- New `--chart-1` through `--chart-11` CSS custom properties in `globals.css` (light + dark variants) — exact hue values are an implementation-time decision, verified against a 3:1 non-text-contrast + no-similar-hue-and-lightness-adjacency rule (DESIGN.md), not fixed values decided in architecture. The destination donut reuses the same tokens, cycling if a user's distinct-country count ever exceeds 11.
- Every chart component must set `role="img"` + a data-summarizing `aria-label` on its root graphic element — caught as a gap during the architecture update's validation pass, now an explicit Enforcement Guideline.
- "Settings → Preferences → Budget" (FR10) lands in the existing `profile/preferences-section.tsx` — there is no separate Settings route in this codebase. The profile-currency-change confirmation dialog (FR19) wires into the same file.
- Max amount ceiling fixed at 50,000 in entry currency (resolves PRD §9 Assumptions Index for FR7).
- No new validation library (zod) introduced — inline validation matching existing action conventions. App-wide zod adoption explicitly deferred as a separate, future architecture decision.
- E2E: new `tests/e2e/features/budget.feature` (tag `@feat:budget`) and `tests/e2e/steps/budget.steps.ts`, plus new `tests/e2e/features/spending.feature` (tag `@feat:spending`) and `tests/e2e/steps/spending.steps.ts`; `tests/e2e/feature-map.mjs` must register both features' source globs (`trip-budget-tab`, `trip-add-expense-modal`, `budget/actions.ts`, `cost-dialog`, `trip-edit-budget`, `trip-currency-change-dialog`, `preferences-section` for budget; `spending-view` and its children, `travel-history` page.tsx/page-client.tsx, `lib/spending.ts`, `profile-currency-change-dialog` for spending) or `feature-map.test.mjs` fails the coverage worker.
- Story 1.10's `expense-table` component is covered under the existing `@feat:budget` feature/source globs (`trip-budget-tab`, `trip-add-expense-modal`) — no new feature file or tag needed; extend `budget.feature`/`budget.steps.ts` with sort/navigate/edit-misc scenarios.

### UX Design Requirements

UX-DR1: Add new CSS custom-property tokens for the warning/danger family — `warning`, `warning-soft`, `warning-ink` (+ `-dark` variants), `danger-soft`, `danger-ink` (+ `-dark` variants) — following the existing `accent` soft/ink pairing convention. `destructive` remains the danger-state fill/icon color; the new `danger-soft`/`danger-ink` are for the status badge background only.

UX-DR2: Build `budget-progress-bar` component — single 8px, full-width, `rounded-full` bar; fill color switches `accent-brand` / `warning` / `danger` per threshold band (FR11); track is `surface-2`; decorative only (`aria-hidden="true"`, no accessible name).

UX-DR3: Build `status-badge` component — icon + word pill next to the Actual figure; three states map 1:1 to FR11 (neutral = no badge shown at all; warning = Warning icon + "Warning"; danger = Error icon + "Over budget"); icon never omitted at warning/danger.

UX-DR4: Build `tab-status-icon` pattern on the "Budget" tab label in the trip-detail tab bar — same warning/danger icon as the status badge; hidden entirely at neutral; icon itself `aria-hidden="true"` with a visually-hidden `<span>` immediately after reading "Warning" / "Over budget" so the tab's accessible name becomes "Budget, Warning".

UX-DR5: Build `category-tile` component — category name (`fg-3`) above a large figure (`fg`); category with 0 items omitted; sized to wrap at least 2 per row on the narrowest supported viewport.

UX-DR6: Build shared `field-row` pattern — bordered, rounded card row per field, used by both `CostDialog` and the new Misc Expense modal (currency+amount row, category disclosure row, date row, note row); no persistent required-marker on category — enforced via inline validation message at save time.

UX-DR7: Build shared `currency-picker-row` overlay — code swatch + currency name + ISO code, used by `CostDialog`, the Misc Expense modal, and `TripEditBudget`; selected row shown via `accent-soft` background highlight only (no checkmark); no search field; full scrollable list (~150 currencies).

UX-DR8: Build `category-picker` disclosure + overlay, shared by `CostDialog` and the Misc Expense modal — opens on click/Enter; selecting a category or pressing Esc closes the picker and returns focus to the disclosure row.

UX-DR9: Redesign `CostDialog` to the `field-row` stack (amount+currency row, category disclosure row); existing Remove/Cancel/Save footer behavior unchanged; full keyboard operability (tab order: amount → currency → category → date → note → save/cancel).

UX-DR10: Build new `TripAddExpenseModal` — `field-row` stack (currency+amount, category disclosure, date defaulting to today, optional multiline note); fully keyboard-operable, no mouse-only interaction.

UX-DR11: Redesign `TripEditBudget` — currency dropdown (ISO codes, ~150 currencies) replacing free-text input; read-only actual/remaining/%/status summary once Budget tab has data; wired to the new Trip Currency change confirmation dialog.

UX-DR12: Build new Trip Currency change confirmation dialog — single generic sentence ("Some of your expenses don't match your new currency selection. Do you want to convert them to this new currency?"); footer: Cancel (ghost, far left), Leave As Is (secondary) + Convert (primary) grouped right; no dialog at all when every Cost Entry already matches the new currency.

UX-DR13: Build new `TripBudgetTab` — header (Budget/Actual/Remaining/%/Status; no-budget-set state replaces bar/badge/Remaining with an inline "Set a budget" prompt), category tile grid (zero-entries state shows "No expenses yet", toolbar stays visible), toolbar (Add Misc Expense always visible; Recalculate Conversions shown only when ≥1 Cost Entry's currency differs from Trip Currency, hidden entirely otherwise including on zero-Cost-Entry trips).

UX-DR14: Add Settings → Preferences → Budget section to `preferences-section.tsx` — two number inputs (0–100, default 80/90) for warning/danger thresholds; saving warning ≥ danger rejected with an inline validation message (not toast-only).

UX-DR15: Implement microcopy per the Voice and Tone table in EXPERIENCE.md — e.g. "$3,760 spent" not "You've spent a total of $3,760 so far!"; "Couldn't convert currency — try again." not "Oops! Something went wrong..."; "No expenses yet" not "Looks like you haven't added any expenses yet!"; status words "On track"/"Warning"/"Over budget" not exclamatory phrasing.

UX-DR16: Implement all toast/inline error states from the State Patterns table: conversion lookup failure (toast: "Couldn't convert currency — try again."), recalculation partial-failure (toast: "Recalculation failed — no amounts were changed. Try again."), threshold validation failure (inline, next to the relevant Settings input, not toast-only).

UX-DR17: Add the "Spending" view to the History page's Information Architecture, alongside the existing "Trips" view — two-tab structure (matches the trip-detail tab pattern), not a toggle or separate page/route.

UX-DR18: Build the Spending view header — date filter as a dropdown (This Year / Last Year / Last 12 Months / All Time, default This Year), deliberately visually distinct from the Trips/Spending tab toggle (segmented control). A short helper line beneath the filter states the trip-inclusion rule, e.g. "Includes any trip overlapping this period."

UX-DR19: Build `headline-figure` — three plain stat figures (no chart-card wrapper) below the date filter: Total Spend, Average Trip Spend, Average Daily Spend, in that order. Never hidden — shows $0/$0/$0 when zero trips match the filtered range (FR20).

UX-DR20: Build `chart-card` — wraps each of the 3 Spending-view charts individually (bordered, rounded, padded, matching `field-row`'s card treatment); a chart's legend always sits inside its own card.

UX-DR21: Build `donut-chart` shared base (the "donut with text" pattern) — centered figure + legend below. Category and destination donuts center on total spend; budget adherence centers on trip count ("4 Trips" / "1 Trip", singular/plural).

UX-DR22: Build `category-donut-palette` — 11 segments (one per `ExpenseCategory` value); direct segment labels where space allows, legend + tooltip fallback for small segments; color is secondary to label/legend text.

UX-DR23: Build `budget-adherence-donut` — 3 segments (under = `accent-brand`, on = `warning`, over = `destructive`, same semantics as the Budget tab's threshold states); a caption notes "on budget" means within 2% of the budget total, since the ±2% band isn't self-evident from the chart alone.

UX-DR24: Build `destination-donut-palette` — per-country segments, same hue-generation convention as the category palette but sized to the number of distinct countries in range; "Unknown" reuses `fg-4`, slotted in by size like any other segment (no demotion).

UX-DR25: Build the profile currency change confirmation dialog — same shape as the Trip Currency change dialog (Cancel / Leave As Is / Convert); no dialog at all if every Cost Entry's profile-currency conversion already matches the new currency (FR19).

UX-DR26: Implement the two new Spending-view empty states: zero trips ever logged → "Add costs to your trips (reservations, events, misc) and track them over time here." (replaces the entire view); trips exist but none match the filtered range → headline figures still show $0/$0/$0 (never hidden), only the chart-card area is replaced by "No trips in the selected range," filter control stays visible.

UX-DR27: Implement the Travel Retrospective Accessibility Floor additions: every chart's root graphic element carries `role="img"` + a data-summarizing `aria-label`; the category/destination palette and the "Unknown"/budget-adherence colors clear 3:1 non-text contrast (WCAG 1.4.11) against adjacent segments and the chart-card surface; donut center text is a true text node, never image/canvas; date-filter changes announce via a polite live region (e.g. "Showing All Time — 12 trips"); the 3 chart cards follow natural top-to-bottom DOM/tab order.

UX-DR28: Build `expense-table` component — row-per-expense list sitting beneath the `category-tile` grid on the Budget tab; div/card-based (matching `field-row`), not a native `<table>`. Sortable column headers (Date, Amount, Category, Title) toggle ascending/descending on click with a direction icon. Event/reservation-linked rows are clickable and navigate (no edit surface); Misc Expense rows are clickable and open the edit modal. Row targets meet the existing minimum `h-8` interactive sizing.

UX-DR29: Extend `TripAddExpenseModal` into a dual-mode add/edit modal — optional `expense` prop pre-fills fields when editing; footer adds a Remove action (`sm:mr-auto`, matching the existing CostDialog Remove-button convention) alongside Cancel/Save. Remove calls the existing `deleteExpense` action; Save on an existing expense calls the existing `updateExpense` action.

### FR Coverage Map

FR1: Epic 1 - Budget total + currency as comparison target
FR2: Epic 1 - Trip Currency display scope
FR3: Epic 1 - Trip Currency change confirmation
FR4: Epic 1 - Unified Cost Entry creation
FR5: Epic 1 - Actual spend computation
FR6: Epic 1 - Category breakdown
FR7: Epic 1 - Misc Expense entry
FR8: Epic 1 - Per-entry currency conversion
FR9: Epic 1 - Recalculate Conversions action
FR10: Epic 1 - Threshold settings
FR11: Epic 1 - Threshold status indicator
FR22: Epic 1 - Expense table on Budget tab
FR12: Epic 2 - Spending view on History page
FR13: Epic 2 - Date filter + trip-inclusion rule
FR15: Epic 2 - Category breakdown donut
FR16: Epic 2 - Destination breakdown donut
FR17: Epic 2 - Budget adherence donut
FR18: Epic 2 - Average daily spend
FR19: Epic 2 - Profile currency change confirmation
FR20: Epic 2 - Total spend figure
FR21: Epic 2 - Average trip spend figure

## Epic List

### Epic 1: Trip Budget Management
Trip owners/editors can set a budget, track actual spend (auto-summed from events/reservations plus manual Misc Expenses) against it in their Trip Currency, see category breakdowns, get threshold warnings, and handle currency mismatches — all per-trip.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR22

### Epic 2: Travel Retrospective
Users can review spending across their full trip history from a new "Spending" view on the History page — category/destination/budget-adherence breakdowns and headline figures (total/average trip/average daily spend), all driven by one date filter, in their profile currency, with currency-change handling.
**FRs covered:** FR12, FR13, FR15, FR16, FR17, FR18, FR19, FR20, FR21
**Depends on Epic 1:** requires the `expenses` table and `lib/budget.ts` to exist first.

## Epic 1: Trip Budget Management

Trip owners/editors can set a budget, track actual spend (auto-summed from events/reservations plus manual Misc Expenses) against it in their Trip Currency, see category breakdowns, get threshold warnings, and handle currency mismatches — all per-trip.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR22
**Relevant NFRs:** NFR1, NFR2, NFR3, NFR4
**Relevant UX-DRs:** UX-DR1–UX-DR16, UX-DR28, UX-DR29

### Story 1.1: Set Trip Budget & Currency

As a trip owner/editor,
I want to set a budget total and currency on my trip,
So that I have a fixed comparison target for tracking my actual spend.

**Acceptance Criteria:**

**Given** I am editing a trip's budget settings (`TripEditBudget`)
**When** I open the currency field
**Then** I see a dropdown of ISO currency codes (code swatch + currency name + ISO code, ~150 currencies, no search field) — the new shared `currency-picker-row` component (UX-DR7)
**And** selecting a currency shows it highlighted via an `accent-soft` background, no checkmark

**Given** I am editing a trip's budget settings
**When** I enter a budget total and save
**Then** the trip's `budget` and `budgetCurrency` fields are persisted (FR1)
**And** every amount on this trip's Budget tab will display in this currency (Trip Currency), regardless of my profile currency preference (FR2)

**Given** a trip has no budget set yet
**When** I view the Budget tab
**Then** I see a "Set a budget" inline prompt linking to `TripEditBudget`, with no progress bar, badge, or Remaining figure shown (UX-DR11 no-budget-set state)

**Given** I am tabbing through the currency picker
**When** I press `Esc`
**Then** the picker closes without changing the current selection and focus returns to the currency field trigger (NFR3 keyboard operability)

### Story 1.2: Unified Cost Entry on Events/Reservations

As a trip owner/editor,
I want the cost I set on an event or reservation to be tracked as a structured expense,
So that it contributes accurately to my trip's actual spend and category breakdown.

**Acceptance Criteria:**

**Given** the `expenses` table does not yet exist
**When** this story is implemented
**Then** a new `expenses` table is created with `trip_id`, nullable `event_id`/`reservation_id` (all three FKs `onDelete: "cascade"`, matching the `documents` table precedent), `category`, `amount`, `currency`, and the dual-conversion columns (`converted_amount_trip`/`conversion_rate_trip`/`converted_currency_trip`, `converted_amount_profile`/`conversion_rate_profile`/`converted_currency_profile`, populated as null until Story 1.3), `date`, `note`
**And** a new `ExpenseCategory` const-object enum (11 values: Food, Lodging, Transport, Activity, Sightseeing, Gas, Groceries, Flights, CarRental [`"car-rental"`], Shopping, Misc) is added to `src/data/types.ts`
**And** a new `dbExpenseToType()` mapper is added to `db-mappers.ts`

**Given** the existing `Event.cost`/`Reservation.cost` fields
**When** this story is implemented
**Then** those fields are dropped from the schema (not migrated — explicit, intentional data loss per NFR4)
**And** every existing reader of those fields (components, queries, mappers) is located and updated in the same change

**Given** I am setting or editing the cost on an event or reservation
**When** I open the cost field
**Then** I see the redesigned `CostDialog` with a `field-row` stack: currency+amount row, category disclosure row (required, no default selected, no persistent marker — validated inline at save), date row, note row (UX-DR6, UX-DR9)
**And** the currency defaults to Trip Currency, or my profile currency if the trip has none set (FR4)
**And** saving creates or updates a linked `expenses` row rather than a bare numeric field

**Given** I am filling out the `CostDialog`
**When** I tab through the fields
**Then** the tab order is amount → currency → category → date → note → save/cancel (NFR3)

### Story 1.3: Currency Conversion at Entry Time

As a trip owner/editor,
I want my expenses automatically converted to the relevant currencies when I enter them,
So that my Actual figure stays accurate even when I log costs in a different currency.

**Acceptance Criteria:**

**Given** a new `lib/currency.ts` module backed by the Frankfurter (ECB) API
**When** an `expenses` row is created or updated with a currency different from Trip Currency and/or my profile currency
**Then** the system performs a one-time historical-date-specific lookup (`/v1/{date}`, not `/latest`) and stores both the original amount/currency and two independent locked conversions: to Trip Currency (`converted_amount_trip`/`conversion_rate_trip`/`converted_currency_trip`) and to my profile currency (`converted_amount_profile`/`conversion_rate_profile`/`converted_currency_profile`) (FR8)
**And** when both target currencies differ from the entry's currency, both rates are fetched in a single Frankfurter request (`?to=X,Y`)

**Given** the conversion cache in `lib/currency.ts`
**When** a lookup's date is today
**Then** the rate is read from/written to the in-memory `globalThis`-persisted cache, keyed by currency-pair only
**And** when a lookup's date is any other (historical) date, the cache is bypassed entirely — fetched directly every time, so the cache's key-space never grows with distinct dates

**Given** the Frankfurter lookup fails
**When** I save an expense with a mismatched currency
**Then** the expense is saved unconverted (original amount/currency only, no partial conversion state) and I see a toast: "Couldn't convert currency — try again." (UX-DR16)
**And** retry is user-initiated only — never automatic (NFR2)

### Story 1.4: Track Actual Spend & Category Breakdown

As a trip owner/editor,
I want to see my actual spend and a category breakdown on the Budget tab,
So that I know how much I've spent and where it's going without doing any math myself.

**Acceptance Criteria:**

**Given** a trip has one or more `expenses` rows
**When** I open the Budget tab
**Then** I see a header with a big "Actual spent" figure — the sum of all `expenses` for this trip, each converted to Trip Currency at its own locked rate (FR5, built on Story 1.3's conversion)
**And** Budget total and Remaining are shown smaller beneath the Actual figure (UX-DR13)

**Given** a trip has `expenses` rows across multiple categories
**When** I view the category breakdown
**Then** I see one `category-tile` per category with ≥1 item, showing the category name and a subtotal figure (FR6, UX-DR5)
**And** categories with zero items are omitted
**And** tiles wrap at least 2 per row on the narrowest supported viewport

**Given** a trip has zero `expenses` rows
**When** I view the category tile grid area
**Then** I see an inline "No expenses yet" message in place of the grid (UX-DR13 zero-entries state)

**Given** the Actual/category calculations are needed by both `TripBudgetTab` and `TripEditBudget`'s read-only summary
**When** this story is implemented
**Then** the calculation logic lives in a new shared `src/lib/budget.ts` (`calculateActual`, `calculateCategoryBreakdown`) — neither component reimplements the math independently

### Story 1.5: Add Misc Expenses

As a trip owner/editor,
I want to add an expense that isn't tied to any event or reservation,
So that I can track costs like visa fees or other unlinked spend against my budget.

**Acceptance Criteria:**

**Given** I am on the Budget tab
**When** I click "Add Misc Expense"
**Then** the new `TripAddExpenseModal` opens with a `field-row` stack: currency+amount row, category disclosure row (required, no default), date row (defaults to today, past dates allowed), note row (optional, multiline) (FR7, UX-DR10)

**Given** I fill in amount, currency, category, and save
**When** the amount is >0, ≤2 decimal places, and ≤50,000 in entry currency
**Then** a new unlinked `expenses` row is created (no `event_id`/`reservation_id`) and the modal closes
**And** the Budget tab's Actual figure and category tiles update immediately to reflect it

**Given** I enter an amount that is ≤0, has more than 2 decimal places, or exceeds 50,000
**When** I attempt to save
**Then** the save is rejected with an inline validation message (client- and server-side, NFR1)

**Given** the "Add Misc Expense" button
**When** I view the Budget tab toolbar
**Then** it is always visible regardless of trip state (UX-DR13)

### Story 1.6: Recalculate Conversions

As a trip owner/editor,
I want to manually re-fetch conversion rates for my mismatched expenses,
So that I can refresh stale conversions on demand without waiting for a new entry.

**Acceptance Criteria:**

**Given** at least one `expenses` row on this trip has a currency different from Trip Currency
**When** I view the Budget tab toolbar
**Then** I see a "Recalculate Conversions" button (secondary), positioned alongside "Add Misc Expense" (FR9, UX-DR13)

**Given** every `expenses` row's currency already matches Trip Currency, or the trip has zero `expenses` rows
**When** I view the Budget tab toolbar
**Then** the "Recalculate Conversions" button is hidden entirely

**Given** I click "Recalculate Conversions"
**When** the action completes successfully
**Then** every mismatched `expenses` row's Trip-Currency conversion is re-fetched and updated, and the Budget tab's Actual figure reflects the new amounts immediately

**Given** I click "Recalculate Conversions"
**When** the action fails partway through
**Then** no `expenses` row is left partially updated (all-or-nothing) and I see a toast: "Recalculation failed — no amounts were changed. Try again." (UX-DR16, NFR2)

### Story 1.7: Trip Currency Change Confirmation

As a trip owner/editor,
I want to be warned before changing my Trip Currency if it would leave existing expenses mismatched,
So that I don't lose track of which amounts need reconverting.

**Acceptance Criteria:**

**Given** a trip has at least one `expenses` row whose stored currency differs from the new Trip Currency I'm selecting
**When** I change the currency in `TripEditBudget` and attempt to save
**Then** a confirmation dialog appears: "Some of your expenses don't match your new currency selection. Do you want to convert them to this new currency?" with Cancel (ghost, far left), Leave As Is (secondary) + Convert (primary) grouped right (FR3, UX-DR12)

**Given** the confirmation dialog is open
**When** I click "Convert"
**Then** the Trip Currency change commits and the same recalculation routine from Story 1.6 re-fetches rates for every mismatched entry

**Given** the confirmation dialog is open
**When** I click "Leave As Is"
**Then** the Trip Currency change commits but mismatched entries' conversions are left stale until I manually run "Recalculate Conversions" later

**Given** every `expenses` row on the trip already matches the new currency I'm selecting (or there are zero rows)
**When** I change the Trip Currency and save
**Then** no confirmation dialog appears at all — the change commits immediately

### Story 1.8: Configure Spend Threshold Settings

As a user,
I want to set my own warning and danger spend thresholds,
So that the Budget tab's alerts match my personal risk tolerance.

**Acceptance Criteria:**

**Given** I am on Settings → Preferences → Budget
**When** I view the section
**Then** I see two number inputs side by side, "Warning %" and "Danger %", each 0–100, defaulting to 80/90 (FR10, UX-DR14)

**Given** I enter a warning percentage that is greater than or equal to the danger percentage
**When** I attempt to save
**Then** the save is rejected with an inline validation message next to the relevant input — not a toast-only error (UX-DR16)

**Given** I enter a valid warning/danger pair (warning < danger)
**When** I save
**Then** the new thresholds are persisted to my user profile and used by every trip's Budget tab

### Story 1.9: Threshold Status Indicator

As a trip owner/editor,
I want a clear visual signal when my actual spend crosses my warning or danger thresholds,
So that I notice budget risk without having to do math myself.

**Acceptance Criteria:**

**Given** new `warning`/`warning-soft`/`warning-ink` (+ `-dark` variants) and `danger-soft`/`danger-ink` (+ `-dark` variants) CSS custom-property tokens
**When** this story is implemented
**Then** they are added to `globals.css` following the existing `accent` soft/ink pairing convention (UX-DR1)

**Given** my Actual spend is below my warning threshold (FR11 neutral state)
**When** I view the Budget tab and the trip's tab label
**Then** no status badge and no tab icon are shown — silence is the neutral signal

**Given** my Actual spend is at or above my warning threshold but below my danger threshold
**When** I view the Budget tab
**Then** I see a status badge (Warning icon + "Warning") next to the Actual figure, the progress bar fill turns `warning`, and the "Budget" tab label carries the same Warning icon (UX-DR2, UX-DR3, UX-DR4)

**Given** my Actual spend is at or above my danger threshold
**When** I view the Budget tab
**Then** I see a status badge (Error icon + "Over budget") next to the Actual figure, the progress bar fill turns `destructive`, and the tab label carries the same Error icon

**Given** a threshold-crossing action (e.g. saving a Misc Expense that pushes Actual over a threshold)
**When** the save completes
**Then** the status updates immediately with no page reload (FR11)

**Given** the tab status icon
**When** a screen reader encounters the "Budget" tab
**Then** the icon itself is `aria-hidden="true"`, paired with a visually-hidden `<span>` reading "Warning"/"Over budget" so the tab's accessible name becomes "Budget, Warning" (NFR3)

### Story 1.10: View and Manage All Trip Expenses in a Table

As a trip owner/editor,
I want to see every expense on my trip in one sortable table,
So that I can review and manage my spend without hunting through the itinerary or reservations.

**Acceptance Criteria:**

**Given** I am on the Budget tab with at least one `expenses` row
**When** I view the page below the category tile grid
**Then** I see a row-per-expense `expense-table` (UX-DR28) listing every `expenses` row for the trip with Date, Title, Category, and Amount columns (FR22)
**And** Title shows the linked event's name, the linked reservation's provider, or — for a Misc Expense — its note, falling back to its category label when no note is set

**Given** the expense table
**When** I click a column header (Date, Amount, Category, or Title)
**Then** the table re-sorts client-side by that column, ascending on first click and descending on a second click, with an icon indicating current sort direction (FR22, UX-DR28)
**And** no server request is made — sorting operates on the already-loaded `expenses` array

**Given** an expense row linked to an event
**When** I click that row
**Then** I am navigated to the Itinerary tab with that event scrolled into view and highlighted, reusing the existing `?focus=<eventId>` mechanism (FR22)

**Given** an expense row linked to a reservation
**When** I click that row
**Then** I am navigated to the Reservations tab with that reservation scrolled into view and highlighted, reusing the existing reservation highlight mechanism (FR22)

**Given** a Misc Expense row (no event or reservation link)
**When** I click that row
**Then** the Misc Expense modal opens pre-filled with that row's amount, currency, category, date, and note, in edit mode (FR22, UX-DR29)

**Given** the Misc Expense modal is open in edit mode
**When** I click Remove
**Then** the expense is deleted via the existing `deleteExpense` action and the table, Actual figure, and category tiles update immediately (FR22, UX-DR29)

**Given** the Misc Expense modal is open in edit mode
**When** I change a field and click Save
**Then** the expense is updated via the existing `updateExpense` action and the table, Actual figure, and category tiles update immediately (FR22, UX-DR29)

**Given** a trip has zero `expenses` rows
**When** I view the Budget tab
**Then** the existing "No expenses yet" message is shown and no table is rendered (FR22)

## Epic 2: Travel Retrospective

Users can review spending across their full trip history from a new "Spending" view on the History page — category/destination/budget-adherence breakdowns and headline figures (total/average trip/average daily spend), all driven by one date filter, in their profile currency, with currency-change handling.

**FRs covered:** FR12, FR13, FR15, FR16, FR17, FR18, FR19, FR20, FR21
**Relevant NFRs:** NFR1, NFR2, NFR3
**Relevant UX-DRs:** UX-DR17–UX-DR27
**Depends on Epic 1:** requires the `expenses` table (Story 1.2) and `lib/budget.ts::calculateBudgetStatus` (Story 1.4) to exist.

### Story 2.1: Spending View Foundation & Headline Figures

As a user,
I want to see my total spend, average trip spend, and average daily spend across my trip history,
So that I understand my overall travel spending without digging into individual trips.

**Acceptance Criteria:**

**Given** I am on the History page
**When** I view it
**Then** I see a two-tab structure: "Trips" (the existing view, unchanged) and "Spending" (new) — same tab pattern as the trip-detail tab bar, not a toggle or separate route (FR12, UX-DR17)

**Given** I am on the Spending view
**When** I view its header
**Then** I see a date filter dropdown (This Year / Last Year / Last 12 Months / All Time, default This Year), visually distinct from the Trips/Spending tab toggle, with a helper line beneath it: "Includes any trip overlapping this period." (FR13, UX-DR18)

**Given** new `lib/queries.ts::listExpensesForUserInRange(userId, startDate, endDate)` and `lib/spending.ts::buildSpendingSummary(trips, expenses, dateRange)`
**When** this story is implemented
**Then** a trip is included whenever any part of its dates overlaps the selected period — its full spend counts, never a partial slice (FR13)
**And** the date filter is reflected in a URL search param (e.g. `?view=spending&range=this-year`); changing it triggers a standard App Router re-render, not a new Server Action or client fetch
**And** only the finished aggregate ever reaches the client — raw expense rows for the user's full history never do

**Given** the Spending view has loaded data
**When** I view the headline figures below the date filter
**Then** I see three plain stat figures, in order: Total Spend (sum of all filtered spend in my profile currency, FR20), Average Trip Spend (total filtered spend ÷ count of filtered trips, FR21), Average Daily Spend (total filtered spend ÷ total filtered trip-days, FR18) (UX-DR19)
**And** all three are computed from each Cost Entry's already-locked profile-currency conversion — never a render-time recomputation (FR13)

**Given** a trip within the filtered range has no dates set
**When** Average Daily Spend is computed
**Then** that trip is excluded entirely from the calculation — not just from the denominator (FR18)

**Given** I have logged trips but none of them have any spend data at all
**When** I open the Spending view for the first time
**Then** the entire view (filter, headline figures, charts) is replaced by: "Add costs to your trips (reservations, events, misc) and track them over time here." (UX-DR26)

**Given** I have trips with spend data, but none fall within the currently selected date filter
**When** I view the Spending view
**Then** the headline figures still show $0 / $0 / $0 — never hidden (FR20) — and only the chart-card area is replaced by "No trips in the selected range," with the filter control staying visible so I can change it (UX-DR26)

**Given** the date filter changes
**When** the view updates
**Then** the change is announced to assistive tech via a polite live region (e.g. "Showing All Time — 12 trips") (UX-DR27)

### Story 2.2: Category Breakdown Donut

As a user,
I want to see my spend broken down by category across all my trips,
So that I know where my travel money actually goes.

**Acceptance Criteria:**

**Given** new shared `chart-card` and `donut-chart` base components
**When** this story is implemented
**Then** `chart-card` wraps the chart in a bordered, rounded, padded card matching `field-row`'s treatment, and `donut-chart` provides the centered-figure + legend-below pattern (UX-DR20, UX-DR21)
**And** the shadcn chart component (Recharts-based) is installed into `src/components/ui/chart.tsx` via the standard add flow
**And** new `--chart-1` through `--chart-11` CSS custom properties are added to `globals.css` (light + dark variants)

**Given** filtered `expenses` rows spanning multiple `ExpenseCategory` values
**When** I view the category breakdown donut
**Then** I see one segment per category present, sized by category subtotal, centered on total category-tagged spend (FR15, UX-DR22)
**And** segments use direct labels where space allows, with legend + tooltip fallback for small segments — color is secondary to the label/legend text

**Given** the category donut's segments
**When** rendered
**Then** every adjacent segment pair clears 3:1 non-text contrast (WCAG 1.4.11) against each other and against the chart-card surface (UX-DR27)
**And** the chart's root graphic element carries `role="img"` and a data-summarizing `aria-label` (e.g. "Category breakdown donut chart: Lodging $1,200, Food $640...") independent of the on-screen legend text

### Story 2.3: Destination Breakdown Donut

As a user,
I want to see my spend broken down by destination country across all my trips,
So that I know which places I've spent the most money traveling to.

**Acceptance Criteria:**

**Given** filtered trips with a `destinationCountryCode` set
**When** I view the destination breakdown donut
**Then** I see one segment per distinct country present, sized by that country's total spend, centered on total spend (FR16)
**And** grouping uses `destinationCountryCode` (the structured ISO code), not the free-text `destinationCountry` display name

**Given** a filtered trip has no destination set
**When** I view the destination breakdown donut
**Then** its spend is grouped under an "Unknown" segment, slotted in by size like any other segment — `fg-4` fill, no demotion to a smaller or separated wedge (FR16, UX-DR24)

**Given** the destination donut's segment palette
**When** rendered
**Then** it follows the same hue-generation convention as the category palette, sized to the number of distinct countries in range (cycling if that count ever exceeds 11) — not a separate hand-picked palette (UX-DR24)

**Given** the destination donut
**When** rendered
**Then** it carries the same `role="img"` + `aria-label` requirement as the category donut (UX-DR27)

### Story 2.4: Budget Adherence Donut

As a user,
I want to see how many of my trips came in under, on, or over budget,
So that I can gauge my overall budgeting accuracy across all my travel.

**Acceptance Criteria:**

**Given** filtered trips that have a budget set
**When** I view the budget adherence donut
**Then** I see 3 segments — under budget (`accent-brand`), on budget (`warning`), over budget (`destructive`) — counting how many filtered trips fall in each band, centered on the count ("4 Trips" / "1 Trip", singular/plural handled) (FR17, UX-DR21, UX-DR23)
**And** "on budget" means each trip's Actual/Budget percentage falls within ±2% of 100% — reusing `lib/budget.ts::calculateBudgetStatus`'s existing per-trip percentage (currency-invariant, no profile-currency conversion needed for this chart)

**Given** a filtered trip has no budget set
**When** the budget adherence count is computed
**Then** that trip is excluded entirely from the count (FR17)

**Given** the ±2% "on budget" band
**When** I view the chart
**Then** a caption or legend note states "on budget" means within 2% of the budget total — the band isn't self-evident from the chart alone (UX-DR23)

**Given** the budget adherence donut
**When** rendered
**Then** it carries the same `role="img"` + `aria-label` requirement as the other two donuts (UX-DR27)

### Story 2.5: Profile Currency Change Confirmation

As a user,
I want to be warned before changing my profile currency if it would leave existing expenses' cross-trip figures stale,
So that I understand my Spending view numbers stay accurate.

**Acceptance Criteria:**

**Given** at least one `expenses` row has a profile-currency conversion (`converted_amount_profile`) locked under my current profile currency
**When** I change my profile currency in Settings → Preferences and attempt to save
**Then** a confirmation dialog appears, same shape as the Trip Currency change dialog: Cancel (ghost, far left), Leave As Is (secondary) + Convert (primary) grouped right (FR19, UX-DR25)

**Given** the confirmation dialog is open
**When** I click "Convert"
**Then** the profile currency change commits and every `expenses` row's profile-currency conversion is recalculated synchronously (no background job), with a loading state while it runs (FR19)

**Given** the confirmation dialog is open
**When** I click "Leave As Is"
**Then** the profile currency change commits but existing profile-currency conversions are left stale (no automatic recalculation)

**Given** every `expenses` row's profile-currency conversion already matches my new profile currency selection, or there are zero `expenses` rows
**When** I change my profile currency and save
**Then** no confirmation dialog appears at all — the change commits immediately (mirrors FR3/Story 1.7's no-mismatch case)

**Given** the new `changeProfileCurrency` Server Action
**When** it runs
**Then** it is gated by `requireUser()` only — no trip-role check, since this is a user-scoped action, not a trip-scoped one
