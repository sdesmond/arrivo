---
title: "Trip Budget Management & Travel Retrospective"
status: final
created: 2026-06-23
updated: 2026-06-24
---

# PRD: Trip Budget Management & Travel Retrospective

## 0. Document Purpose

This PRD defines two related features: budget tracking for Packt's trip-detail view (a way to set a spending target for a trip and see real spend against it, drawing on costs already captured on events and reservations plus expenses that aren't tied to either), and Travel Retrospective, a cross-trip "Spending" view on the existing History page built on the same data once it exists. It is for the PM (Spencer) and downstream workflow owners (UX, architecture, epics/stories). Features are grouped with functional requirements (FRs) nested under them, numbered globally (FR-1 through FR-N) for stable cross-reference. Inline `[ASSUMPTION]` tags mark inferences not yet confirmed; they're indexed in §9. This PRD builds on the brainstorming session at `_bmad-output/brainstorming/brainstorming-session-2026-06-23-1450.md` — implementation-level detail (schema fields, API choices, component names) that doesn't belong in a PRD lives in `addendum.md` alongside this file.

## 1. Vision

Packt already lets travelers plan a trip's events and reservations, each with its own cost. What's missing is the other half: a target to plan against, and a single place to see how real spend stacks up. Budget tracking turns the `Trip.budget` field — currently set at trip creation but inert — into a live view: a budget total in the trip's chosen currency, an auto-summed actual from every costed event and reservation, and a spot to log spend that doesn't belong to either (a visa fee, travel insurance, gear bought before departure). The payoff is the moment a traveler opens the Budget tab mid-planning and immediately knows whether they're on track, over, or have room to add one more excursion — without exporting anything to a spreadsheet.

Once that per-trip data exists, the same numbers compound into something only possible across many trips: a Travel Retrospective view that shows spending patterns over time, by category, and by destination, and how consistently trips stay within budget — without manually compiling numbers from each trip's Budget tab.

## 2. Target User

### 2.1 Jobs To Be Done

- As a trip planner, I want to set a spending target so I have something concrete to plan against, not just a vague sense of "this feels expensive."
- As a trip planner, I want my existing event/reservation costs to count automatically, so I'm not re-entering numbers I already typed in.
- As a trip planner, I want a place for costs that don't belong to a specific event (passport renewal, travel insurance), so my budget total reflects reality, not just my itinerary.
- As a trip planner, I want a clear signal when I'm approaching or over budget, so I can adjust before I overspend rather than after.
- As a frequent traveler, I want to see spending patterns across all my trips, so I can understand my travel habits without manually compiling numbers from each trip's Budget tab.

### 2.2 Key User Journeys

- **UJ-1. Sally tracks actual spend against her trip budget.**
  - **Persona + context:** Sally is planning a multi-day international trip in Packt and wants to know whether her itinerary fits the budget she has in mind.
  - **Entry state:** Authenticated, on the trip detail view for a trip she owns or can edit. She set a budget total and currency when creating the trip (existing `Trip.budget` flow via `trip-edit-budget.tsx`).
  - **Path:** She adds events and reservations as she plans. Each cost-entry dialog now also asks for currency and category alongside the amount (existing dialog, extended). She opens the Budget tab and sees actual spend auto-summed from those costs against her budget total. She incurs a cost that isn't tied to any event or reservation — a visa fee — and adds it directly in the Budget tab as a misc expense.
  - **Climax:** The Budget tab shows budget, actual, and remaining at a glance, updating the moment she adds the misc expense — she immediately sees her new remaining balance.
  - **Resolution:** She knows exactly how much room she has left and keeps planning with that number in mind.
  - **Edge case:** If actual spend crosses a configurable threshold (80%/90% of budget), the tab surfaces a visual warning/danger state rather than requiring her to do the math herself. Realizes FR-11 (visual state).

**Scope dial:** Heavier — feeds the Budget tab UI, the misc expense entry flow, and the auto-sum aggregation directly; see capability → FR mapping in §4.

