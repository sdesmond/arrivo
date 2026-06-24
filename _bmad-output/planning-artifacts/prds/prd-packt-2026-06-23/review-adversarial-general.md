# Adversarial Review — PRD: Trip Budget Management, Expense Tracking & Travel Retrospective

**Reviewed:** `prd.md` + `addendum.md` (prd-packt-2026-06-23), current revision (FR-1 through FR-18, §4.6 Travel Retrospective newly added)
**Scope:** Full document re-read; extra scrutiny on §4.6 Travel Retrospective (FR-12–FR-18) and its interaction with currency handling, `ExpenseCategory` enum reuse, and `destinationCountry`. §4.1–§4.5 were previously reviewed and finalized; re-checked for fallout from the new material but not re-litigated wholesale.
**Verified against codebase:** `src/data/types.ts`, `src/db/schema.ts` — `Budget.total` is optional (`total?: number`), `Trip.startDate`/`Trip.endDate` are both optional, `destinationCountry`/`destinationCountryCode` are optional free-text fields set via a Mapbox autocomplete picker, and no `ExpenseCategory` (or any expense category) enum exists anywhere in the current codebase.

---

## §4.6 Travel Retrospective — new material (primary focus)

### 1. FR-18's average-daily-spend numerator/denominator pairing is asymmetric and produces a real arithmetic bug

FR-18's consequence bullets say trips with zero duration or no dates are excluded from the **trip-day denominator** ("not counted as zero-day trips, which would distort the average"). But the same bullets never say whether that trip's **spend** is also excluded from the numerator ("total filtered spend"). `Trip.startDate`/`Trip.endDate` are both optional fields, so a trip with Cost Entries but no dates is a real, reachable state — not a hypothetical. If such a trip's spend stays in the numerator while its days drop out of the denominator, average daily spend is silently inflated by every dateless trip that has any spend at all. This is exactly the kind of bug a PRD review exists to catch before someone codes one side of the fraction and not the other.

### 2. FR-13's date filter is described as uniform across "every chart," but the filtering unit differs by chart and the PRD never reconciles this

FR-13 states the filter "controls every chart and figure," implying one consistent filtering semantic. But FR-14 (spend-over-time) clearly needs Cost-Entry-level date filtering — a bar chart bucketed by period requires per-entry dates. FR-16 (destination) and FR-17 (budget adherence), by contrast, read as **trip-level** inclusion/exclusion — a trip's entire spend is attributed to one country, and a trip is either "in" or "out" of the adherence chart. For a trip that straddles a filter boundary (started before the range, still active or ending inside it), these two filtering models disagree: does the whole trip count toward destination/adherence, or only the entries inside the range? The PRD asserts "every chart" is filtered by the same control without ever specifying what unit (trip vs. Cost Entry) each chart actually filters on — this is an internal contradiction once you look at FR-14 next to FR-16/FR-17, not just an omitted detail.

### 3. Currency-drift guarantee from §4.1–4.5 is quietly broken by the cross-currency rollup, and the PRD never reconciles this

FR-5 explicitly promises "Actual ... stays internally consistent over time — no Cost Entry silently drifts as exchange rates move ... unless the trip owner explicitly recalculates (FR-9) or changes Trip Currency (FR-3)." FR-13 then requires "all amounts display in the user's profile preferred currency," a *second*, independent conversion layer on top of each trip's already-locked Trip Currency totals. Converting a trip's locked Actual (in Trip Currency) into profile currency for the Spending view requires a rate lookup — at what time? If it's looked up fresh every time the Spending view renders, then a trip correctly flagged "on budget" today (FR-17, in Trip Currency) can flip to "over budget" in the cross-trip view tomorrow purely from profile-currency exchange-rate movement, with zero user action — directly contradicting FR-5's "no Cost Entry silently drifts ... unless explicitly recalculated" guarantee, just reintroduced one layer up. The PRD specifies the entry-time and recalculation-time conversion mechanics in detail (FR-8, FR-9) but is completely silent on what conversion mechanic Travel Retrospective itself uses — cached, locked-at-render, or live lookup — despite this being the single most currency-sensitive feature in the whole document.

### 4. `ExpenseCategory` "reuse" is asserted against an enum that doesn't exist and has no defined values anywhere in this PRD

FR-15 states the category chart uses "the same `ExpenseCategory` enum as the trip-level Budget tab." A repo-wide search confirms no such enum exists yet in any form — `src/data/types.ts` has no expense/cost category type at all. The Glossary (§3) only describes "Category" informally with parenthetical examples ("e.g. food, lodging, transport, activity, misc") — never a definitive list, never a concrete type name. FR-15 is claiming reuse of a not-yet-specified artifact; if the enum's actual values get decided ad hoc during §4.1–4.5 implementation (likely, since nothing else specifies them), FR-15's chart design (segment count, anything depending on a stable category set) has nothing concrete to validate against today. "Same enum" sounds like a constraint; it is actually a forward reference to an undefined thing.

### 5. FR-16's "Unknown" bucket doesn't account for realistic data-quality variance in `destinationCountry`

`destinationCountry` and `destinationCountryCode` are two independent optional free-text fields (confirmed in schema) populated by a Mapbox autocomplete picker. FR-16 handles the *fully-empty* case ("Unknown") but says nothing about: (a) which field — name or code — actually drives bucketing; (b) what happens if one is populated and the other isn't (plausible for older trips if the picker's behavior changed over time); (c) string-level inconsistency in `destinationCountry` itself (e.g. "USA" vs "United States" from different picker sessions) silently producing two separate donut segments for the same country instead of one. A donut chart's entire value proposition is a clean visual rollup — exactly the failure mode this finding describes undermines that without any error being thrown, so it would likely go unnoticed until someone manually audits the chart against trip data.

