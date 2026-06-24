# Reconciliation: Travel Retrospective — Brainstorm vs PRD/Addendum

**Input (SOURCE):** `_bmad-output/brainstorming/brainstorming-session-2026-06-23-1450.md`, Theme 3 (lines 36-43) and related references (lines 11, 57, 65, 134-147, 151, 153).

**Compared against (TARGET):** `prd.md` §4.6 (FR-12–FR-17), §6 Non-Goals, §9 Assumptions Index; `addendum.md` "Travel Retrospective — Component & UI Notes" (lines 47-59).

**Known intentional cuts excluded from this report** (per task instructions): insights layer, CSV/PDF export, state/city destination drill-down, "Unified History Page" → "spending history" terminology shift.

---

## Gap 1: "Averages" dropped with no replacement or explicit cut

**Brainstorm reference:** Line 40 — "Spending Explorer: By time (monthly/yearly), category (stacked bars), destination (country/continent), budget vs actual per trip, **averages**."

**Gap:** The brainstorm lists "averages" (e.g., average spend per trip, average per category/time period) as a distinct Spending Explorer capability alongside the four chart dimensions. None of FR-13 through FR-17, nor the addendum's chart-type list, mention an average/mean figure anywhere on the Spending view. Unlike insights or export, this wasn't named as a discussed-and-cut item in §6 Non-Goals or the addendum's "Explicitly cut during discovery" bullet — it simply isn't mentioned at all, so it's unclear whether it was deliberately dropped or just missed during the PRD write-up.

**Suggested fix:** Either (a) add a brief FR or consequence bullet to FR-14/FR-15 (e.g., "chart includes an average-per-period or average-per-trip reference line/figure") if it's still wanted, or (b) if cut deliberately, add it to §6 Non-Goals and the addendum's "Explicitly cut during discovery" list alongside insights/export so the cut is traceable like the other two.

---

## Gap 2: Continent-level destination rollup dropped without being named as a cut

**Brainstorm reference:** Line 40 — "destination (country/continent)."

**Gap:** PRD FR-16 and addendum line 55/57 scope destination breakdown to country-level only. §6 Non-Goals (line 273) and §7.2 (line 286) explicitly name the *state/city* drill-down as cut due to lack of structured sub-country data — but continent-level rollup is a different axis (a roll-up above country, not a drill-down below it) and isn't technically blocked by the same "no structured sub-country location" reasoning a trip's `destinationCountry` is already structured enough to derive continent from (e.g. via a country→continent lookup table). The task's list of known intentional cuts only mentions "state/city... dropped due to lack of structured location data," not continent. This reads as an overlooked scope item rather than a deliberate, reasoned cut.

**Suggested fix:** Either add continent as a secondary grouping/toggle on FR-16 (low-cost: `destinationCountry` → continent is a static lookup, no new data needed), or, if intentionally out, add an explicit line to §6 Non-Goals / addendum's cut list: "Continent-level rollup — country-level only for v1; continent grouping deferred."

---

## Gap 3 (minor/advisory, not blocking): Category chart type diverges from brainstorm with no rationale recorded

**Brainstorm reference:** Line 40 — category breakdown via "stacked bars."

**Note:** Addendum line 54 specifies a donut chart for category breakdown instead of brainstorm's stacked bars. This is flagged as a deliberate "user preference, confirmed during discovery" with "final call belongs to the UX pass" (addendum line 52), so it's not an unreflected gap — but it is a real divergence from the brainstorm that's worth a one-line confirmation in the addendum (e.g. "user reversed brainstorm's stacked-bar suggestion in favor of donut") so a future reader doesn't mistake it for an oversight. No action required beyond an optional clarifying note.

---

## Summary

Two genuine gaps (averages, continent rollup) where brainstorm content has no corresponding PRD/addendum coverage and no recorded cut decision. One minor advisory item (category chart type) that is already addressed by existing addendum language but could use a one-line rationale note for future clarity.
