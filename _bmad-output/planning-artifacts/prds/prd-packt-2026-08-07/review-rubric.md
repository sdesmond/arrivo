# PRD Quality Review — Trip Notes (prd-packt-2026-08-07)

## Overall verdict

A tightly-scoped, deliberately small feature PRD that mostly earns its confidence: the Vision and Non-Goals sections make real, specific decisions (no task state, no search, no capture-bar) rather than hedging, and the addendum preserves genuine trade-off reasoning (rejected single-note and grid layouts, an intentional deviation from the Packing List collapse pattern). It falls short on done-ness: several core interaction mechanics — how a Note is saved/edited, what happens to unsaved edits when another Note auto-collapses, whether a fully blank Note can be saved — are left unresolved despite §9's claim that "no inline `[ASSUMPTION]` tags were needed." A couple of mechanical slips (a missing §2.2, a cross-reference to a rule FR-1 doesn't actually state) round out the gaps. None of this is critical for a feature this small, but it will cost an engineer or story-writer a round of clarifying questions.

## Decision-readiness — strong

The PRD states real decisions rather than "considerations": no checkbox/task state (§5), no capture-bar UI (§5, §7.7), no new permission model (§5, §6.2), no success metric tracked at launch (§7). The addendum explicitly instructs downstream readers not to "correct" the collapsed-row preview back to Packing List's title-only pattern — a genuine tension named and resolved, not smoothed over. §8's "None — all scope decisions in this PRD were resolved during discovery" is plausible given the referenced prior brainstorm, not a rhetorical dodge.

### Findings

None — this dimension holds up under scrutiny.

## Substance over theater — strong

Single persona (Harrison) reused across all five UJs and doing real work (UJ-5 specifically exercises mid-trip access as a distinct scenario, not persona padding). No NFR boilerplate, no differentiation/innovation section manufactured for its own sake — the PRD openly attributes the collapse-preview design to Keep rather than claiming novelty (Vision, §0; addendum §"Design rationale"). Vision statement uses concrete, non-swappable examples ("a passport expiry to check... a note to borrow a suitcase," §1) rather than generic language.

### Findings

None — this dimension holds up under scrutiny.

## Strategic coherence — strong

Clear thesis: give admin thoughts a home that is deliberately bounded so it can't grow into a second Packing List or Documents section (§1). Every FR and Non-Goal traces back to that boundary (no attachments, no checkboxes, no search). The absence of Success Metrics (§7) is the one soft spot for this dimension — there's no way to later confirm the thesis worked — but it's an explicit, reasoned decision with a `[NOTE FOR PM]` pointing at future candidates, not an oversight.

### Findings

- **low** No Success Metric to validate the thesis (§7) — the PRD bets that a bounded, search-less list is the right shape, but nothing in-PRD will confirm that bet post-launch beyond informal usage. _Fix:_ none required pre-launch per the stated decision; keep the `[NOTE FOR PM]` candidate (% of trips with ≥1 Note) ready to instrument if revisited.

## Done-ness clarity — adequate

