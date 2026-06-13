# PRD Quality Review — Trip Overview Consolidation

## Overall verdict

This PRD is in good shape for a solo-project, chain-top document: it has a clear glossary, contiguous FR/UJ numbering, honest assumption-tagging, and testable consequences for almost every FR. The main risks are (1) a few FRs lean on adjectives ("immediately", "no separate sync step") without defining the sync/consistency model precisely enough for an engineer to know what "done" means for concurrent edits and cascading Linked Event updates, and (2) two brownfield details — the existing Now Card overflow menu and the existing "Remove image" semantics in `trip-edit-cover.tsx` — aren't reconciled with the new Cover Overflow Menu and "Remove Cover" behavior, which could cause UI collisions or a silent behavior change. Scope and stakes are well-calibrated for a personal project heading to release; no enterprise theater present.

## Decision-readiness — adequate

The big decisions are stated as decisions: reservations-only tab (not a "command center"), edit sheet retained, Linked Events are never independently editable, chronological view deferred. Trade-offs are mostly named — e.g. §6.2 explicitly says the by-type view is chosen over chronological and gives a revisit condition ("if dense itineraries make by-type scanning tedious").

However, the single Open Question (§8: "Should the chronological view toggle be revisited before or after initial usage feedback?") is genuinely open but also fairly low-stakes — it reads more like a scheduling note than a product decision that blocks implementation. There's no open question or `[NOTE FOR PM]` addressing harder tensions that the PRD itself surfaces, e.g.:

- FR-3 says editing `type` on a Reservation updates Linked Events "immediately" — but changing `type` changes the *labels and count* of Linked Events (e.g. Lodging → Flight changes Check-in/Check-out into Departure/Arrival, and potentially drops from 2 events to 1). This is a real design decision (regenerate vs. relabel) that's glossed as a one-line consequence.
- FR-9/FR-10 imply Linked Events appear on the Itinerary day grid and the Now Card, but never state what happens to day-grid ordering/grouping when a Reservation's `endTime` lands on a day with no corresponding Day entity in the trip (e.g., reservation spans before trip start or after trip end). This is plausible for real reservations (e.g., a flight departs the day before the trip's first Day) and isn't acknowledged anywhere.

### Findings

- **high** Reservation type change and Linked Event regeneration not specified (§4.1 FR-3) — "Saving an edit to `startTime`, `endTime`, or `type` updates that Reservation's Linked Event(s) on the Itinerary immediately" treats a `type` change the same as a time change, but a type change can alter the *count* (1↔2) and *labels* of Linked Events. _Fix:_ Add a consequence (or `[NOTE FOR PM]`) describing Linked Event regeneration on type change — e.g., "changing `type` deletes and recreates all Linked Events for that Reservation using the new type's labels and endTime requirements."
- **medium** Reservation dates outside trip date range unaddressed (§4.2 FR-7, §3 Glossary) — Linked Events are "generated... on the corresponding day," but no FR or Non-Goal addresses what happens if a Reservation's `startTime`/`endTime` falls before the trip's first Day or after its last Day (a common real case — e.g., an outbound flight the night before Day 1). _Fix:_ Add a consequence or `[ASSUMPTION]` — e.g., "Linked Events outside the trip's Day range are not created (Out of Scope for MVP)" or "the Itinerary's Day range expands to accommodate them."

## Substance over theater — strong

No persona theater (one persona, Ashley, used consistently and every UJ drives at least one FR). No NFR boilerplate — there are no "system must be scalable/secure" sections, appropriately, since this is a personal project. The Vision statement (§1) is specific to this product: it names the actual gap (no booking record beyond manual events), the actual mechanism (Linked Events projected onto Itinerary), and the actual scope boundary (Cover menu is "separately, and independently shippable"). It would not swap into another PRD unchanged.

## Strategic coherence — strong