- **UJ-2. Spencer reviews his spending history across trips.**
  - **Persona + context:** Spencer has logged several real trips with budget and expense data and wants insight into spending patterns without manually compiling numbers from each trip's Budget tab.
  - **Entry state:** Authenticated, on the History page (existing "Trips" view, now joined by a new "Spending" view).
  - **Path:** He switches to the Spending view. A single date-range filter (This Year / Last Year / Last 12 Months / All Time, defaulting to This Year) controls everything below it. He sees a donut chart of spend by category, a donut chart of spend by destination country, a donut chart showing what share of his trips finished under/on/over budget, and headline figures for total spend, average trip spend, and average daily spend.
  - **Climax:** He switches the filter to "All Time" and every chart reshapes immediately to reflect his full trip history in one view — no per-trip digging required.
  - **Resolution:** He has a clear, multi-trip picture of where his money goes and how consistently he stays within budget.

**Scope dial:** Lighter — read-only cross-trip aggregation; no new write paths. See capability → FR mapping in §4.6.

## 3. Glossary

- **Budget** — A trip-level spending target: a total amount and a currency. Stored on `Trip.budget`. Set at trip creation or edited later.
- **Trip Currency** — The currency code (ISO 4217) recorded on `Budget.currency`. Source of truth for budget display on that trip; overrides the user's profile currency preference within this trip's Budget tab.
- **Cost Entry** — A single row in one shared expenses store, the unit Actual is built from. Every Cost Entry has its own amount, currency, category, and date, and is optionally linked to one event or one reservation; a Cost Entry linked to neither is a Misc Expense. There is one underlying record shape for all three, not three separate ones.
- **Category** — A pre-defined classification on a Cost Entry (e.g. food, lodging, transport, activity, misc). Shared across event costs, reservation costs, and Misc Expenses — one enum, not three.
- **Actual** — The auto-summed total of all Cost Entries attributable to a trip, each converted to Trip Currency.
- **Misc Expense** — A Cost Entry not attached to any event or reservation, entered directly in the Budget tab (e.g. visa fee, gear, insurance). Has its own currency, amount, category, date, and optional note.
- **Remaining** — Budget minus Actual, in Trip Currency. Negative when over budget.
- **Threshold Alert** — A visual state (warning at a configurable percentage, danger at a higher configurable percentage) shown on the Budget tab when Actual reaches that percentage of Budget. Thresholds are user-configurable in Settings (default 80%/90%).
- **Travel Retrospective** — A cross-trip "Spending" view on the existing History page, covering spend trends by time/category/destination plus budget adherence across all of a user's trips. Separate from each trip's own per-trip Budget tab.

## 4. Features

### 4.1 Budget Definition

**Description:** The trip-level budget (total + currency) already exists as `Trip.budget`, set via the existing trip creation and `trip-edit-budget.tsx` edit flow. This feature is about that budget becoming the reference point the rest of this PRD's features compare against — the existing entry surface gains a read-only actual/remaining/%/status summary once the Budget tab exists, but no second/duplicate budget-entry surface is introduced. It also covers what happens when Trip Currency itself changes after Cost Entries already exist. Realizes UJ-1.

**Functional Requirements:**

#### FR-1: Budget as comparison target

Trip owner/editor can set a budget total and currency on a trip (existing capability) and see it used as the comparison target for Actual everywhere actual spend is shown. Realizes UJ-1.

**Consequences (testable):**

- Budget tab reads `Trip.budget.total` and `Trip.budget.currency` as the displayed target; `trip-edit-budget.tsx` remains the single place budget total/currency are set, now showing a read-only actual/remaining summary alongside the existing inputs.
- A trip with no budget set shows Actual without a percentage/remaining comparison (no divide-by-zero or undefined state). Cost Entries still require a currency (FR-4), defaulting to the user's profile currency when no Trip Currency is set yet.

#### FR-2: Trip Currency overrides user preference

Within a given trip's Budget tab, all amounts display in that trip's Trip Currency, regardless of the user's profile currency preference. Realizes UJ-1.

**Consequences (testable):**

- Changing a user's profile currency preference does not change how an existing trip's Budget tab displays amounts.
- Cost Entries recorded in a different currency are converted to Trip Currency for display (see FR-8).
- Once a Trip Currency is set, it — not the profile preference — is the default for new Cost Entries (FR-4, FR-7).

