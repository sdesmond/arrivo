# Addendum — Trip Budget Management & Travel Retrospective

_Implementation-level detail captured during PRD discovery that doesn't belong in the PRD narrative itself. For architecture/epics workflows, not for the PM-facing PRD._

## Schema

- **One unified `expenses` table** for every Cost Entry — event-linked, reservation-linked, and Misc. Per explicit user direction: a single shared table, not separate stores per source.
- `expenses` fields: `trip_id`, `event_id` (nullable), `reservation_id` (nullable), `category`, `amount` (numeric string, Postgres convention), `currency`, `date`, `note`, plus **two independent locked conversions** rather than one: `converted_amount_trip` / `conversion_rate_trip` / `converted_currency_trip` (to Trip Currency, backs FR-5/FR-8) and `converted_amount_profile` / `conversion_rate_profile` / `converted_currency_profile` (to the user's profile currency, backs FR-8/§4.6 Travel Retrospective). Each conversion explicitly stores its own target currency code rather than inferring it from whatever Trip Currency/profile currency currently is — this is what lets staleness be detected correctly after a currency change (FR-3, FR-19). A Misc Expense is a row with `event_id` and `reservation_id` both null.
- `Event.cost` and `Reservation.cost` (`src/data/types.ts`, `src/db/schema.ts` — currently bare `cost: numeric`, no currency/category) are **dropped**, not migrated. Per explicit user direction: existing cost values are abandoned, not carried into `expenses`. Pre-feature trips show $0 Actual until costs are re-entered as Cost Entries.
- One shared `category` enum used by every `expenses` row regardless of source — defined once.
- New `dbExpenseToType()` mapper in `src/lib/db-mappers.ts`, following the existing pattern (`dbTripToType()`, `dbEventToType()`, etc.) — never map raw `expenses` rows directly in queries or actions.
- `dbEventToType()`/`dbReservationToType()` lose their `cost` mapping entirely — see Implementation Sequence steps 3-4 for the required find-and-fix pass across existing readers of `event.cost`/`reservation.cost`.
- `Budget.perPerson` (`src/data/types.ts:403`) is out of scope for this feature entirely — not referenced anywhere in v1 budget tracking behavior.

## Currency Conversion

- Frankfurter (ECB-sourced) API: **date-specific endpoint** (`https://api.frankfurter.dev/v1/{date}`), not `/latest` — every conversion uses the historical rate as of the Cost Entry's own `date`, not "today's rate," so values stay historically accurate regardless of when the entry was actually saved (e.g. a backdated Misc Expense). Applies to event/reservation cost saves (FR-4), Misc Expense saves (FR-7), and both target currencies (FR-8) alike, same utility.
- Each save fetches **two target rates from the same original currency** in one call where possible (Frankfurter supports multiple `to` currencies per request, e.g. `?to=TripCurrency,ProfileCurrency`) — never chains Trip Currency conversion through to profile currency or vice versa.
- No automatic background rate refresh; both rates are locked at entry. The paths to a changed rate are: the user-triggered "Recalculate conversions" action for Trip Currency (PRD FR-9), the "continue and recalculate" choice during a Trip Currency change (PRD FR-3), and the equivalent recalculation for profile currency changes (PRD FR-19) — three entry points into what can be the same underlying recalculation routine, parameterized by which target currency it's refreshing.
- Recalculate-conversions button visibility (Trip Currency, FR-9): query whether any Cost Entry has `currency != trip.budget.currency`; hide the button entirely when false (including trips with zero Cost Entries).
- Profile currency change (FR-19): recalculation runs synchronously across every trip's Cost Entries (not a background job — no job queue exists in this codebase, and current single-user pre-alpha scale doesn't justify adding one); user sees a loading state, same UX shape as FR-9 just wider in scope.
- Cache rates in-memory, TTL ~1 hour, to avoid redundant calls within a session.
- Failure handling: toast error, no partial save (entry) and no partial update (recalculation, either currency) — both all-or-nothing per run (confirmed during PRD finalization).

## Component-Level Notes (from brainstorm + PRD session, not yet validated against current code)

- **Event/reservation cost-entry dialog** (wherever `cost` is currently edited — needs locating in current event/reservation edit UI): add currency dropdown + category select alongside the existing amount input. Backs FR-4.
- **Trip Currency change confirmation dialog** (new, backs FR-3): shown from `trip-edit-budget.tsx` when the user changes the currency dropdown and at least one existing Cost Entry's currency differs from the new selection. Three actions: Cancel, Continue & Recalculate, Continue & Leave As-Is.
- `TripEditBudget` (`trip-edit-budget.tsx`) redesign: currency dropdown (ISO codes, ~150 currencies) replacing free-text input; read-only actual/remaining/%/status indicator once Budget tab exists; wired to the currency-change confirmation dialog above.
- New `TripBudgetTab` component: header (Budget/Actual/Remaining/%/Status), category breakdown table, Add Misc Expense button, conditional Recalculate Conversions button. Per-trip charts are explicitly out of scope here (PRD §6 Non-Goals, DESIGN.md "Don't introduce category-breakdown charts...") — cross-trip charts live separately in Travel Retrospective (FR-15–FR-18).
- New `TripAddExpenseModal` (shadcn Dialog): currency prefix dropdown, category select (required, blank default), date picker (today default), amount input, note textarea.
- Settings → Preferences → Budget section: two number inputs (0–100) for warning/danger thresholds, default 80/90, validated warning < danger.
- **Profile currency change confirmation dialog** (new, backs FR-19): shown from Settings → Preferences when the user changes their preferred currency and at least one existing Cost Entry's profile currency conversion was locked under the old value. Same Cancel / Continue & Recalculate / Continue & Leave As-Is shape as the Trip Currency change dialog (FR-3), reusing the same recalculation routine parameterized for profile currency instead of Trip Currency.

