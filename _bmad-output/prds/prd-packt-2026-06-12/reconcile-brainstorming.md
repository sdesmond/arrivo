# Reconciliation: Brainstorming Session vs. PRD Draft

**Source:** `_bmad-output/brainstorming/brainstorming-session-2026-06-12-0657.md`
**PRD:** `_bmad-output/prds/prd-packt-2026-06-12/prd.md`
**Decision log:** `_bmad-output/prds/prd-packt-2026-06-12/.decision-log.md`

This document identifies brainstorming ideas/requirements/qualitative intent that are not captured in the PRD and not addressed in the decision log. Items already covered by documented decisions (reservations-only tab, edit sheet retained, chronological view deferred, Bus/Ferry added, "Edit Cover"/"Remove Cover" relabeling, "Info" label) are excluded — those are intentional and accounted for.

## Gaps Found

### 1. Validation #5's disambiguation rationale is undermined by the relabeling, with no replacement check

Validation #5 ("Edit Image"/"Remove Image") was specifically about preventing users from confusing image-level actions with trip-level actions (Delete Trip). The decision log renames these to "Edit Cover"/"Remove Cover" for a different reason (terminology consistency with `CoverType`'s Map/Graphic options) — a reasonable rename. However, the underlying *problem* Validation #5 was solving (overflow-menu image actions being confused with the trip-level "Delete Trip" danger-zone action) is never addressed for the new menu. FR-11 doesn't state where the Cover Overflow Menu sits relative to "Delete Trip," and since the edit sheet (where Delete Trip lives, per Structure #7 and the decision log's confirmation that edit-sheet fields including Delete Trip "remain unchanged") is a different surface than the Cover, the literal collision Validation #5 worried about may now be moot. But the PRD never makes this reasoning explicit — a reader can't tell whether the disambiguation concern was considered and dismissed as moot, or simply dropped. This is a minor documentation gap rather than a functional one, but worth a one-line note in §4.3 or a decision-log entry confirming the concern no longer applies given the Cover Overflow Menu and Delete Trip live on different UI surfaces.

### 2. "Linked" UI cue on the Itinerary is underspecified relative to Foundation #4's framing

Foundation #4 calls for "a clear 'linked' UI cue in the Itinerary" as a *requirement* for the single-source-of-truth model to feel trustworthy — not just a nice-to-have visual distinction. FR-7's consequence ("Linked Events are visually distinguishable... e.g., a 'linked' indicator") captures this at a high level, and the decision log confirms FR-7 (referred to there as "FR-6") was reviewed. This is largely covered. The one nuance not carried forward: Foundation #4 frames the cue as serving a *trust* function — communicating to the user "you can't break this by editing it here, go to Reservations." FR-10 (redirect-to-edit) implements the mechanism, but neither FR-7 nor FR-10 ties the visual cue to communicating *why* tapping leads to a redirect (e.g., a tooltip/affordance hinting "this is from a Reservation — tap to view/edit"). This is a minor UX-polish gap, not a missing requirement, but worth flagging since it's the kind of detail that's easy to lose between brainstorming's qualitative framing and FR consequence-bullet structure.

### 3. Role-Playing's "mobile mid-trip" lens isn't explicitly tied to the Reservations tab's accordion/preview design

Role Playing's framing (mobile mid-trip lookup, new-trip cold start, power user with many reservations, casual user + overflow menu) drove Validations #1-3. UJ-2 and FR-2 capture the cold-start and "find by type vs. by date" scenarios reasonably well. However, the "power user with many reservations" stress-test isn't reflected as an explicit non-functional consideration anywhere in the PRD — e.g., no statement about how a section with, say, 15 Flight reservations behaves (scrolling within an expanded accordion, pagination, sort order within a type). FR-2 says expanding "reveals every Reservation of that type as individual rows" but doesn't specify sort order (chronological? creation order?) for a busy section. This is a small but real gap: a power user is one of the four personas the brainstorming explicitly stress-tested, and the PRD's FR-2 doesn't carry forward an answer for that case. Recommend either an `[ASSUMPTION]` tag (e.g., "Reservations within an expanded accordion section are sorted by `startTime` ascending") or an explicit FR-2 consequence bullet.

### 4. "Energy/tone" framing of Overview-as-reference (Validation #1) is preserved, but the PRD doesn't restate the resulting design freedom it implied

Validation #1's payoff was that *because* the Itinerary handles "what's happening now," the Reservations tab is freed to optimize purely for "comprehensive reference/management" rather than time-sensitivity. This framing implicitly argues against, e.g., highlighting "today's" reservations on the Reservations tab itself (since that's the Itinerary/Now Card's job). The PRD's FR-2 "next-upcoming preview" per collapsed accordion section is consistent with this but sits close to the line — a preview of the *next upcoming* item could be read as the tab trying to also do "what's happening now." This isn't a contradiction (preview ≠ time-sensitive prioritization of the whole tab), but the PRD doesn't explicitly note that the "next-upcoming preview" is an orientation aid within the reference view, not a re-introduction of "current status" framing that Validation #1 deliberately kept off the Reservations tab. Low-priority — flagging only because it's the kind of qualitative nuance that FR bullet points tend to flatten.

## Items Checked and Confirmed Not Gaps (documented in decision log)

- Full "command center" Overview tab / hero with editable trip metadata (Foundations #1, #5; Structure #1) — explicitly reversed by decision log 2026-06-13 pivot.
- Edit sheet retirement (Structure #4) — explicitly reversed; edit sheet retained.
- Chronological view toggle (Structure #5) — explicitly deferred to §6.2 / Open Questions.
- "Edit Image"/"Remove Image" exact wording (Validation #5) — superseded by "Edit Cover"/"Remove Cover" per decision log rationale.
- Bus/Ferry reservation types — added beyond brainstorming's list, decision log notes this explicitly.
- Collaborators section (Structure #1) — implicitly covered since trip metadata/collaborators stay in the (retained) edit sheet; consistent with the pivot.
- "Delete Trip" danger-zone card (Structure #7) — edit sheet retained with Delete Trip unchanged per decision log; not orphaned.

## Overall Assessment

The PRD is a faithful, well-documented narrowing of the brainstorming session. The four items above are minor — mostly missing one-line clarifications or `[ASSUMPTION]` tags for nuances that the brainstorming's narrative prose carried but the FR/consequence structure tends to drop. None represent a missing feature or a silently-dropped major requirement. Item 3 (sort order for busy accordion sections) is the most concrete and easiest to close with a single `[ASSUMPTION]` tag in FR-2.
