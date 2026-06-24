# PRD Quality Review — Trip Budget Management, Expense Tracking & Travel Retrospective

## Overall verdict

This PRD remains tight and disciplined where it was previously reviewed (§4.1–4.5), and the new Travel Retrospective section (§4.6, FR-12–FR-18) holds the same bar: every FR has testable consequences, the addendum boundary is respected, and the two genuine scope gaps flagged in an earlier reconciliation pass (averages, continent rollup) have since been resolved in-document. The weakest spots are unchanged in kind from the prior review — trade-offs read as settled outcomes rather than contested forks — plus one new soft spot: Travel Retrospective's Success Metric (SM-3) is the thinnest validation claim in the document, and FR-17's "on budget" tolerance is still an unconfirmed assumption now load-bearing for a whole chart rather than an edge case.

## Decision-readiness — adequate

Most decisions are stated as decisions: FR-9's all-or-nothing recalculation, FR-11's icon+color pairing, FR-13's single-filter-drives-everything design. The Travel Retrospective section makes a real decision explicit at the UJ level — "Scope dial: Lighter — read-only cross-trip aggregation; no new write paths" (UJ-2, §2.2) — which is exactly the kind of stated trade-off the rubric wants.

But trade-offs are still mostly outcomes, not forks-rejected-with-reasons. FR-16's consequence block (§4.6) states the destination granularity decision plainly — "country is the sole granularity; no state/city drill-down... and no continent-level rollup either (cut alongside state/city, not carried forward from the brainstorm's 'country/continent' framing)" — which is good practice (it even cites the superseded brainstorm framing), but never says *why* continent was cut beyond proximity to the state/city cut. Continent-level rollup is a static lookup from `destinationCountry`, cheaper than the state/city drill-down it's bundled with, so lumping them together without separate justification reads as convenience, not a reasoned trade-off.

FR-18's average-daily-spend weighting choice is the strongest trade-off statement in §4.6: "total filtered spend divided by total filtered trip-days, not a simple average of each trip's own daily average (so longer trips weight proportionally more, not equally with short ones)" — names the rejected alternative and the consequence of rejecting it. This is the rubric's ideal case and should be the template for the weaker spots above.

### Findings

- **medium** Continent-rollup cut stated but not argued (§4.6 FR-16 consequences, §6 Non-Goals) — "cut alongside state/city" borrows state/city's data-availability rationale, but continent is derivable from the already-structured `destinationCountry` field via a static lookup table, so the same justification doesn't actually apply. _Fix:_ either give continent its own one-line rationale (e.g., "no validated user need beyond country-level" or "deferred to keep the donut chart count fixed at four") or reopen it as in-scope since the blocking reason cited doesn't hold.
- **low** Trade-offs in §4.1–4.5 still read as outcomes rather than forks (carried over from prior review, unchanged): §5's conversion-failure fallback and FR-4's closed-category-enum decision still don't name the rejected alternative inline.

## Substance over theater — strong

No persona/UJ inflation: two personas total (Sally, Spencer — actually one persona, two roles of the same single-user product), two UJs, both load-bearing. UJ-2 cites FR-12 through FR-18 by realization and the "Scope dial" callout makes its own weight in the document explicit rather than padding it. The Travel Retrospective Vision paragraph (§1, second paragraph) is specific to this product's data shape — "the same numbers compound into something only possible across many trips" — not boilerplate aggregation-feature language. No NFR theater in the new section: the accessibility NFR for charts (§5) names a concrete floor — "donut/bar charts (FR-14–FR-17) must distinguish segments without relying on color alone (e.g. labels, legend, or pattern) — same color-blind-safe floor, extended to chart form" — extending an existing concrete commitment rather than restating "must be accessible."

## Strategic coherence — strong