Most FR consequences are genuinely testable (FR-1's no-title/first-line-as-title rule, FR-3's single-expanded-note rule, FR-6's persistence-across-reload rule). But the core create/edit interaction mechanic is never pinned down, and two real edge cases are left unaddressed.

### Findings

- **high** Save/edit trigger mechanism is never specified (FR-1, §85–94; FR-4, §118–125; UJ-1, §36) — UJ-1 says "writes the thought → saves" and FR-4 says edits "update the collapsed preview immediately on next collapse," but no FR states *how* a save is triggered: explicit Save button, autosave-on-blur, or save-on-collapse. An engineer cannot build FR-1 or FR-4 to a testable "done" without this. _Fix:_ add an explicit consequence to FR-1/FR-4 naming the save trigger.
- **medium** Unsaved-edit loss on auto-collapse is unaddressed (FR-3 consequence, §115, interacting with FR-4, §118–125) — FR-3 says expanding one Note "automatically collapses whichever Note was previously expanded," but if that Note was mid-edit (FR-4), the PRD never says whether those edits are saved, discarded, or blocked. _Fix:_ add a consequence to FR-3 or FR-4 resolving this interaction (e.g., "collapsing an in-edit Note autosaves it first").
- **medium** Fully-blank Note save behavior is undefined (FR-1, §87) — "an optional title and a body" leaves open whether body is also optional, and whether a Note with neither title nor body can be saved at all. _Fix:_ add a consequence stating the minimum content required to save.

## Scope honesty — adequate

Non-Goals (§5) and §6.2 do real work and are specific, not vague placeholders. But §9's claim that "no inline `[ASSUMPTION]` tags were needed — all scope decisions in this PRD were explicitly confirmed during discovery" doesn't fully hold against the PRD's own text: at least one interaction detail is described but not actually resolved to implementation-ready specificity, which is exactly what `[ASSUMPTION]` tags exist to flag.

### Findings

- **medium** "Persistent add action" is asserted, not resolved (FR-1 consequence, §93) — "available... from a persistent add action once Notes exist" names a UI element without saying what it is (floating button, header button, top-of-list row), and UJ-1's "the equivalent add action once notes exist" (§36) is equally non-committal. This reads as an inferred placeholder that should have carried an `[ASSUMPTION]` tag rather than being counted toward the "zero assumptions" claim in §9. _Fix:_ either specify the add-action's location/form, or tag it `[ASSUMPTION]` and index it in §9.
- **low** Manual reorder's interaction mechanism is unstated (FR-6, §136–143) — "can manually reorder Notes" doesn't say drag-handle, up/down controls, or another pattern; the reference to "consistent with Packing List items and Itinerary days" (§4.1) implies an existing pattern but doesn't name it. _Fix:_ cite the specific existing reorder pattern being reused, or tag as `[ASSUMPTION]`.

## Downstream usability — adequate

Glossary (§3) terms are used consistently and capitalized uniformly across FRs and UJs. FR IDs (FR-1–FR-7) and UJ IDs (UJ-1–UJ-5) are contiguous and cross-references resolve in the intended direction, with one exception noted below. Each UJ carries a named protagonist inline, satisfying the "no floating UJs" check.

### Findings

- **low** FR-2's cross-reference to FR-1 points at a rule FR-1 doesn't state (FR-2 consequence, §102) — "a Note with only a title and no further body still shows that title as both title and preview per FR-1" — but FR-1's consequences (§91–94) only cover the *no-title* case (first line becomes the title), not the *title-but-no-body* case FR-2 is describing. The cross-reference is misdirected. _Fix:_ either move this rule's authority into FR-1 explicitly, or drop the "per FR-1" attribution from FR-2.

## Shape fit — strong

This is a consumer-facing addition to an existing multi-feature trip-planning app, and the PRD correctly uses UJs with a named, recurring protagonist rather than either over-formalizing (multiple personas, capability-spec framing) or under-formalizing (no UJs at all). Brownfield references (Day Notes, Documents, Packing List, Itinerary) are used accurately and distinguished from the new Trip Notes surface throughout §3 and §5. Proportionate for a small, bounded feature.

### Findings

None — this dimension holds up under scrutiny.

## Mechanical notes

- **Section numbering gap**: §2 jumps from "### 2.1 Jobs To Be Done" (line 24) directly to "### 2.3 Key User Journeys" (line 31) — no §2.2 exists. Minor, but will look like a missing section to anyone scanning the TOC.
- **Cross-reference drift**: see Downstream usability finding above (FR-2 → FR-1 misattribution).
- **Assumptions Index roundtrip**: technically satisfied (zero inline tags, zero index entries), but see Scope honesty findings — at least one detail ("persistent add action") functions as an unflagged assumption in substance even though the PRD doesn't label it one.
- **UJ protagonist naming**: satisfied — all five UJs name Harrison inline with context.
- **Glossary drift**: none observed; terms (Trip Notes, Note, Day Notes, Documents, Packing List, Itinerary) are used consistently in case and form throughout.