### 6. FR-12's scope boundary ("never shows per-event/per-reservation line items") doesn't address per-trip tabular detail, leaving a real scope-creep gap

FR-12 explicitly bars per-event/per-reservation line items from the Spending view but never says whether a per-*trip* table/list (e.g., "Trip Name | Spend | Status") is in or out of scope. Given the addendum explicitly limits this view to "charts" plus one figure (FR-18), but the PRD body never states that constraint at the FR level, an implementer could reasonably add a sortable trip list under the charts without violating any stated FR — this is a real ambiguity that should be pinned down before stories are written, not left to be decided implicitly during build.

### 7. SM-3's single-visit validation bar is wildly mismatched to the size of what's being built

SM-3 ("Spencer visits the Spending view at least once after a real trip concludes") is the only success metric validating FR-12 through FR-17 — four chart types, a shared filter, and a second independent currency-conversion layer (Finding 3). A single post-trip visit, ever, is an extremely low bar to "validate" a feature this large, especially next to SM-C1's explicit warning about over-building chores nobody needed. The PRD doesn't flag this asymmetry between build cost and validation threshold for a pre-alpha, single-user product — worth a second look before this much surface area gets built against one weak signal.

### 8. Vision section's "compound" framing undersells Travel Retrospective's actual incremental risk

§1 frames Travel Retrospective as numbers that simply "compound" once §4.1–4.5 ships — implying near-zero incremental design risk. Findings 1–3 above show real, new correctness problems specific to cross-trip aggregation (date-range/filtering-unit mismatch, numerator/denominator bug, currency-drift reintroduced at the rollup layer) that don't exist at the single-trip level. This likely explains why UJ-2 is tagged "Scope dial: Lighter" (§2.2) despite spanning 7 FRs, 4 chart types, and a second currency-conversion mechanic — the vision narrative undersold the feature's risk before scoping happened, and that undersell appears to have propagated into the scope-dial label.

### 9. Glossary (§3) omits FR-18 (average daily spend) from the Travel Retrospective definition

§3 defines Travel Retrospective as covering "spend trends by time/category/destination plus budget adherence" — four items, matching FR-14/15/16/17 only. FR-18 is absent even though it's in-scope per §7.1 and numbered as a peer FR. Minor on its own, but it's a concrete sign the Glossary wasn't updated in the same pass that added FR-18, which raises the question of what else from this late addition didn't get propagated.

### 10. FR-17's ±2% "on budget" tolerance is unconfirmed in the PRD but already locked into a 3-segment chart design in the addendum

The PRD's own Assumptions Index (§9) flags the ±2% tolerance as unconfirmed. The addendum, however, already specifies "donut chart, 3 segments (under / on / over budget)" as a settled UI decision. If the eventual answer is a strictly binary under/over split (no tolerance band), the chart's segment count and design change, not just a number — this is a fork in two different chart shapes being treated as a single fixed design while the input that determines which shape is correct remains an open assumption. The addendum should not have locked a 3-segment visual before this was resolved.

---

## Cross-cutting checks against §4.1–4.5 (lighter pass — already finalized, flagged only where §4.6 creates new fallout or something else stood out)

### 11. FR-9's all-or-nothing recalculation assumption remains unconfirmed and now also gates §4.6's adherence-chart correctness indirectly

Previously flagged as an open assumption (§9). Worth re-noting now that Finding 3 shows Travel Retrospective's correctness partly depends on recalculation/locking behavior being trustworthy — if FR-9's all-or-nothing guarantee doesn't hold under partial third-party API failure at scale (many trips, many currencies), that unreliability propagates into the cross-trip adherence chart (FR-17) as well, not just the single-trip Budget tab. The assumption was already worth resolving before implementation; §4.6 raises the stakes of leaving it unresolved.

### 12. FR-1's "no budget set" state interacts with Travel Retrospective's FR-17 exclusion rule but the connection is never drawn

FR-1 explicitly supports a trip with no budget set (Actual shown without percentage/remaining). FR-17 separately says trips with no budget set are excluded from the adherence chart "entirely." Both are individually fine, but nothing connects them explicitly — a reader of §4.6 alone wouldn't know FR-1 already defined this no-budget state, and there's no consequence bullet under FR-17 cross-referencing FR-1 the way other FRs in this PRD habitually do ("Realizes UJ-1," "see FR-8," etc.). Minor traceability gap, but this PRD is otherwise disciplined about cross-references, so the absence here stands out.

---

## Verdict

§4.1–§4.5 hold up on this pass — internally consistent, testable, no new contradictions surfaced. §4.6 does not yet meet the same bar. It contains a likely real arithmetic bug (Finding 1), an internal contradiction in how "the same filter" is claimed to apply uniformly across charts that actually filter on different units (Finding 2), and a cross-feature guarantee from FR-5 that silently breaks once the cross-currency rollup is added, with no mechanic specified to prevent it (Finding 3). The `ExpenseCategory` "reuse" claim (Finding 4) references a thing that doesn't exist yet in any concrete form. None of these are stylistic nitpicks — each one is a fork where an implementer will make a unilateral, unreviewed call that the PRD should have made instead. Recommend resolving Findings 1–3 before this section moves to architecture/epics.