The Travel Retrospective section extends rather than dilutes the PRD's thesis. §1 states the dependency cleanly: "Once that per-trip data exists, the same numbers compound into something only possible across many trips" — Travel Retrospective is explicitly sequenced as a second-order payoff of the Budget feature, not a bolted-on capability. §4.6's description reinforces this with a clean division of responsibility: "Where the Budget tab... answers 'how is this one trip doing,' Travel Retrospective answers 'how am I doing across all my trips'... Travel Retrospective never shows per-event/per-reservation line items." This boundary is tested at the FR level too (FR-12's consequence: "Spending never displays per-event or per-reservation line items").

One soft spot: SM-3 ("Spencer visits the Spending view at least once after a real trip concludes... Validates FR-12 through FR-17 deliver ongoing value, not a novelty viewed once") is a weak validation signal for six FRs (now seven, with FR-18 unmentioned in its own validation line — see Mechanical notes). A single post-trip visit doesn't actually distinguish "ongoing value" from "novelty," despite the metric's own stated intent to rule novelty out — one visit is consistent with either.

### Findings

- **low** SM-3 doesn't measure what it claims to rule out (§8) — "at least one" visit after a trip concludes is consistent with one-time novelty use, not "ongoing value" as the metric's own validation note frames it. _Fix:_ either lower the claim (drop "not a novelty viewed once") or strengthen the metric (e.g., visits after at least two separate trip conclusions).

## Done-ness clarity — strong

§4.6 holds the same bar as §4.1–4.5: every FR (FR-12–FR-18) has a stated outcome, and five of seven have explicit "Consequences (testable)" blocks (FR-12, FR-13, FR-15, FR-16, FR-17, FR-18 — FR-14 is the exception, see Mechanical notes). No "handles gracefully" language anywhere in the new section. Bounds are concrete where they matter: FR-13's filter set is enumerated exactly ("This Year / Last Year / Last 12 Months / All Time, defaulting to This Year"), FR-16's "Unknown" bucket handles the missing-destination case explicitly rather than silently excluding, FR-18's denominator-exclusion rule for zero-duration trips is spelled out to prevent average distortion.

FR-17 is the one place done-ness clarity in §4.6 is incomplete by the PRD's own admission: the consequence block states the chart's three segments (under/on/over) but the dividing line for "on" is unresolved — `[ASSUMPTION: "on budget" defined as Actual within ±2% of Budget total... exact tolerance to confirm before implementation]`. This is flagged correctly per the Scope Honesty dimension, but it means a whole chart's segmentation logic is not yet testable as written, which is a bigger gap than the FR-7-style "confirm a numeric ceiling" assumptions elsewhere in the document — those don't change which bucket data lands in, this one does.

### Findings

- **medium** FR-17's core segmentation boundary is unresolved (§4.6, §9) — "on budget" tolerance is an open `[ASSUMPTION]`, but unlike other assumptions in this PRD (e.g., FR-7's amount ceiling), this one determines which of three chart segments a trip's data point falls into — the chart literally cannot be implemented or tested until it's resolved, not just refined later. _Fix:_ flag explicitly in §7 or via `[NOTE FOR PM]` that FR-17 is blocked on this decision, distinguishing it from the lower-stakes numeric-ceiling assumptions.
- **low** FR-14 has no "Consequences (testable)" block (§4.6) — every sibling FR in §4.6 has one; FR-14's bare description ("Spending view shows spend per time period within the filtered range") leaves "per time period" granularity (daily/weekly/monthly — does it adapt to the filter range?) unstated. _Fix:_ add a consequence bullet specifying the time-bucket granularity per filter selection (e.g., does "All Time" bucket by year while "Last 12 Months" buckets by month?).

## Scope honesty — strong

§6 Non-Goals does real work for the new section specifically: "Travel Retrospective (§4.6) does not include CSV/PDF export, or an 'insights' copy/logic layer... both considered and explicitly cut; insights had no usage data to validate what's actually insightful, and export had no clear value case" — names the alternative and the reason, not just the omission. The destination-granularity non-goal is similarly explicit. The addendum's "Explicitly cut during discovery" bullet (addendum.md line 59) mirrors this, keeping the cut traceable across both documents.