Clear thesis: Reservations become the source of truth for bookings, and the Itinerary stays a derived/synced view rather than a place for duplicate manual entry. Feature order (Reservations tab → Itinerary integration → Cover menu) follows the thesis, with the Cover menu explicitly called out as orthogonal/independently shippable rather than forced into the same narrative — that's an honest structural choice, not padding.

Success Metrics (§7) validate the thesis directly: SM-1 and SM-2 are about *accuracy of sync* (no drift, matches reality), not activity counts (no "X reservations added per week" vanity metric). The counter-metric SM-C1 (add-reservation flow shouldn't be slower than adding a manual event) is a real tension against FR-1's two-step type-picker-then-form flow, and it's named rather than smoothed over.

## Done-ness clarity — adequate, with gaps

Most FRs (FR-1, FR-2, FR-4, FR-6, FR-8, FR-9, FR-11, FR-12) have testable, falsifiable consequences — e.g. FR-12's consequence is essentially a diff ("`trip-edit-sheet.tsx` no longer renders cover image editing UI; `trip-edit-cover.tsx` is removed"). That's about as done-ness-clear as PRD prose gets.

Weaker spots:

### Findings

- **high** "Immediately" / "no separate sync step" used as the entire acceptance criterion for the Reservation↔Itinerary sync (§4.1 FR-3, §4.2 FR-7, §3 Glossary "Linked Event"). For a single-user app this is probably fine in practice (no concurrency), but the PRD never states the actual mechanism — is the Itinerary's Linked Event a derived/computed view (no persisted row), or a persisted `TripEvent` row that gets updated/deleted/recreated on Reservation edit? This matters for "done": if persisted, FR-3's "immediately" implies a write-cascade on every Reservation save; if derived, FR-4 ("Deleting a Reservation removes its Linked Event(s) from the Itinerary") is trivially true by construction. _Fix:_ Add one sentence to the Glossary's "Linked Event" entry stating whether Linked Events are persisted `TripEvent` rows or computed at read-time — this single decision affects FR-3, FR-4, FR-7, FR-9, and FR-10 simultaneously.
- **medium** FR-10's "scrolled/expanded to the relevant Reservation's accordion section row" (§4.2) is a UX behavior with no bound on what "relevant" means when a Reservation type section is already collapsed with multiple rows, or when the user is mid-edit on another row. _Fix:_ Either accept as implementation detail (fine for a solo project) or add a one-line consequence: "expands the type's accordion section if collapsed and scrolls the specific Reservation row into view."
- **low** FR-1's consequence "the dialog cannot be saved without it for those types" doesn't specify the validation error UX (inline message vs. disabled save button) — likely fine to leave to implementation given existing inline-edit patterns, but worth a one-line `[ASSUMPTION]` for consistency with the rest of the doc's assumption-tagging discipline.

## Scope honesty — strong

Two `[ASSUMPTION]` tags (FR-5, both correctly indexed in §9 with roundtrip — both appear inline and in the index). §5 Non-Goals is substantive (no cost-tracking/budget linkage, restaurant/activity reservations stay plain events, edit sheet otherwise unchanged) rather than a token section. §6.2 Out of Scope items are real deferrals with reasoning, not silent omissions. One `[NOTE FOR PM]` at §6.2 sits at a real tension (when to revisit chronological view) rather than a safe checkpoint.

Open-items density (1 Open Question, 2 Assumptions, 1 NOTE FOR PM) is appropriately low for a personal-project PRD that's otherwise implementation-ready — this is not a PRD hiding unresolved issues behind a high density of caveats.

## Downstream usability — strong

Glossary (§3) terms are used consistently and verbatim across FRs and UJs — "Linked Event," "Reservation Type," "Cover Overflow Menu," "Reservations Tab" all appear with consistent casing/phrasing everywhere checked. FR numbering is contiguous (FR-1 through FR-12) and every FR cites which UJ(s) it realizes. UJs (UJ-1 through UJ-4) each have a named protagonist (Ashley) and a clear entry/path/climax/resolution structure that a UX or architecture pass could lift directly.

One mechanical issue: FR-11's consequences reference "FR-10" in §4.3's FR-12 description ("all cover management happens via FR-10") — this appears to be a cross-reference error (should be FR-11). See Mechanical notes.

## Shape fit — strong

Consumer product with meaningful UX → UJs with named protagonists are load-bearing here, and the PRD delivers exactly that (4 UJs, all driving FRs, no orphans). Brownfield references are specific and (per code check) accurate: `TripDetailTab`, `CoverType`, `Document.scope: "trip" | "event"`, `trip-edit-cover.tsx`, `CoverImagePicker`, and `Now Card` all exist in `src/data/types.ts` and `src/components/packt/` as described. This is appropriately "rigor light, substance bar still applies" for a solo project — no UJ-density overformalization, no missing UJs for user-facing flows.

### Findings

- **medium** Cover Overflow Menu placement may collide with an existing overflow menu (§4.3 FR-11). `src/components/packt/now-card.tsx` already renders a "⋯" `DropdownMenu` (`MoreHorizontal` icon) in the **upper-right of the trip cover area** on the Now Card, with "Trip options" (edit/delete trip). FR-11 adds a *second* "⋯" overflow menu "in the upper-right of the Cover image" for cover-specific actions (Edit Cover, Remove Cover, Info). The PRD doesn't address whether these are the same menu (merged), stacked in the same corner (likely visually crowded/confusing), or on different Cover instances (Now Card cover vs. trip detail page cover — plausible but not stated). _Fix:_ Add a consequence or `[ASSUMPTION]` clarifying whether FR-11's menu is on the trip detail page's Cover only (distinct from Now Card's existing trip-options menu), and if both appear on the same Cover instance, how they're positioned relative to each other.
- **low** "Remove Cover" semantics differ from existing "Remove image" pattern (§4.3 FR-11 vs. `trip-edit-cover.tsx`). The existing `TripEditCover` component's "Remove image" button calls `onCoverImageUrlChange(null)` (clears to no image). FR-11's "Remove Cover" instead "reverts the cover to a random Graphic" — a different, arguably better, behavior. This is a behavior change being introduced under the banner of "consolidation," not just a relocation of existing controls. _Fix:_ Either add a sentence to FR-11 or §1 acknowledging this is a behavior change (not pure UI consolidation), or confirm it's intentional — likely fine either way, but currently reads as if FR-11 is a like-for-like move when it isn't.