#### FR-3: Trip Currency change confirmation

When the trip owner/editor changes Trip Currency on a trip that has at least one Cost Entry whose stored currency differs from the *new* Trip Currency, the system shows a warning before committing the change, explaining that those Cost Entries' displayed values need recalculating. The user can cancel the change, continue and recalculate (running FR-9 against the new currency immediately), or continue and leave existing converted values as-is. Realizes UJ-1.

**Consequences (testable):**

- No warning is shown when every existing Cost Entry's currency already matches the new Trip Currency — nothing needs recalculating, so nothing is asked.
- "Continue and leave as-is" does not block or alter any existing Cost Entry; it only changes `Trip.budget.currency` and how future totals are labeled — existing `converted_amount` values are simply now being compared against a different display currency until someone runs Recalculate (FR-9).
- "Continue and recalculate" performs the same all-or-nothing recalculation as FR-9, scoped to the new Trip Currency, before the currency change is considered complete.
- "Cancel" leaves Trip Currency unchanged and discards the in-progress edit.

### 4.2 Unified Cost Entry

**Description:** Today, an event or reservation's cost is a bare `cost: number` field on that event/reservation row — no currency, no category, and a separate concept from whatever stores Misc Expenses. This feature replaces that field with a link to a Cost Entry record in one shared expenses store: an event or reservation cost becomes a Cost Entry linked to that event/reservation; a Misc Expense is a Cost Entry linked to neither. The existing `cost` field on events and reservations is removed — its value is not migrated (§5 Data migration). This is the foundation FR-5 (Actual) and FR-6 (category breakdown) build on: one store, one currency/category model, one place Actual sums from. Realizes UJ-1.

**Functional Requirements:**

#### FR-4: Event/reservation cost becomes a linked Cost Entry