Open-items density for §4.6 alone: 1 `[ASSUMPTION]` (FR-17 tolerance) — proportionate, not inflated, for a feature this size. Combined with the carried-over items from §4.1–4.5 (3 more `[ASSUMPTION]`s, 1 `[NOTE FOR PM]`), total document density (5 assumptions, 1 NOTE FOR PM, 0 open questions remaining now that the Trip-Currency-change question was resolved into FR-3) is still proportionate for a pre-alpha, single-user, "final" status PRD — though see the Done-ness finding above: FR-17's assumption carries more implementation risk than its peers despite being indexed identically.

## Downstream usability — strong (upgraded from "adequate")

The §2 numbering gap flagged in the prior review (2.1 → 2.3, missing 2.2) has been fixed — current document runs 2.1 Jobs To Be Done, 2.2 Key User Journeys, cleanly. Glossary (§3) now includes "Travel Retrospective" as a defined term, used consistently in §1, §2.2, §4.6, §6 with matching capitalization. FR IDs run FR-1 through FR-18 contiguous, no gaps or duplicates; cross-references ("Realizes UJ-2," "same `ExpenseCategory` enum as the trip-level Budget tab") resolve correctly into §3 Glossary terms. UJ-2 has a named protagonist (Spencer) with inline context, matching UJ-1's pattern.

One residual cross-document terminology note: the addendum still titles itself "Addendum — Trip Budget Management & Expense Tracking" (addendum.md line 1) without Travel Retrospective in the title, even though it now contains a full "Travel Retrospective — Component & UI Notes" section (lines 47-60). Not a blocking issue since the content is present and correctly placed, but the title undersells the document's current scope.

### Findings

- **low** Addendum title doesn't reflect its Travel Retrospective content (addendum.md line 1) — title still reads "Trip Budget Management & Expense Tracking" despite containing a full Travel Retrospective implementation-notes section. _Fix:_ retitle to match prd.md's title, or add "(includes Travel Retrospective)" suffix.

## Shape fit — strong

Travel Retrospective is shaped consistently with the rest of the document: capability-spec tone, one persona/UJ pairing (Spencer/UJ-2), Success Metrics framed as usage/correctness rather than growth (SM-3, though see Strategic Coherence finding on its weak validation power). The addendum boundary holds for the new section too — chart library choice, donut-vs-bar rationale, and the Mapbox-backed location-resolution detail all live in addendum.md's "Travel Retrospective — Component & UI Notes," not in prd.md. No UJ density problem from adding a second feature area; the PRD scales to two personas without becoming a backlog-with-headings.

## Mechanical notes

- Glossary terms consistent throughout, including the newly added "Travel Retrospective" entry (§3); no drift detected.
- FR IDs FR-1–FR-18 contiguous and unique; all "Realizes UJ-_" / "Realizes FR-_" cross-references resolve.
- Assumptions Index (§9) roundtrips cleanly: all 5 inline `[ASSUMPTION]` tags (FR-4 cost-field drop, FR-7 max ceiling, FR-9 all-or-nothing, §5 conversion-failure fallback, FR-17 on-budget tolerance) are indexed, and all 5 index entries have a matching inline tag.
- §2 numbering gap from the prior review (2.1 → 2.3) is fixed; now runs 2.1/2.2 correctly.
- FR-14 is the only FR in the document with no "Consequences (testable)" subsection — every other FR (FR-1 through FR-13, FR-15 through FR-18) has one. See Done-ness clarity finding.
- §7.1 says "All of §4.1–4.6 (FR-1 through FR-17)" — this is now stale; FR-18 exists and is in scope per §4.6 and §7.1's own prose ("Travel Retrospective: ... charts driven by a single date filter"), but the parenthetical range wasn't updated when FR-18 was added.
- Two stale reconciliation artifacts in this folder (`reconcile-travel-retrospective.md`, `reconcile-brainstorming-session.md`) reference gaps (averages missing, continent rollup unexplained) that have since been resolved in the current prd.md (FR-18 covers averages; continent is now explicitly named as cut in FR-16/§6) — these reconcile docs are now historical, not live findings; no action needed beyond awareness.

### Findings

- **low** §7.1's FR range is stale (§7.1) — reads "FR-1 through FR-17" but the document now runs through FR-18. _Fix:_ update to "FR-1 through FR-18."
