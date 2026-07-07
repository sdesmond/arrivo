---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: "complete"
completedAt: "2026-06-24"
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-06-23/prd.md
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-06-23/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-06-23/reconcile-brainstorming-session.md
  - _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-06-24/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-06-24/EXPERIENCE.md
  - docs/drizzle-workflow.md
  - _bmad-output/project-context.md
workflowType: "architecture"
project_name: "Packt"
user_name: "Spencer"
date: "2026-06-24"
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

21 FRs total (FR-1–FR-21, less FR-14, retired during the UX pass — see PRD §6 Non-Goals). All FRs are in scope; Travel Retrospective is no longer Phase 2/deferred. Grouped:

- Budget Definition (FR-1, FR-2, FR-3): `Trip.budget` becomes the live comparison target; Trip Currency overrides user profile preference within a trip; currency changes need a recalculation confirmation when existing Cost Entries mismatch.
- Unified Cost Entry (FR-4): `Event.cost`/`Reservation.cost` (bare numeric fields) are dropped — not migrated — replaced by a link to a shared `expenses` table row.
- Actual Spend Tracking (FR-5, FR-6): Actual is a single sum over `expenses`, converted to Trip Currency at each row's own locked rate; category breakdown groups the same data.
- Misc Expense Entry (FR-7, FR-8, FR-9): unlinked `expenses` rows entered directly on the Budget tab; per-entry currency conversion at write time; manual "Recalculate conversions" action re-fetches rates for mismatched rows.
- Threshold Alerts (FR-10, FR-11): per-user configurable warning/danger percentages; three-state visual indicator (neutral/warning/danger) on the Budget tab and tab label.
- Travel Retrospective — Spending view (FR-12, FR-13): new "Spending" view on the existing History page, alongside "Trips"; a single date filter (This Year/Last Year/Last 12 Months/All Time, default This Year) drives every figure and chart; trip-level inclusion uses any-date-overlap (a trip's full spend counts if any part of its dates falls in range, never a partial slice).
- Travel Retrospective — Charts & figures (FR-15–FR-18, FR-20, FR-21): category breakdown donut, destination breakdown donut (country-code level), budget adherence donut (under/on/over, ±2% "on budget" band, trips with no budget excluded), average daily spend, total spend, average trip spend — all in the user's profile currency, all derived from each Cost Entry's already-locked profile-currency conversion (never render-time).
- Travel Retrospective — Profile currency change (FR-19): mirrors FR-3's Trip Currency change handling, but synchronous (no background job) given current single-user scale.

**Non-Functional Requirements:**

- Financial accuracy: amounts validate >0, ≤2 decimals, stored as Postgres `numeric` strings via the existing `db-mappers.ts` convention — no floating-point currency math.
- External dependency reliability: Frankfurter (ECB) conversion lookup is a synchronous write-time dependency for 6 call sites (FR-4, FR-7, FR-9, FR-3's recalculate path, FR-19's recalculate path, and now date-specific historical lookups rather than `/latest`) — all share one failure mode: toast error, no partial save/update, retry is user-initiated only, never automatic.
- Accessibility: WCAG 2.1 AA, color-blind-safe — every warning/danger state pairs color with a distinct icon (status badge, progress bar, tab icon) across both light/dark themes; contrast margins already checked in DESIGN.md (light-mode `warning`/`surface-2` pairing is the tightest at ~3.18:1). Travel Retrospective's donut charts extend the same floor to chart form: labels/legend are the primary signal, color is secondary, and every chart-only color (the category/destination palette) must independently clear 3:1 non-text contrast against adjacent segments and the chart-card surface.
- Data migration: `cost` field removal from `Event`/`Reservation` is an explicit, intentional non-migration — pre-feature trips show $0 Actual until costs are re-entered.

**Scale & Complexity:**

- Primary domain: full-stack web (Next.js App Router, Drizzle/Postgres, Auth.js) — single-tenant per trip; Travel Retrospective adds one cross-trip, user-scoped (not trip-scoped) read surface.
- Complexity level: medium — one cohesive feature pair, but it touches a cross-cutting concept (`cost`) that ripples through existing Event/Reservation read paths, plus a genuinely new aggregation layer (cross-trip, date-filtered, dual-currency).
- Estimated architectural components: 1 new table (`expenses`, dual-conversion columns), 1 new mapper (`dbExpenseToType`), 1 new currency utility (`lib/currency.ts`, historical-date aware), 1 new aggregation utility (`lib/spending.ts`), 1 new tab component (`TripBudgetTab`), 1 new modal (`TripAddExpenseModal`), 1 redesigned dialog (`CostDialog`), 1 redesigned form (`TripEditBudget`), 2 new confirmation dialogs (Trip Currency change, profile currency change), 1 shared currency-picker overlay, 1 Settings section, 1 new Spending view with 3 chart components + headline figures + date filter.

### Technical Constraints & Dependencies

- Drizzle is pre-release (per `docs/drizzle-workflow.md`): schema changes go through `db:push`, no tracked migration files yet — the new `expenses` table and the `cost` column drops are schema-only edits, no migration-generation step required at this stage.
- Existing conventions to follow: const-object enums (shared `category` enum, no `enum` keyword), `db-mappers.ts` pattern, `requireUser()` + `assertTripAccess()` on every server action, `revalidatePath` after mutations, CSS custom-property tokens (new `warning`/`danger-soft` tokens already defined in DESIGN.md, new `--chart-1`–`--chart-11` tokens to be added for Travel Retrospective).
- No new real-time/polling infrastructure — relies entirely on existing `revalidatePath` revalidation; background rate refresh is explicitly banned (PRD §6 Non-Goals, EXPERIENCE.md Banned list). The Spending view's date filter uses a URL search param + standard App Router re-fetch on navigation, not a new client-fetch mechanism.
- One shared currency-picker overlay and one shared category enum/list serve all three entry surfaces (CostDialog, Misc Expense modal, TripEditBudget) — must not fork into separate implementations.
- `destinationCountryCode` (structured ISO code, set via the existing Mapbox-backed destination picker) and `users.currency` (profile preferred currency) already exist in the schema today — Travel Retrospective's destination grouping and profile-currency comparisons read these directly, no new fields needed for either.
- Frankfurter's historical endpoint (`/v1/{date}`) supports multiple `to` currencies in one request — the dual Trip-Currency + profile-currency conversion at entry time is one API call, not two, whenever both targets differ from the entry's own currency.

### Cross-Cutting Concerns Identified

- **`expenses` table replacing `cost` everywhere it's currently read** — addendum flags the find-and-fix pass across existing Event/Reservation cost readers as likely the largest single implementation step.
- **Shared currency-conversion utility** with one uniform failure mode across 6 call sites (event/reservation cost save, Misc Expense save, manual recalculate, Trip Currency change recalculate, profile currency change recalculate) and a switch from `/latest` to historical date-specific lookups throughout.
- **Per-user threshold settings** consumed by every trip's Budget tab — global user state read in a per-trip context.
- **One category enum + one currency list** shared by every cost-entry surface, not duplicated per component.
- **Cross-trip aggregation** (`lib/spending.ts`) is the one genuinely new computational concern this feature pair introduces — every other piece of Travel Retrospective (filtering, currency, charts) is additive to an existing pattern, but nothing in the codebase today aggregates across a user's full trip history. One function (`buildSpendingSummary`) must own all of it (figures + all 3 charts) to avoid the same "two components reimplement the same math" gap `lib/budget.ts` was created to prevent.
- **Cache key-space boundedness**: switching `lib/currency.ts` to historical-date lookups must not let the in-memory `globalThis`-persisted cache grow unbounded — resolved by caching only "today" lookups (bounded by currency-pair count) and fetching historical (non-today) dates directly, uncached, every time.

## Starter Template Evaluation

**Not applicable.** Packt is an existing, fully-built codebase (Next.js 16.2.4, React 19.2.4, TypeScript strict, Tailwind v4, @base-ui/react + shadcn, Drizzle ORM + Postgres, Auth.js v5 — all locked in per `project-context.md`). This feature is additive to the established stack; no starter template or project initialization applies.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

- `expenses` table FK cascade behavior
- Access role gate for new actions
- Currency-rate cache implementation
- Validation approach for new fields
- File location for new server actions
- `expenses` dual-conversion column shape (Trip Currency + profile currency)
- Currency conversion endpoint switch (historical date-specific vs. `/latest`) and cache-key implications
- Where cross-trip aggregation logic and queries live
- Date-filter state mechanism for the Spending view (URL search param vs. client fetch)
- Chart library and chart-color-token convention

**Important Decisions (Shape Architecture):**

- None beyond the above — this feature largely inherits existing architectural conventions.

**Deferred Decisions (Post-MVP):**

- App-wide zod adoption — raised during discussion but explicitly deferred. Introducing zod for only this feature's fields would leave the rest of the codebase's inline-validation convention inconsistent; retrofitting every existing action is a separate, larger refactor unrelated to this PRD. Scope as its own architecture decision later if pursued.
- Exact 11-step category-palette hex values and per-country palette cycling beyond 11 distinct countries — deferred to implementation per DESIGN.md, with a contrast-verification requirement (3:1 non-text contrast, no similar-hue-and-lightness adjacency) rather than fixed values decided here.

### Data Architecture

- **`expenses` table FK cascade**: mirrors the existing `documents` table precedent exactly — `tripId`, `eventId` (nullable), `reservationId` (nullable), all three `onDelete: "cascade"`. Deleting an event, reservation, or trip deletes its linked expense rows; no orphan-to-Misc-Expense fallback.
- **Migration approach**: schema-only edit via `db:push` — Drizzle is pre-release (`docs/drizzle-workflow.md`), no tracked migration files to generate yet.
- **Validation strategy**: inline checks within action functions, matching every existing action in `actions.ts` (e.g. `createEvent`/`updateEvent`'s handling of `cost`) — no new validation library (zod) introduced for this feature. See Deferred Decisions above.
- **Max amount ceiling** (resolves PRD §9 Assumptions Index, FR-7): fixed at **50,000** in entry currency, client- and server-side — not derived from budget.
- **Caching strategy**: currency conversion rates cached in-memory in `lib/currency.ts` (`Map<string, { rate: number; fetchedAt: number }>`), TTL ~1hr, persisted across hot reloads via `globalThis` — same survival pattern as `globalThis.__pgClient` in `src/db/index.ts`. **Travel Retrospective revision**: `convert()` now takes a required `date` param and calls Frankfurter's `/v1/{date}` historical endpoint instead of `/latest`, requesting both target currencies (Trip Currency + profile currency) in one call via `?to=X,Y` whenever they differ. The cache stays keyed by currency-pair only (`${from}:${to}`) and is used **only when `date` is today** — any historical (non-today) date bypasses the cache and fetches directly every time. This keeps the cache's key-space bounded (currency pairs, same as before) rather than growing unboundedly with every distinct date ever requested, given same-day-entry cache hits are the only case worth optimizing for.
- **`expenses` dual-conversion columns**: `converted_amount_trip` / `conversion_rate_trip` / `converted_currency_trip` and `converted_amount_profile` / `conversion_rate_profile` / `converted_currency_profile` — six columns replacing the original single `converted_amount`/`conversion_rate` pair (table not yet implemented, so this is the column set it ships with, not a migration). Each pair's currency code is stored explicitly rather than inferred from "whatever the current setting is," per addendum.
- **Cross-trip aggregation query**: new `listExpensesForUserInRange(userId, startDate, endDate)` in `lib/queries.ts` (extends the existing file, no new query-file convention) — applies FR-13's any-date-overlap trip-inclusion rule at the trip level, then returns expense rows for every included trip.
- **Cross-trip aggregation logic**: new `src/lib/spending.ts`, mirroring the `lib/budget.ts` pattern — one pure function `buildSpendingSummary(trips, expenses, dateRange)` computing total spend, average trip spend, average daily spend, category breakdown, destination breakdown, and budget adherence in a single pass. Budget adherence reuses `lib/budget.ts::calculateBudgetStatus` per-trip (the Actual/Budget percentage is currency-invariant since both sides are already in Trip Currency) — no profile-currency conversion needed for that one chart, unlike every other figure here.

### Authentication & Security

- **Access role gate**: every new expense action (create/update/delete expense, recalculate conversions, Trip Currency change) requires `"editor"` minimum via `assertTripAccess(tripId, user.id!, "editor")` — identical to every existing write in `actions.ts`. No special-casing Trip Currency change to `"owner"`.
- **Travel Retrospective access**: the Spending view and the profile-currency-change action are user-scoped, not trip-scoped — `requireUser()` only, same as the existing Travel History page's `listTripsForUser(session.id!)` call. No `assertTripAccess` applies since nothing here is gated by a per-trip role.

### API & Communication Patterns

- Server Actions only, following the existing `"use server"` + colocated `actions.ts` pattern — no new route handlers introduced.
- Error handling: toast via `sonner`, matching existing convention (`toast.error(message)` / `toast.success(message)`) — no new error-handling abstraction.
- `revalidatePath(\`/trips/\${tripId}\`)` after every mutation, matching existing convention — no new revalidation strategy.
- **Spending view date filter**: reflected in a URL search param (e.g. `/travel-history?view=spending&range=this-year`) — `page.tsx` reads `searchParams`, fetches + aggregates server-side, passes the result down. Changing the filter is a client-side navigation that triggers a standard App Router re-render, not a new Server Action or client-fetch mechanism. Aggregated chart/figure data only ever reaches the client — raw expense rows for a user's full history never do.
- **New action**: `changeProfileCurrency` (mirrors `changeTripCurrency`'s confirm/recalculate shape), added to the existing Preferences/profile actions file — `requireUser()` only, no trip-role gate.

### Frontend Architecture

- New components follow the existing `page.tsx` (Server Component, data fetch) / `page-client.tsx` (Client Component, render) split.
- Budget tab is added to the existing `TABS` array in `page-client.tsx`, following the existing tab-bar pattern (`bottom-tab-bar.tsx`) — no new routing or state-management library.
- **Chart library**: shadcn's chart component (Recharts-based, themed via the existing CSS-custom-property system) — confirmed as the actual decision, not a working assumption. Added via the standard shadcn add flow into `src/components/ui/`.
- **Chart color tokens**: new `--chart-1` through `--chart-11` CSS custom properties in `globals.css` (light + dark variants) — exact hue values are an implementation-time decision (per DESIGN.md, verified against the 3:1 non-text-contrast + no-similar-hue-and-lightness-adjacency rule), architecture fixes only the naming/location/light-dark convention. The destination donut reuses the same tokens, cycling if a user's distinct-country count ever exceeds 11 (an edge case not worth a second palette).
- Travel Retrospective adds the History page's two-tab structure (Trips/Spending) to `page-client.tsx`, plus new domain components in `src/components/packt/`: `spending-view.tsx`, `spending-date-filter.tsx`, `spending-headline-figures.tsx`, `category-breakdown-donut.tsx`, `budget-adherence-donut.tsx`, `destination-breakdown-donut.tsx`, `profile-currency-change-dialog.tsx`.

### Infrastructure & Deployment

- No infrastructure changes — this is an additive application feature on the existing deployment, hosting, and CI/CD setup.

### Decision Impact Analysis

**Implementation Sequence:**

Follows the addendum's dependency-ordered sequence for FR-1–FR-11 (category enum → `expenses` schema [now with dual-conversion columns from the start] → drop `Event.cost`/`Reservation.cost` + find-and-fix pass → `dbExpenseToType()` mapper → parallel: `TripEditBudget` currency dropdown, cost-entry dialog rework, `lib/currency.ts` [now historical-date aware] → Misc Expense modal → Budget tab → Settings thresholds → Recalculate Conversions → Trip Currency change dialog). Travel Retrospective's own sequence is derived fresh, since it depends on `expenses` existing first: `lib/queries.ts::listExpensesForUserInRange` → `lib/spending.ts::buildSpendingSummary` → chart color tokens (`--chart-N`) → shadcn chart component install → Spending view components (date filter → headline figures → 3 donuts) → History page two-tab structure → profile currency change action + dialog.

**Cross-Component Dependencies:**

- New `src/app/(app)/trips/[tripId]/budget/actions.ts` (mirroring the `reservations/actions.ts` convention) houses create/update/delete expense, recalculate conversions, and Trip Currency change actions — kept separate from the existing `[tripId]/actions.ts` (events/checklists/etc.) since it's a distinct concern.
- `lib/currency.ts`'s cache and conversion utility is shared by all 6 call sites (event/reservation cost save, Misc Expense save, manual recalculate, Trip Currency change recalculate, profile currency change recalculate) — one implementation, not duplicated per call site.
- The `documents`-table FK precedent now has a second consumer (`expenses`) — both tables share the identical `tripId`/`eventId`/`reservationId` nullable-cascade shape.
- `lib/spending.ts` depends on `lib/budget.ts::calculateBudgetStatus` for the budget-adherence chart — not a duplicate implementation, a direct reuse across the per-trip and cross-trip layers.
- The Spending view's chart components all depend on the same `buildSpendingSummary()` output shape — no chart independently re-queries or re-aggregates.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

Most naming/structure/format/communication/process patterns are inherited from existing codebase conventions (Drizzle camelCase-in-TS/snake_case-in-DB, const-object enums, Server Actions + `revalidatePath`, toast errors, ISO dates, numeric-string money fields, colocated unit tests). One new naming decision was needed: the shared expense category enum, expanded per user direction beyond the PRD's original 5-value glossary list.

### Naming Patterns

**Database Naming Conventions:**

- Table: `expenses` (plural, matches `events`/`reservations`/`documents`). Columns snake_case: `trip_id`, `event_id`, `reservation_id`, and the dual-conversion set `converted_amount_trip`, `conversion_rate_trip`, `converted_currency_trip`, `converted_amount_profile`, `conversion_rate_profile`, `converted_currency_profile` — camelCase in TS via Drizzle's existing column mapping.

**Code Naming Conventions:**

- Action functions: `createExpense`/`updateExpense`/`deleteExpense` (matches `createEvent`/`updateEvent`/`deleteEvent`), plus `recalculateConversions`, `changeTripCurrency`, and `changeProfileCurrency` (Travel Retrospective).
- Components: `TripBudgetTab`, `TripAddExpenseModal` (new), `CostDialog` (redesigned existing), `TripEditBudget` (redesigned existing) — names fixed by addendum/EXPERIENCE.md. Travel Retrospective adds: `SpendingView`, `SpendingDateFilter`, `SpendingHeadlineFigures`, `CategoryBreakdownDonut`, `BudgetAdherenceDonut`, `DestinationBreakdownDonut`, `ProfileCurrencyChangeDialog` — names match their EXPERIENCE.md Component Patterns rows 1:1.
- Mapper: `dbExpenseToType()` in `db-mappers.ts`, matching `dbTripToType()` etc.
- Query: `listExpensesForUserInRange(userId, startDate, endDate)` in `lib/queries.ts`, matching the existing `listTripsForUser` naming shape.
- Aggregation: `buildSpendingSummary(trips, expenses, dateRange)` in `lib/spending.ts` — the one function producing every Spending-view figure and chart input, per the Core Architectural Decisions reuse rule.
- Date filter type: a const-object enum matching every other enum in the codebase — `SpendingDateRange = { ThisYear: "this-year", LastYear: "last-year", Last12Months: "last-12-months", AllTime: "all-time" }` — also doubles as the literal value set for the `range` URL search param.
- **Expense category enum** — multi-word values follow the existing kebab-case precedent (`RentalCar: "rental-car"` in `ReservationType`), single-word values stay lowercase:

  ```ts
  export const ExpenseCategory = {
    Food: "food",
    Lodging: "lodging",
    Transport: "transport",
    Activity: "activity",
    Sightseeing: "sightseeing",
    Gas: "gas",
    Groceries: "groceries",
    Flights: "flights",
    CarRental: "car-rental",
    Shopping: "shopping",
    Misc: "misc",
  } as const;
  export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];
  ```

  Expands the PRD glossary's 5 values (food/lodging/transport/activity/misc) to 11 per user direction during architecture review.

### Structure Patterns

- Unit tests colocated next to source (`*.test.ts`/`*.test.tsx`), never `__tests__/` — existing convention. Applies to `lib/spending.ts` → `lib/spending.test.ts` and every new Travel Retrospective component.
- New actions in `src/app/(app)/trips/[tripId]/budget/actions.ts` (decided in Core Architectural Decisions). `changeProfileCurrency` goes in the existing Preferences/profile actions file, not a new Travel-Retrospective-specific actions file.
- E2E features/steps in `tests/e2e/features/` and `tests/e2e/steps/`.
- New chart UI primitive installed into `src/components/ui/` via shadcn's standard add flow — not hand-rolled, not placed in `src/components/packt/`.

### Format Patterns

- `amount`, and the dual-conversion `converted_amount_trip`/`converted_amount_profile` columns, stored as Postgres `numeric` strings, parsed to `number` in `db-mappers.ts` — same convention as every other money field.
- `conversion_rate_trip`/`conversion_rate_profile` stored the same way (numeric strings), not float columns.
- Dates: `date` column is ISO 8601 date string, matching project convention.
- No API response envelope — Server Actions return typed values or throw; client catches and toasts.
- Spending view date filter is a literal-value URL search param (`?range=this-year`), not a JSON-encoded or freeform string — values are exactly the `SpendingDateRange` enum's string values.

### Communication Patterns

- No event system / pub-sub — state propagates via `revalidatePath` + Server Component refetch, matching every existing mutation. The Spending view's date filter propagates via URL search param + standard App Router navigation/re-render — same "no new mechanism" principle applied to a read rather than a write.

### Process Patterns

- Validation: client + server, inline. Amount validation rejects ≤0, >2 decimal places, and above **50,000** in entry currency (resolves PRD §9 Assumptions Index for FR-7).
- Retry: user-initiated only for conversion failures, never automatic (PRD FR-8/FR-9).
- Currency cache reads: bypass the cache entirely for any `date` other than today (resolves the unbounded-key-space concern raised during architecture review) — only today-dated lookups are cache-eligible.

### Enforcement Guidelines

**All AI Agents MUST:**

- Use the `ExpenseCategory` const-object enum above for every category field — no freeform strings, no per-surface duplicate lists.
- Route all new expense/budget mutations through `src/app/(app)/trips/[tripId]/budget/actions.ts`, never inline in components or in the existing `[tripId]/actions.ts`.
- Use `dbExpenseToType()` for every read of the `expenses` table — never map raw rows in queries or actions.
- Compute every Spending-view figure and chart input exclusively through `lib/spending.ts::buildSpendingSummary()` — never reimplement a sum/average/breakdown inline in a chart component.
- Pass `date` to every `lib/currency.ts::convert()` call and never let a historical (non-today) lookup populate or read the cache.
- Every chart component (`category-breakdown-donut.tsx`, `budget-adherence-donut.tsx`, `destination-breakdown-donut.tsx`) must set `role="img"` and a data-summarizing `aria-label` on its root chart element — per DESIGN.md `donut-chart.accessible-name`, the chart graphic needs its own accessible name independent of legend/label text (caught during this update's validation pass, see Gap Analysis).

### Pattern Examples

**Good Examples:**

- `category: ExpenseCategory.CarRental` — typed, matches the shared enum.
- `await assertTripAccess(tripId, user.id!, "editor")` before any expense mutation, matching every existing action.
- `buildSpendingSummary(trips, expenses, range).categoryBreakdown` consumed directly by `CategoryBreakdownDonut` — no parallel aggregation in the component.

**Anti-Patterns:**

- Hardcoding `"car-rental"` or `"car_rental"` as a string literal instead of `ExpenseCategory.CarRental`.
- Adding a second, feature-local category list for the Misc Expense modal that drifts from `CostDialog`'s.
- A chart component calling `listExpensesForUserInRange` directly and aggregating its own subset of the data instead of reading from `buildSpendingSummary()`'s shared output.

## Project Structure & Boundaries

### Complete Project Directory Structure

This is a brownfield feature — rather than a generic full project tree, this is the concrete set of new and modified files within the existing structure, mapped to FRs.

```
src/
├── data/
│   └── types.ts                                    [MODIFIED] — add ExpenseCategory enum, Expense interface,
│                                                       CreateExpenseInput/UpdateExpensePatch; remove Event.cost/
│                                                       Reservation.cost; remove Budget.perPerson references
├── db/
│   └── schema.ts                                    [MODIFIED] — add `expenses` table (trip_id, event_id, reservation_id
│                                                       nullable cascade, category, amount, currency, converted_amount_trip,
│                                                       conversion_rate_trip, converted_currency_trip, converted_amount_profile,
│                                                       conversion_rate_profile, converted_currency_profile, date, note);
│                                                       drop events.cost / reservations.cost
├── lib/
│   ├── db-mappers.ts                                [MODIFIED] — add dbExpenseToType(); drop cost mapping from
│                                                       dbEventToType()/dbReservationToType()
│   ├── currency.ts                                  [NEW] — Frankfurter historical-date API client (`/v1/{date}`,
│   │                                                    multi-`to` batched), in-memory rate cache (today-only, no TTL
│   │                                                    needed for historical dates since they're never cached),
│   │                                                    globalThis-persisted, convert()/recalculate() utilities (FR-8/9)
│   ├── currency.test.ts                              [NEW]
│   ├── budget.ts                                     [NEW] — pure calculation functions shared by TripEditBudget's
│   │                                                    summary and TripBudgetTab's header: calculateActual(),
│   │                                                    calculateCategoryBreakdown(), calculateBudgetStatus(),
│   │                                                    hasCurrencyMismatch() (FR-1,2,5,6,9,11) — added during
│   │                                                    validation to avoid duplicating the same math in two components
│   ├── budget.test.ts                                [NEW]
│   ├── spending.ts                                   [NEW] — buildSpendingSummary(): total spend, average trip spend,
│   │                                                    average daily spend, category breakdown, destination breakdown,
│   │                                                    budget adherence (reuses budget.ts::calculateBudgetStatus)
│   │                                                    (FR-15,16,17,18,20,21)
│   ├── spending.test.ts                              [NEW]
│   └── queries.ts                                    [MODIFIED] — add listExpensesForUserInRange(userId, startDate,
│                                                        endDate) (FR-13's any-date-overlap inclusion rule)
├── components/
│   └── packt/
│       ├── cost-dialog.tsx                          [MODIFIED] — field-row layout, currency + category fields (FR-4)
│       ├── cost-dialog.test.tsx                      [MODIFIED]
│       ├── trip-edit-budget.tsx                      [MODIFIED] — currency dropdown (replaces free text), read-only
│       │                                                actual/remaining/%/status summary, wires currency-change dialog
│       ├── trip-edit-budget.test.tsx                  [MODIFIED]
│       ├── trip-currency-change-dialog.tsx            [NEW] — Cancel / Leave As Is / Convert (FR-3)
│       ├── trip-currency-change-dialog.test.tsx        [NEW]
│       ├── trip-budget-tab.tsx                        [NEW] — header, progress bar, status badge, category tile grid,
│       │                                                toolbar (FR-1, FR-5, FR-6, FR-11)
│       ├── trip-budget-tab.test.tsx                    [NEW]
│       ├── trip-add-expense-modal.tsx                  [NEW] — Misc Expense entry (FR-7)
│       ├── trip-add-expense-modal.test.tsx              [NEW]
│       ├── currency-picker.tsx                         [NEW] — shared overlay (CostDialog, modal, TripEditBudget)
│       ├── currency-picker.test.tsx                     [NEW]
│       ├── category-picker.tsx                          [NEW] — shared disclosure row + picker for ExpenseCategory
│       ├── category-picker.test.tsx                      [NEW]
│       ├── spending-view.tsx                            [NEW] — top-level Spending view: date filter + headline figures
│       │                                                   + 3 chart cards (FR-12,13)
│       ├── spending-view.test.tsx                        [NEW]
│       ├── spending-date-filter.tsx                      [NEW] — dropdown, drives the `range` URL search param
│       ├── spending-date-filter.test.tsx                  [NEW]
│       ├── spending-headline-figures.tsx                  [NEW] — Total Spend, Average Trip Spend, Average Daily Spend
│       │                                                    (FR-18,20,21)
│       ├── spending-headline-figures.test.tsx              [NEW]
│       ├── category-breakdown-donut.tsx                   [NEW] — FR-15
│       ├── category-breakdown-donut.test.tsx               [NEW]
│       ├── budget-adherence-donut.tsx                     [NEW] — FR-17
│       ├── budget-adherence-donut.test.tsx                 [NEW]
│       ├── destination-breakdown-donut.tsx                [NEW] — FR-16
│       ├── destination-breakdown-donut.test.tsx            [NEW]
│       ├── profile-currency-change-dialog.tsx              [NEW] — mirrors trip-currency-change-dialog.tsx (FR-19)
│       └── profile-currency-change-dialog.test.tsx          [NEW]
├── components/ui/
│   └── chart.tsx                                       [NEW] — shadcn chart primitive (Recharts-based), added via
│                                                            standard shadcn add flow, not hand-rolled
├── app/(app)/
│   ├── globals.css                                     [MODIFIED] — add --chart-1 through --chart-11 (light + dark)
│   ├── trips/[tripId]/
│   │   ├── page-client.tsx                           [MODIFIED] — add `budget` entry to TABS, render TripBudgetTab
│   │   ├── page.tsx                                  [MODIFIED] — fetch expenses alongside existing trip data
│   │   ├── trip-detail-tabs.ts                        [MODIFIED] — add TripDetailTab.Budget = "budget"
│   │   └── budget/
│   │       ├── actions.ts                             [NEW] — createExpense, updateExpense, deleteExpense,
│   │       │                                            recalculateConversions, changeTripCurrency (FR-3,4,7,8,9)
│   │       └── actions.test.ts                          [NEW]
│   ├── travel-history/
│   │   ├── page-client.tsx                            [MODIFIED] — add Trips/Spending two-tab structure, render
│   │   │                                                 SpendingView when `view=spending`
│   │   ├── page.tsx                                   [MODIFIED] — read `view`/`range` searchParams; when Spending,
│   │   │                                                 fetch via listExpensesForUserInRange + buildSpendingSummary
│   │   └── use-travel-history-page-handlers.ts          [MODIFIED] — add Spending-view handlers (filter change → URL
│   │                                                       search param navigation)
│   └── profile/
│       ├── preferences-section.tsx                    [MODIFIED] — add Budget warning/danger threshold inputs (FR-10);
│       │                                                  add currency-change confirmation wiring (FR-19)
│       ├── preferences-section.test.tsx                 [MODIFIED]
│       └── actions.ts                                  [MODIFIED] — add changeProfileCurrency (FR-19)
data/
└── types.ts                                            [MODIFIED, again] — add SpendingDateRange enum, SpendingSummary
                                                            interface (return shape of buildSpendingSummary)
tests/e2e/
├── features/
│   ├── budget.feature                                [NEW] — @feat:budget — UJ-1 flows (FR-1,5,7,11), Trip Currency
│   │                                                     change flow (FR-3)
│   └── spending.feature                              [NEW] — @feat:spending — UJ-2 flow (FR-12,13), profile currency
│                                                         change flow (FR-19)
├── steps/
│   ├── budget.steps.ts                                [NEW]
│   └── spending.steps.ts                              [NEW]
└── feature-map.mjs                                    [MODIFIED] — register budget.feature's source globs (trip-budget-tab,
                                                          trip-add-expense-modal, budget/actions.ts, cost-dialog,
                                                          trip-edit-budget, trip-currency-change-dialog, preferences-section)
                                                          and spending.feature's globs (spending-view and its children,
                                                          travel-history page.tsx/page-client.tsx, lib/spending.ts,
                                                          profile-currency-change-dialog)
```

**Settings note:** "Settings → Preferences → Budget" lands in the existing `profile/preferences-section.tsx` (the codebase has no separate Settings route — Preferences already lives under Profile) rather than a new page.

### Architectural Boundaries

**Data Boundaries:**

- Only `budget/actions.ts` and `db-mappers.ts` touch `expenses` rows directly. Every other consumer (Budget tab, CostDialog, Misc Expense modal, the Spending view) reads through the typed `Expense`/mapper layer — never raw DB rows. `lib/queries.ts::listExpensesForUserInRange` is the only place that queries `expenses` across multiple trips at once.

**Service/Integration Boundaries:**

- `lib/currency.ts` is the only module that calls Frankfurter or holds the rate cache. All 6 call sites (event/reservation cost save, Misc Expense save, manual recalculate, Trip Currency change recalculate, profile currency change recalculate) import from it — no duplicate fetch logic.

**Component Boundaries:**

- `trip-budget-tab.tsx` owns aggregation/display; `trip-add-expense-modal.tsx` and `cost-dialog.tsx` own entry — both call into `budget/actions.ts`, never write to `expenses` directly from client code (Server Actions only).
- `spending-view.tsx` and its 3 chart children own display only — all aggregation lives in `lib/spending.ts::buildSpendingSummary()`, called once in `travel-history/page.tsx`, passed down as props. No chart component queries or aggregates independently.

**Cross-Cutting Boundary:**

- Every existing reader of `event.cost`/`reservation.cost` (components, queries, mappers) must be located and updated in the same change that drops those columns — addendum flags this as the largest single implementation step.

### Requirements to Structure Mapping

**Feature/FR Mapping:**

| FR Category | Lives in |
|---|---|
| Budget Definition (FR-1–3) | `trip-edit-budget.tsx`, `trip-currency-change-dialog.tsx`, `budget/actions.ts::changeTripCurrency` |
| Unified Cost Entry (FR-4) | `cost-dialog.tsx`, `db/schema.ts::expenses`, `db-mappers.ts::dbExpenseToType` |
| Actual Spend Tracking (FR-5–6) | `trip-budget-tab.tsx`, `page.tsx` (data fetch) |
| Misc Expense Entry (FR-7–9) | `trip-add-expense-modal.tsx`, `lib/currency.ts`, `budget/actions.ts` |
| Threshold Alerts (FR-10–11) | `preferences-section.tsx`, `trip-budget-tab.tsx` (status badge/bar), `page-client.tsx` (tab icon) |
| Travel Retrospective — Spending view, filter (FR-12–13) | `spending-view.tsx`, `spending-date-filter.tsx`, `travel-history/page.tsx` (searchParams), `lib/queries.ts::listExpensesForUserInRange` |
| Travel Retrospective — Charts & figures (FR-15–18, FR-20–21) | `category-breakdown-donut.tsx`, `destination-breakdown-donut.tsx`, `budget-adherence-donut.tsx`, `spending-headline-figures.tsx`, `lib/spending.ts::buildSpendingSummary` |
| Travel Retrospective — Profile currency change (FR-19) | `profile-currency-change-dialog.tsx`, `profile/actions.ts::changeProfileCurrency` |

### Integration Points

**Internal Communication:**

Server Actions + `revalidatePath` (no client-side cache/store) — Budget tab re-renders via the same Server Component refetch as every other tab. The Spending view uses URL search params + standard App Router navigation instead, since its trigger is a read (filter change), not a mutation.

**External Integrations:**

Frankfurter (ECB) API, called only from `lib/currency.ts`, only at write/recalculate time — no other external integration. Travel Retrospective doesn't add a new external integration; it changes which Frankfurter endpoint the existing client calls (historical date-specific vs. `/latest`).

**Data Flow:**

Event/reservation save → `expenses` row created/updated → `revalidatePath` → `page.tsx` refetches trip + expenses → `trip-budget-tab.tsx` recomputes Actual/category breakdown/threshold state from the fresh data — no client-side derived-state caching across requests.

Travel Retrospective: filter change → URL search param updates → `travel-history/page.tsx` re-renders (App Router navigation, no Server Action) → `listExpensesForUserInRange` queries the new range → `buildSpendingSummary()` aggregates server-side → `SpendingView` and its 3 chart children receive only the finished aggregate, never raw expense rows.

### File Organization Patterns

Matches existing conventions throughout: colocated `*.test.ts(x)`, domain components in `src/components/packt/`, Server Actions colocated with their route, E2E in `tests/e2e/`. No new configuration, build, or asset organization introduced by this feature. The one new top-level addition is `src/components/ui/chart.tsx` — a shadcn-installed UI primitive, same category as every other file already in that directory.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All decisions are compatible — no conflicting tech choices, no version mismatches; every new decision inherits the existing locked stack (Next.js 16.2.4, Drizzle, Auth.js v5, etc.). The historical-date currency endpoint switch and dual-conversion columns are additive to the original FR-1–11 design, not a redesign of it.

**Pattern Consistency:** Naming, FK cascade, validation, and caching patterns all derive from existing precedents (`documents` table FK shape, `RentalCar` kebab-case convention, `globalThis.__pgClient` survival pattern) — nothing introduces a new convention in isolation. Travel Retrospective's new patterns (`lib/spending.ts`, URL-search-param-driven filtering, shadcn chart primitive) each mirror an existing precedent (`lib/budget.ts`, App Router's native searchParams re-fetch, the existing shadcn component-install flow) rather than inventing a new one.

**Structure Alignment:** Project structure respects every stated boundary (data, currency, component) and supports all decisions made in prior steps.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:** All 20 in-scope FRs (FR-1–FR-21, less retired FR-14) map to a concrete file/function — see the FR → Structure table in Project Structure & Boundaries.

**Non-Functional Requirements Coverage:** Financial accuracy (numeric-string fields + 50,000 max ceiling), external dependency reliability (`lib/currency.ts`'s single failure-mode contract across all 6 call sites), accessibility (icon+color pairing inherited from EXPERIENCE.md, located in `trip-budget-tab.tsx` + `page-client.tsx`; chart color-blind-safety and accessible-name requirements located in the 3 donut components), and data migration (explicit non-migration documented in Data Architecture) are all addressed.

### Implementation Readiness Validation ✅

**Decision Completeness:** Every critical decision (FK cascade, role gate, currency cache, validation approach, action file location, category enum, max ceiling, dual-conversion columns, historical-endpoint cache boundedness, aggregation ownership, date-filter mechanism, chart library/tokens) has a stated rationale and rests on an existing precedent.

**Structure Completeness:** The project tree is feature-specific, not generic placeholder structure — every new/modified file is named with its FR mapping.

**Pattern Completeness:** Enforcement guidelines give agents concrete must/must-not rules (use `ExpenseCategory`, route mutations through `budget/actions.ts`, use `dbExpenseToType()`, compute Spending-view data only through `buildSpendingSummary()`, never cache historical currency lookups, set chart accessible names).

### Gap Analysis Results

**Critical Gap (found and resolved during the original FR-1–11 validation):** `TripEditBudget`'s read-only summary (FR-1) and `TripBudgetTab`'s header (FR-1, FR-5, FR-6, FR-11) both need the same Actual-sum, category-breakdown, and threshold-status math. Without a shared home, the two components would independently reimplement the same calculation. **Resolution:** added `src/lib/budget.ts` (pure functions: `calculateActual`, `calculateCategoryBreakdown`, `calculateBudgetStatus`, `hasCurrencyMismatch`), matching the existing `lib/utils.ts` pattern (`isEventPast`, `isEventNow`). Both components and the Recalculate-button visibility check now consume it.

**Important Gap (found and resolved during this Travel Retrospective update):** The Core Architectural Decisions draft specified chart accessible names at the design-system level (DESIGN.md's `donut-chart.accessible-name`) but the Enforcement Guidelines didn't carry that requirement forward as an agent-facing rule — the same kind of gap `lib/budget.ts` was created to prevent, just at the accessibility layer instead of the calculation layer. **Resolution:** added an explicit Enforcement Guidelines bullet requiring `role="img"` + a data-summarizing `aria-label` on all 3 donut chart components.

**Important Gaps:** None outstanding beyond the one resolved above.

**Nice-to-Have Gaps:** App-wide zod adoption — explicitly raised and deferred (see Decision Priority Analysis); scope as a separate architecture decision if pursued later.

### Validation Issues Addressed

The original critical gap was resolved in-place by adding `lib/budget.ts` to the Project Structure before the FR-1–11 validation was finalized. This update's pass found one additional gap (chart accessible-name enforcement), resolved in-place the same way before re-finalizing.

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — brownfield feature pair inheriting nearly all conventions from an established codebase, with only the genuinely novel pieces (expenses schema, currency utility, category enum, cross-trip aggregation, chart integration) decided fresh.

**Key Strengths:**

- Every new decision mirrors an existing precedent rather than inventing one (`documents` table → `expenses`, `RentalCar` → `CarRental`, `__pgClient` → currency cache, `lib/budget.ts` → `lib/spending.ts`, App Router searchParams → Spending view date filter).
- Shared-logic gaps (`budget.ts`, then the chart accessible-name enforcement rule) each caught during architecture validation rather than during code review or as duplicated/missing logic in production.
- The historical-currency-endpoint cache-boundedness concern (raised during this update's decision walkthrough) was resolved architecturally before implementation, not discovered as a memory-growth bug later.

**Areas for Future Enhancement:**

- App-wide zod adoption (explicitly deferred, not part of this feature).
- Exact 11-step chart color palette (deferred to implementation per DESIGN.md's contrast-verification requirement, not a fixed value set here).

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented in this file.
- Use implementation patterns consistently across all components — in particular, the `ExpenseCategory` enum, `lib/budget.ts` calculation functions, and `lib/spending.ts::buildSpendingSummary` must not be reimplemented or duplicated.
- Respect project structure and boundaries — all `expenses` mutations route through `src/app/(app)/trips/[tripId]/budget/actions.ts`; all currency conversion routes through `src/lib/currency.ts`; all cross-trip aggregation routes through `src/lib/spending.ts`.
- Set `role="img"` + a data-summarizing `aria-label` on every chart component — not optional, caught as a gap during this update's validation.
- Refer to this document for all architectural questions during epic/story breakdown and implementation.

**First Implementation Priority:**

For FR-1–11: Step 1 of the addendum's dependency-ordered sequence — define the `ExpenseCategory` const-object enum in `src/data/types.ts` (independent, unblocks everything else).

For Travel Retrospective (FR-12–21): blocked on `expenses` existing first (it's the data source for every figure and chart). Once that's in place, first priority is `lib/queries.ts::listExpensesForUserInRange` + `lib/spending.ts::buildSpendingSummary` — both independent of UI work and unblock every chart/figure component.
