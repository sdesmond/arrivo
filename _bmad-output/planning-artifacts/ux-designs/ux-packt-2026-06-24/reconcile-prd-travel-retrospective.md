# Reconciliation: PRD/Addendum vs UX Spine (Travel Retrospective, FR-12–FR-21)

Compares `prd.md` §2.2 UJ-2, §4.6 (FR-12–FR-21), §5 NFRs, §6 Non-Goals, and the addendum's "Travel Retrospective — Component & UI Notes" against `DESIGN.md` and `EXPERIENCE.md` (both updated 2026-06-24) to find UX-relevant requirements with no documented coverage, and any UX content that diverges from the PRD.

## Gaps

### 1. FR-20 zero-state contradicts "no trips match filter" state treatment

**What's missing / wrong:** FR-20 states: "Zero filtered trips, or zero spend in range, shows $0 — not an error or hidden state." `EXPERIENCE.md` State Patterns has a row "Trips exist, none match the filtered range" → `"No trips in the selected range" — filter control stays visible so the user can change it; headline figures and charts hidden for this state (FR-13)`. This hides the headline figures (Total Spend, Average Trip Spend, Average Daily Spend) exactly in the zero-filtered-trips case FR-20 says must instead render as "$0," not be hidden.

This is also listed as a contradiction below — flagging here because the fix is a UX spec edit, not just a note.

**Suggested fix:** In `EXPERIENCE.md`, split the "Trips exist, none match the filtered range" row into two distinct behaviors:
- Charts (category/destination/budget-adherence donuts, spend-over-time bar) — fine to hide or show an empty/placeholder state, since FR-13's "excluded... not shown as errors" applies most directly to charts.
- Headline figures (Total Spend, Average Trip Spend, Average Daily Spend) — must remain visible and render "$0" per FR-20, never hide alongside the charts.

Update the State Patterns row text to something like: `"No trips in the selected range" message shown in place of the charts; filter stays visible. Headline figures remain visible and show $0 (FR-20) rather than hiding.` Also reflects into Flow 3 if a "zero match" beat is ever added there.

### 2. FR-17's "on budget" ±2% band has no UI documentation

**What's missing:** FR-17 consequence: `"On budget" is defined as Actual within ±2% of Budget total, with "under"/"over" outside that band.` Nothing in `DESIGN.md` or `EXPERIENCE.md` mentions this band — not in the `budget-adherence-donut` component spec, not in Component Patterns' "Budget adherence donut" row, not in Accessibility Floor or tooltips. A user looking at the donut or its legend has no way to learn what "on" means (e.g. is a trip 1% over still "on budget"?).

**Suggested fix:** Add a line to `EXPERIENCE.md` Component Patterns "Budget adherence donut" row (or a short note under it) describing tooltip/legend copy, e.g.: `Each segment's legend or tooltip clarifies the band: "On budget" = within ±2% of the trip's budget total; outside that band counts as under/over.` This is a microcopy/legend concern, squarely in UX scope, not architecture.

### 3. FR-13's "any part of trip's date range overlaps filter" rule has no user-facing explanation, despite being counterintuitive

**What's missing:** FR-13 consequence: a trip is included in the filtered range "if any part of its date range overlaps the selected period... Once a trip is included, all of its Cost Entries are included — never a partial subset of that trip's costs by their individual dates." This is a genuinely surprising rule from a user's perspective (e.g., a trip spanning Dec 30–Jan 5 viewed under "Last Year" pulls in January costs too) and has UX consequences: a user comparing "This Year" vs "All Time" could see a boundary-trip's spend appear to jump non-proportionally. Neither `DESIGN.md` nor `EXPERIENCE.md` mentions this inclusion rule anywhere — not in the date filter's Component Patterns row, not in Flow 3, not as a tooltip/help affordance.

This is borderline (the underlying inclusion logic is computation, which the instructions say to exclude) but the *user-facing surprise* it creates is a UX concern: nothing tells the user why a trip straddling the boundary is fully included.

**Suggested fix:** Add a short note to the "Spending view header" row in `EXPERIENCE.md` Component Patterns, e.g.: `A trip is included whenever any part of its dates falls in the selected range; once included, all of that trip's spend counts, not just the in-range portion.` Optional: a help icon/tooltip on the date filter control referencing this. Low priority since it is mostly an edge case, but worth a one-line mention so a future implementer doesn't have to dig into the PRD to explain odd-looking totals.

## Contradictions

1. **FR-20 vs `EXPERIENCE.md` State Patterns "Trips exist, none match the filtered range":** see Gap 1 above — `EXPERIENCE.md` hides headline figures in a state where FR-20 requires them to show "$0." This is the one direct contradiction found; everything else in the new UX content (Spending view IA row, chart-card/headline-figure/donut-chart/category-donut-palette/budget-adherence-donut/bar-chart-time components, Flow 3, the 3 new Accessibility Floor bullets) is consistent with FR-12 through FR-21 and the addendum's chart-type/component notes (bar for time, donut for category/destination/adherence, country-code-based destination grouping with "Unknown" fallback, no color-only signaling).

No other contradictions found. Chart type choices (bar for spend-over-time, donut for category/destination/adherence), the country-code-based destination grouping with "Unknown" fallback, the exclusion of per-trip line items from the Spending view, and the explicit absence of export/insights all match the PRD and addendum.