## Implementation Sequence (dependency-ordered; brainstorm's original hour estimates no longer reliable given schema scope grew during PRD review — re-estimate before committing)

1. Define shared category enum (independent)
2. Unified `expenses` table schema + migration: see Schema section above for the full field list (depends on #1)
3. Drop `Event.cost`/`Reservation.cost` columns; find and update every existing query/component reading them directly to instead read the linked `expenses` row (depends on #2 — this is the find-and-fix pass flagged in Schema above, likely the largest single step)
4. `dbExpenseToType()` mapper; update `dbEventToType()`/`dbReservationToType()` to drop their old `cost` field and surface the linked Cost Entry instead (depends on #2, #3)
5. TripEditBudget currency dropdown (independent)
6. Event/reservation cost-entry dialog: now creates/edits a linked `expenses` row instead of a local `cost` field — currency + category fields included (depends on #3, #4)
7. Frankfurter API utility, `lib/currency.ts`, shared by every `expenses` write (independent)
8. Misc Expense entry modal — includes max-amount validation (FR-7) and full keyboard nav (depends on #2, #7)
9. Budget tab with actual calculation, single sum over `expenses` (depends on #5, #6, #7, #8)
10. Settings → Preferences → Budget section (independent)
11. Recalculate-conversions action (FR-9) — re-fetch rates for all mismatched-currency `expenses` rows, conditional button visibility (depends on #7, #9)
12. Trip Currency change confirmation dialog (FR-3) — reuses #11's recalculation routine for the "Continue & Recalculate" path (depends on #5, #11)

This sequence predates Travel Retrospective (§4.6, FR-12–FR-21, less retired FR-14) being added to scope — it covers Budget Definition through Threshold Alerts only. Travel Retrospective's own implementation ordering (dual-conversion schema fields, Spending view, profile currency change dialog) will be derived fresh during the architecture and epics/stories passes, not retrofitted into the numbering above.

## Travel Retrospective — Component & UI Notes (from PRD discovery session, not yet validated against current code)

- **Navigation**: existing History page (`src/app/(app)/travel-history/`) gains a second view, "Spending," alongside the existing "Trips" view (current cards/list of past trips, unchanged, stays the default landing view). Two-tab structure recommended (matches the tab pattern already used in the trip-detail tab bar) rather than a toggle or separate page — user confirmed during discovery.
- **Date filter**: single control — This Year / Last Year / Last 12 Months / All Time, defaulting to This Year — drives every chart on the Spending view. No per-chart filters.
- **Currency**: every figure on the Spending view uses the user's profile preferred currency (Settings → Preferences), summing each Cost Entry's already-locked `converted_amount_profile` (see Schema above) — never a render-time/live conversion, so the same trip's contribution looks identical on every visit until the user explicitly changes their profile currency (FR-19).
- **Chart types** (user preference, confirmed during discovery — final call belongs to the UX pass):
  - Spend-over-time was considered (bar chart, originally FR-14) and cut during the UX pass — no distinct value seen beyond the headline figures and donut breakdowns already on the view.
  - Category breakdown: donut chart, same `ExpenseCategory` enum as the trip-level Budget tab. (Brainstorm originally proposed stacked bars for this; donut was the user's explicit preference during this discovery pass, then unified across the remaining charts — superseding the brainstorm note, not an oversight.)
  - Destination breakdown: donut chart, country-level only (see Location Resolution below).
  - Budget adherence: donut chart, 3 segments (under / on / over budget), trips with no budget set excluded.
  - Average daily spend (FR-18), total spend (FR-20), average trip spend (FR-21): plain figures, not charts — total filtered spend; total filtered spend ÷ total filtered trip-days; total filtered spend ÷ count of filtered trips, respectively.
- **Location resolution**: each trip's spend is grouped by that trip's `destinationCountryCode` (structured ISO code, set via the existing Mapbox-backed destination picker — `use-location-autocomplete.ts` — not parsed, whenever a destination is chosen); `destinationCountry` supplies the display label for that code. Grouping by code rather than the free-text display name avoids the same country fragmenting into multiple chart segments from formatting drift. Trips with no destination set fall under "Unknown." No event/reservation-level geocoding — that data (`locationName`/`locationAddress`/lat-lng) is free text/coordinates only, with no structured country field, so state/city drill-down is out of scope until a real geocoding source exists. Continent-level rollup is cut by choice (consistency with country-only design), not blocked by data availability the way state/city is.
- **Explicitly cut during discovery**: CSV/PDF export (no clear value case identified) and an "insights" copy/logic layer (no usage data yet to validate what's actually insightful) — both were in the original brainstorm's Phase 2 vision but dropped when revisited.