## Mechanical notes

- **Cross-reference error**: §4.3 FR-12's prose says "all cover management happens via FR-10," but FR-10 is "Editing from the Itinerary redirects to Reservations" (§4.2) — unrelated to cover management. This should reference **FR-11** (Cover Overflow Menu). Easy fix, but would confuse a downstream reader following references literally.
- **Glossary consistency**: "Reservation," "Reservation Type," "Linked Event," "Reservations Tab," "Document," "Now Card," "Cover," "Cover Overflow Menu" are all defined in §3 and used with consistent capitalization throughout §4 and the UJs. No drift found.
- **Assumptions Index roundtrip**: Both `[ASSUMPTION]` tags (§4.1 FR-5, two instances) are indexed in §9 and both index entries correspond to inline tags. Roundtrip is clean.
- **ID continuity**: FR-1 through FR-12 are contiguous and each is referenced from at least one UJ. UJ-1 through UJ-4 are contiguous (note: §2.1 has a "2.3 Key User Journeys" heading with no "2.2" — likely a removed/renumbered section from an earlier draft; harmless but worth a glance before finalizing numbering).
- **Title placeholder**: §0 line 10 — "_Working title — confirm._" for the document title "Trip Overview Consolidation" — this is a loose end the PM should resolve before treating the PRD as final, though it doesn't affect engineering readability.