When a trip owner/editor sets or edits the cost on an event or reservation, the system creates or edits a linked Cost Entry under the hood — with amount, currency (defaults to Trip Currency, or the user's profile currency if no Trip Currency is set yet — FR-1), category (required, pre-defined enum, no default selected), and date. Realizes UJ-1.

**Consequences (testable):**

- The existing `cost` field on `Event`/`Reservation` is removed from the schema; events/reservations created before this ships simply have no linked Cost Entry until one is added — no automatic carry-over of the old value. This is an intentional non-migration per explicit user direction, not a silent default.
- Currency and category fields use the same pre-defined option lists (currency dropdown, category enum) as Misc Expense entry (FR-7) — one shared list, not duplicated per surface.
- The cost-entry dialog on events/reservations remains fully keyboard-operable with the two new fields added (tab order: existing fields, then currency, then category, consistent with where amount currently sits).

### 4.3 Actual Spend Tracking

**Description:** Actual is computed automatically by summing every Cost Entry in the shared expenses store for the trip — whether linked to an event, a reservation, or neither (Misc Expense) — each carrying its own currency and category per FR-4/FR-7. The traveler never manually re-enters a number that already exists elsewhere in the trip. Realizes UJ-1.

**Functional Requirements:**

#### FR-5: Auto-sum from all Cost Entries

System computes Actual as a single sum over the expenses store, filtered to the trip, with each Cost Entry's amount converted to Trip Currency using the rate locked at that Cost Entry's own entry time (FR-4 for event/reservation-linked entries, FR-7 for Misc Expenses — same one-time-conversion mechanism, same table). Realizes UJ-1.

**Consequences (testable):**

- Adding, editing, or removing any Cost Entry — event-linked, reservation-linked, or Misc — updates Actual via the existing revalidation pattern (e.g. `revalidatePath` after the mutating action) — no new polling or live-update infrastructure.
- An event or reservation with no linked Cost Entry contributes 0, not an error or omission.
- Because every Cost Entry's conversion rate is locked at its own entry time, Actual as a whole stays internally consistent over time — no Cost Entry silently drifts as exchange rates move, regardless of what it's linked to, unless the trip owner explicitly recalculates (FR-9) or changes Trip Currency (FR-3).

#### FR-6: Category breakdown

Budget tab shows Actual broken down by category (the shared enum from FR-4/FR-7) with a count of items per category. Realizes UJ-1.

**Consequences (testable):**

- Each category subtotal sums to the category's contribution to overall Actual, across event costs, reservation costs, and Misc Expenses alike.
- A category with zero items is omitted from the breakdown rather than shown as a zero row.
- Categories are a pre-defined enum (no freeform categorization), so every Cost Entry maps to exactly one category — no fallback/"uncategorized" case to handle.

### 4.4 Misc Expense Entry

**Description:** For spend that isn't tied to any event or reservation — a visa fee, travel insurance, pre-trip gear — the traveler adds it directly in the Budget tab as a Misc Expense: amount, currency, category, date, optional note. Realizes UJ-1.

**Functional Requirements:**

#### FR-7: Add a Misc Expense

Trip owner/editor can add a Misc Expense from the Budget tab with amount (required, >0, 2 decimals, capped at a sane maximum), currency (required, defaults to Trip Currency), category (required, no default selected, same shared enum as FR-4), date (defaults to today, past dates allowed), and note (optional). Realizes UJ-1.

**Consequences (testable):**

- Saving a Misc Expense immediately reflects in Actual and the category breakdown without requiring a page reload.
- Amount validation rejects 0, negative, more than 2 decimal places, and amounts above the configured maximum, client- and server-side. Maximum is a fixed ceiling of 50,000 in entry currency, not derived from budget (confirmed during architecture).
- A Misc Expense can be edited or deleted after creation; deletion removes it from Actual.

#### FR-8: Per-Cost-Entry currency conversion (Trip Currency and profile currency)

At entry time, the system locks two independent conversions from the Cost Entry's original currency, using a historical rate as of that entry's own date (no background rate updates): one to Trip Currency (for that trip's own Actual, FR-5) and one to the user's profile currency (for cross-trip aggregation in Travel Retrospective, §4.6). Both are stored alongside the original amount/currency. Realizes UJ-1.

**Consequences (testable):**

- Every stored converted amount records its own target currency code explicitly (e.g. a Trip Currency conversion and a profile currency conversion each carry their own currency tag) — the system never infers which currency a stored number means from whatever Trip Currency or profile currency currently is. This is what lets a Trip Currency change (FR-3) or a profile currency change (FR-19) correctly flag older entries as stale rather than silently misreading them.
- The Trip Currency conversion and the profile currency conversion are computed independently, both directly from the original amount/currency — never chained through each other. Changing one (e.g. Trip Currency) never invalidates the other.
- Neither stored conversion rate changes after entry, even if the source rate changes later, for any Cost Entry type — unless the trip owner explicitly recalculates Trip Currency conversions (FR-9/FR-3) or the user explicitly recalculates profile currency conversions (FR-19).
- If either conversion lookup fails, the Cost Entry still saves with its original amount/currency — the affected converted field(s) are simply left unset rather than blocking the save entirely. The system shows an error (e.g. toast) prompting the user to retry later; retry is user-initiated, never automatic.
- Editing an existing Cost Entry's amount, currency, or date re-triggers this same locked-conversion process for both targets, using whatever date is set at the time of the edit — this is how changing a past expense naturally uses the correct historical rate for the (possibly new) date, with no separate mechanism needed.

**Feature-specific NFRs:**

- Conversion dependency is a third-party API call at write time only — see Cross-Cutting NFRs for failure-mode expectations.
- The Misc Expense entry form (FR-7) must be fully operable by keyboard alone — tab order through currency, category, date, amount, note, and save/cancel, no mouse-only interaction.

#### FR-9: Manual recalculation of conversions

Trip owner/editor can trigger a "Recalculate conversions" action that re-fetches current rates and updates the converted amount for every Cost Entry (event, reservation, or Misc Expense) whose original currency differs from Trip Currency. The same recalculation also runs when the user chooses "continue and recalculate" during a Trip Currency change (FR-3). Realizes UJ-1.

**Consequences (testable):**

- The recalculate control is shown only when at least one Cost Entry's original currency differs from Trip Currency; it is hidden when every Cost Entry matches Trip Currency or the trip has no Cost Entries.
- Recalculating updates `converted_amount`/`conversion_rate` only — original entered amount and currency are never altered, for any Cost Entry type.
- If the recalculation lookup fails partway through, no Cost Entry is left with a partially-updated conversion; the system surfaces an error and the user can retry. Recalculation is all-or-nothing per run, not per-Cost-Entry partial success (confirmed during PRD finalization).

### 4.5 Threshold Alerts

**Description:** The Budget tab signals proximity to or breach of budget visually, so the traveler doesn't have to do the percentage math themselves. Thresholds are configurable per user. Realizes UJ-1 (edge case).

**Functional Requirements:**

#### FR-10: Configurable thresholds

User can set a warning threshold and a danger threshold (each 0–100%, default 80%/90%, warning must be less than danger) in Settings → Preferences → Budget. Realizes UJ-1.

**Consequences (testable):**

- Saving thresholds with warning ≥ danger is rejected with a validation message.
- Threshold values persist per-user and apply across all of that user's trips.

#### FR-11: Visual state on Budget tab

Budget tab status indicator shows a neutral state below the warning threshold, a warning state between warning and danger (paired with a Warning icon), and a danger state at or above danger (paired with an Error icon) — icon plus app color together, never color alone. Realizes UJ-1.

**Consequences (testable):**

- State updates immediately when Actual crosses a threshold (e.g. after adding a Misc Expense).
- Warning and danger states are each paired with their respective icon (Warning / Error) alongside the app's existing warning/danger colors — color is never the only signal distinguishing the three states.

### 4.6 Travel Retrospective

**Description:** A cross-trip spending view added to the existing History page, alongside the current "Trips" view (unchanged). Where the Budget tab (§4.1–4.5) answers "how is this one trip doing," Travel Retrospective answers "how am I doing across all my trips" — spend over time, by category, and by destination, plus how often trips stay within budget. Per-trip cost detail remains exclusively in each trip's own Budget tab; Travel Retrospective never shows per-event/per-reservation line items. Realizes UJ-2.

**Functional Requirements:**

#### FR-12: Spending view on the History page

User can switch to a "Spending" view on the History page, separate from the existing "Trips" view, showing cross-trip spending data. Realizes UJ-2.

**Consequences (testable):**

- The existing "Trips" view and its default-landing behavior are unchanged — Spending is an additional view, not a replacement.
- Spending never displays per-event or per-reservation line items; that detail stays in each trip's own Budget tab.
- The Spending view contains exactly the elements defined in FR-15 through FR-18, FR-20, and FR-21 (category chart, destination chart, budget-adherence chart, average-daily-spend figure, total-spend figure, average-trip-spend figure) — no separate per-trip list or table; per-trip detail lives only in that trip's own Budget tab.

#### FR-13: Date range filter drives every chart

A single date-range filter (This Year / Last Year / Last 12 Months / All Time, defaulting to This Year) controls every chart and figure on the Spending view — changing it recomputes all of them against the newly filtered trip set. Realizes UJ-2.

**Consequences (testable):**

- A trip is included in the filtered range if any part of its date range overlaps the selected period (e.g. a trip spanning May 30–June 5 is included once the filter covers any part of June onward). Once a trip is included, all of its Cost Entries are included — never a partial subset of that trip's costs by their individual dates.
- All amounts display in the user's profile preferred currency (Settings → Preferences), using each Cost Entry's already-locked profile currency conversion (FR-8) — never a render-time/live conversion. The same trip's contribution to a total looks the same every time you view it, regardless of today's exchange rate.
- Trips with no spend data in the selected range are simply excluded from all charts and figures, not shown as errors or empty placeholders.

#### FR-15: Category breakdown chart

Spending view shows spend by category, using the same `ExpenseCategory` enum as the trip-level Budget tab, across all trips in the filtered range. Realizes UJ-2.

**Consequences (testable):**

- Categories with zero spend in the filtered range are omitted, consistent with the trip-level category breakdown's zero-item omission rule (FR-6).

#### FR-16: Destination breakdown chart

Spending view shows spend by destination country, across all trips in the filtered range. Realizes UJ-2.

**Consequences (testable):**

- Each trip's spend is attributed to that trip's `destinationCountryCode` (the structured ISO code set via the existing Mapbox-backed destination picker, not the free-text `destinationCountry` display name) — grouping by code avoids the same country fragmenting into multiple segments from formatting drift; `destinationCountry` supplies the human-readable label for the matching code.
- Country is the sole granularity — no state/city drill-down (data model has no structured sub-country location — only free-text addresses and coordinates on events/reservations) and no continent-level rollup (cut by explicit choice, for consistency with the country-only design — not a data limitation the way state/city is).
- Trips with no destination set are grouped under "Unknown" rather than excluded — no trip silently disappears from the chart.

#### FR-17: Budget adherence chart

Spending view shows what share of trips — within the filtered range, among trips that have a budget set — finished under, on, or over budget. Realizes UJ-2.

**Consequences (testable):**

- Trips with no budget set are excluded from this chart entirely (adherence can't be measured without a target).
- "On budget" is defined as Actual within ±2% of Budget total, with "under"/"over" outside that band (confirmed during PRD finalization).

#### FR-18: Average daily spend

Spending view shows the average spend per day across all trips in the filtered range. Realizes UJ-2.

**Consequences (testable):**

- Per-trip duration (days) is computed from that trip's start/end dates; the figure is total filtered spend divided by total filtered trip-days, not a simple average of each trip's own daily average (so longer trips weight proportionally more, not equally with short ones).
- Trips with no dates set are excluded entirely from this figure — both their spend and their trip-days are omitted, not just the denominator (a trip excluded from the day-count but still counted in the spend total would silently inflate the average).

#### FR-19: Profile currency change confirmation and recalculation

When the user changes their profile preferred currency (Settings → Preferences) and at least one existing Cost Entry's profile currency conversion was locked under the old profile currency, the system shows a warning before committing the change, then recalculates every affected Cost Entry's profile currency conversion synchronously after confirmation. Realizes UJ-2.

**Consequences (testable):**

- No warning is shown when the user has no Cost Entries yet, or none are affected — mirrors FR-3's no-mismatch case.
- Recalculation runs synchronously within the triggering action (not a background job) — consistent with this product's current single-user, pre-alpha scale (§8). The user sees a loading state until it completes, matching the existing Recalculate Conversions UX (FR-9), just scoped across every trip instead of one.
- Recalculation updates only the profile currency conversion fields — original amounts, currencies, and Trip Currency conversions are never touched.
- If recalculation fails partway through, no Cost Entry is left with a partially-updated profile currency conversion; the system surfaces an error and the user can retry. Recalculation is all-or-nothing per run, consistent with FR-9 (confirmed during PRD finalization).

#### FR-20: Total spend figure

Spending view shows the total spend across all trips in the filtered range. Realizes UJ-2.

**Consequences (testable):**

- This is the same sum the category and destination breakdowns (FR-15, FR-16) are built from, displayed as a single headline figure.
- Zero filtered trips, or zero spend in range, shows $0 — not an error or hidden state.

#### FR-21: Average trip spend

Spending view shows the average spend per trip across all trips in the filtered range. Realizes UJ-2.

**Consequences (testable):**

- Total filtered spend divided by the count of filtered trips — following FR-13's existing exclusion rule, trips with no spend data in range are already excluded from the filtered set, so they don't dilute this average.

## 5. Cross-Cutting NFRs & Constraints

- **Financial data accuracy:** All amount fields validate >0, max 2 decimal places, client- and server-side. Stored numeric values use the existing `numeric` Postgres column convention (string on the wire, parsed via `db-mappers.ts`) — no floating-point currency math.
- **External dependency reliability (currency conversion):** The conversion lookup (Frankfurter/ECB, historical-rate-at-entry-date — see `addendum.md`) is a synchronous dependency of FR-4, FR-7, FR-8, FR-9, FR-3, and FR-19; each already specifies its own failure-mode guarantee (save in original currency unconverted, never block the save; user-initiated retry).
- **Accessibility:** Threshold Alert states (FR-11) use a Warning icon and an Error icon paired with the app's existing warning/danger colors — never color alone (WCAG 2.1 AA — color-blind-safe). Travel Retrospective's donut charts (FR-15–FR-17) must distinguish segments without relying on color alone (e.g. labels, legend, or pattern) — same color-blind-safe floor, extended to chart form.
- **Data migration:** The existing `cost` field on `Event`/`Reservation` is dropped, not migrated — its value is not carried into the new shared expenses store (FR-4). This is an explicit, intentional loss of pre-feature cost data, not an oversight: trips planned before this ships will show $0 Actual until costs are re-entered as Cost Entries.

## 6. Non-Goals (Explicit)

- This PRD does not cover multi-currency *budgets* (a single trip having more than one budget currency) — Trip Currency is singular and fixed per trip.
- This PRD does not cover automatic/background exchange-rate updates — conversion is one-time at entry by default; the only ways a rate changes afterward are the user explicitly triggering recalculation (FR-9) or a Trip Currency change (FR-3), never an automatic refresh.
- This PRD does not cover budget approval workflows, shared/collaborative budget editing permissions beyond existing trip access roles, or any payment/financial-transaction processing — Packt tracks spend, it does not move money.
- Travel Retrospective (§4.6) does not include CSV/PDF export, or an "insights" copy/logic layer ("you spend 40% on food") — both considered and explicitly cut; insights had no usage data to validate what's actually insightful, and export had no clear value case.
- Travel Retrospective's destination breakdown (FR-16) is country-level only — no state/city or continent-level rollup; country is the sole granularity.
- Travel Retrospective does not chart spend-over-time — considered (originally FR-14, since retired) and cut; the headline figures (FR-18, FR-20, FR-21) and the donut breakdowns already answer "how much," and a time-series view wasn't seen as adding distinct value.

## 7. MVP Scope

### 7.1 In Scope

All of §4.1–4.6 (FR-1 through FR-21, less FR-14, retired — see §6 Non-Goals): Budget Definition and Trip Currency change handling, Unified Cost Entry, Actual Spend Tracking and category breakdown, Misc Expense entry and dual (Trip Currency + profile currency) conversion, Threshold Alerts, and Travel Retrospective (cross-trip Spending view: category, destination, and budget-adherence charts plus average daily spend, total spend, and average trip spend, driven by a single date filter, with profile currency change handling). See §4 for full FR detail.

### 7.2 Out of Scope for MVP

- Per-person budget math — not in scope for this PRD at all; may be revisited as a separate future feature, not a deferred v1 item. `[NOTE FOR PM]`
- Any migration or backfill of pre-feature `cost` values into the new Cost Entry store — that data is dropped, not carried forward (§5 Data migration).
- Travel Retrospective's export, insights layer, and destination granularity — see §6 Non-Goals.

_Automatic/background exchange-rate refresh is permanently out of scope, not version-deferred — see §6 Non-Goals._

## 8. Success Metrics

_Pre-alpha, single-user product — metrics are usage- and correctness-focused rather than growth-focused._

**Primary**

- **SM-1**: Spencer uses the Budget tab on every real trip he plans going forward (not just test/seed trips), measured by presence of a non-default budget + at least one Misc Expense or event/reservation cost on trips created after this ships. Validates FR-1, FR-5, FR-7.

**Secondary**

- **SM-2**: Actual matches a manual reconciliation (sum of all Cost Entries, converted) with zero discrepancy across a sample of real trips. Validates FR-5, FR-8.
- **SM-3**: Spencer visits the Spending view at least once after a real trip concludes (not just immediately after this ships, as a one-time check). Validates FR-12, FR-13, and FR-15 through FR-21 deliver ongoing value, not a novelty viewed once.

**Counter-metrics (do not optimize)**

- **SM-C1**: Misc Expense entry — and now currency/category entry on every event/reservation cost — does not become a chore that displaces trip planning itself. If logging an event cost now feels like filling out a form instead of a quick number, the feature has failed even if SM-1 looks satisfied. Counterbalances SM-1.

## 9. Assumptions Index

_No open assumptions — all inferences raised during discovery have been confirmed and are stated as fact inline within their respective FRs._
