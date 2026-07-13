---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: "Making location data (addresses on events/reservations) useful and visible via maps, without forcing every itinerary item to have a location"
session_goals: "Generate ideas ranging from quick tactical wins to structural rethinks for: (1) one-click access to a map for any item with a recorded address, (2) an overall trip map view, (3) distance/directions between events, all while preserving freeform non-located items (e.g. 'shopping') as first-class, unlike Wanderlog's location-mandatory model"
selected_approach: "ai-recommended"
techniques_used: ["First Principles Thinking", "SCAMPER Method", "Role Playing"]
ideas_generated: [16]
technique_execution_complete: true
session_active: false
workflow_completed: true
context_file: ""
---

# Brainstorming Session Results

**Facilitator:** Spencer
**Date:** 2026-07-11

## Session Overview

**Topic:** Making location data (addresses on events/reservations) useful and visible via maps, without forcing every itinerary item to have a location

**Goals:** Generate ideas ranging from quick tactical wins to structural rethinks for: (1) one-click access to a map for any item with a recorded address, (2) an overall trip map view, (3) distance/directions between events, all while preserving freeform non-located items (e.g. "shopping") as first-class, unlike Wanderlog's location-mandatory model

### Context Guidance

_No context file provided. Prior codebase research (not part of this brainstorming doc) confirmed: addresses already capture lat/lng via Mapbox autocomplete on events and reservations; display today is plain-text only; Map tab is an unused placeholder; a Mapbox static-image proxy route exists unused; no interactive map library is installed yet._

### Session Setup

Spencer explicitly wants to avoid Wanderlog's "location mandatory" model — freeform items like "shopping" should remain valid without a location. Priorities called out up front: (1) single-click map access wherever an address already exists, (2) a whole-trip map view, (3) distance/direction calculation between events. Approach: AI-recommended techniques, facilitator's choice.

## Technique Selection

**Approach:** AI-Recommended Techniques

**Analysis Context:** Location-optional map feature for an existing itinerary app, with a stated tension to resolve (address-optional vs. Wanderlog's address-mandatory model) plus three concrete pull-requests already named by Spencer (one-click map, whole-trip map, distance/directions).

**Recommended Techniques:**

- **First Principles Thinking** (creative): Foundation phase. Before generating features, strip the idea of "location" down to what it actually needs to do for a traveler — this directly interrogates the Wanderlog-mandatory-vs-optional tension and should surface non-obvious models (e.g., location as an enrichment layer rather than a required field).
- **SCAMPER Method** (structured): Generation phase. Systematically pass Substitute/Combine/Adapt/Modify/Put-to-other-use/Eliminate/Reverse over the app's existing map-adjacent surfaces (the unused Map tab, address pills, the unused static-map route, the mocked mini-map-rail "today's route") to generate a wide, concrete set of feature ideas grounded in what already exists.
- **Role Playing** (collaborative): Refinement phase. Step into different stakeholder shoes — the day-of traveler needing walking directions, the planner comparing neighborhoods before booking, the person who just wants to jot "shopping" with zero location friction — to pressure-test ideas from Phase 2 and catch gaps neither prior phase would surface alone.

**AI Rationale:** This sequence deliberately shifts creative domain each phase (assumption-challenging → structured/systematic → stakeholder/empathy) per anti-clustering practice, and ends on a phase that naturally produces edge cases and UX concerns rather than more raw features — good for a session that already has concrete "must-haves" and needs breadth plus a reality check.

## Technique Execution Results

### Phase 1: First Principles Thinking

**Interactive Focus:** Broke "I want to see an address on a map" into its real component needs (where is it / how far / how do I get there), then dug into the hardest sub-problem — what transit mode to assume when computing travel time — since that turned out to require more design thinking than the map itself.

**Key Breakthroughs:**

**[First Principles #1]**: Mode Inference from Trip Context
_Concept_: Infer default transit mode per-trip (or per-day) from data already in the trip — a rental car reservation on overlapping dates suggests driving, a transit pass or dense-city destination suggests walk/transit — instead of asking the user to configure it separately.
_Novelty_: Ties reservations data to map behavior; nobody asks "how do you get around" as a setup question, the app infers it from what's already booked.

**[First Principles #2]**: Three-Layer Transit Mode Model
_Concept_: Cascading override — (1) smart default (distance + trip context), (2) global account-level preference that can turn inference off, (3) per-segment override ("just this hop, I'm walking") that wins over both. The ambient distance/time display doubles as the entry point for layer 3 — tap the number to override that one hop, no memory/learning across the trip.
_Novelty_: Most apps pick only one layer (usually a flat toggle or a one-off per-trip picker). Layering them means zero-config users are never bothered and control-seeking users are never blocked. Confirmed with Spencer: no adaptive learning from overrides — keep per-hop overrides one-off and simple.

**[First Principles #3]**: Preference as a Small Rule, Not a Single Switch
_Concept_: "I prefer to drive" is actually "drive, except when close enough that walking is obviously better." Model the preference as a default mode + one distance-threshold exception, not a flat toggle.
_Novelty_: Captures the actual reasoning a person does mentally, without a settings matrix.

**[First Principles #4]**: "Getting Around" as Its Own Trip-Edit Section
_Concept_: Global default preference lives at the account level; each trip gets its own override, seeded from the global default. Confirmed via codebase check: the trip edit sheet (`trip-edit-sheet.tsx:207-257`) already composes from discrete `Section`/`Field` blocks (Basic/Dates/Destination/Budget/People) — a new "Getting Around" section belongs alongside Destination, not bolted onto Budget just because both are per-trip settings.
_Novelty_: Not a novel mechanism, but establishes the right integration seam — every trip gets a sensible transit-mode default the moment it's created, even before any address exists.

**User Creative Strengths:** Spencer surfaced the hardest sub-problem (transit mode ambiguity) unprompted and reasoned through a layered override model largely independently — the facilitator's role was mostly extraction and grounding (checking real trip-edit-sheet structure) rather than idea injection.

**Energy Level:** Steady, thoughtful, willing to go deep on one thread (transit mode) rather than spreading thin — chose to move on once the thread reached a natural integration point (trip-edit sheet) rather than exhausting every Phase 1 angle.

### Phase 2: SCAMPER Method

**Interactive Focus:** Systematic pass over the app's real existing surfaces (Map tab placeholder, address pills, unused static-map route, mocked mini-map-rail) using Substitute/Combine/Adapt/Modify/Put-to-other-use/Eliminate/Reverse.

**[SCAMPER-S #1]**: Per-Day Route Strip (mocked)
_Concept_: A slim strip between the day-card header and event list, shown only when a day has 2+ located stops — mini route thumbnail, total distance/time, inferred transit mode, "Open map" button. Freeform days (no located stops) render unchanged, no empty-state clutter. Confirmed dead-code finding: none of `DocsRail`/`PackingRail`/`CollaboratorsRail`/`MiniMapRail` are actually rendered anywhere in `src/app` — the whole `RailPanel` sidebar concept was built but never wired in, so there's no existing sidebar layout to conform to.
_Novelty_: Splits "ambient daily glance" (this strip) from "deliberate full-trip map" (the Map tab) instead of one component trying to do both. Reuses the existing mini-map-rail visual language (dashed path + pins) at a fraction of the size instead of inventing a new visual.
_Mock_: Built and reviewed as an HTML concept mock using the app's real design tokens (light/dark) — Spencer's read: acceptable, not a strong reaction either way. Treat as a live option, not a confirmed direction.

**[SCAMPER-C #1]**: Pill-as-Map-Preview (open, undecided)
_Concept_: The existing address pill (already tapped to edit) could do double duty and also surface a map glance in the same tap, instead of a separate icon-button living next to it.
_Novelty_: Merges two touchpoints into one interaction. Left open — hard to judge without a real prototype to feel out; revisit later rather than decide in the abstract.

**[SCAMPER-A #1]**: Inline Transit-Mode Chip (with a real affordance)
_Concept_: The ambient "4.2 km · 20 min drive" text becomes a small tappable chip (icon + text, matching the existing action-chip visual language in `place-row-action-bar.tsx`) rather than plain text — tapping opens an inline mode picker (walk/drive/transit) for that one hop.
_Novelty_: Reuses an existing, already-legible interactive pattern (the pill) instead of inventing an invisible-affordance plain-text button. Confirmed as a hard requirement, not a nice-to-have: Spencer flagged that bare clickable text is a real discoverability problem.

**Rejected idea**: Auto-suggesting a location from an event's plain-text name alone (e.g. an event titled "Narita Airport" with no address ever added, silently geocoded in the background). Spencer rejected this — too much opportunity to guess wrong (ambiguous place names), and it cuts against the core "never force or silently assume location" principle from Phase 1.

**[SCAMPER-M #1]**: Route Thumbnail as an Icon, Not an Information Display
_Concept_: The tiny visual in the day strip (abstract SVG sketch or a real static-map tile) isn't meant to convey real detail at that size — it's a recognizable "there's a route here" affordance, and tapping it is what delivers actual detail via a bigger, interactive view.
_Novelty_: Resolves the legibility-at-tiny-size problem by changing the thumbnail's job from "read this" to "tap this."

**[SCAMPER-M #2]**: Map Tab with Day Selector as the Single Landing Target
_Concept_: One Map tab, filterable by day or "whole trip," deep-linkable via query param (matches the existing `?tab=map` convention) — this becomes the destination for both a deliberate tab click (whole trip) and a day-strip tap (pre-scoped to that day). Reversible: a selector lets the user pivot between days or back to whole-trip without leaving, unlike an auto-zoom-with-no-selector approach which would strand them scoped to one day.
_Novelty_: Unifies what looked like two features (day drill-in, trip overview) into one filtered view instead of parallel surfaces. Explicitly grows the Map tab's scope beyond the original "just plot every pin" MVP — flagged honestly as real scope growth, not a free add-on.

**[SCAMPER-M #3]**: Three-Phase Build Sequence (confirmed with Spencer)
_Concept_: **(1a)** Address popover — ships alone, zero new dependencies, reuses the existing unused static-map route as-is. **(1b)** Day-route strip, ambient and non-clickable (no Map tab to link to yet) — requires a shared point/distance-calculation piece (later reused by the Map tab's pins) plus the full transit-mode model from Phase 1 (inference, global pref, per-trip override, per-hop override, "Getting Around" trip-edit section). **(2)** The Map tab itself, interactive with the day selector (SCAMPER-M #2) — once it exists, 1b's thumbnail becomes clickable as a small follow-up wire-up, not new work.
_Novelty_: Surfaces that "transit-mode preferences" is a real standalone feature bundled inside what looked like a small UI addition (1b), and that it doesn't strictly require any map UI to be useful on its own (could show "~45 min" next to event times even before the strip exists).

**[SCAMPER-P #1]**: Schedule-Conflict Detection via Reused Distance Math
_Concept_: The same point/distance-calculation piece built for the day strip and Map tab pins doubles as a scheduling sanity-check — comparing the gap between consecutive event times against estimated travel time. Surfaced two-tier: (1) a day-header warning badge (conflict count for that day, reusing the header's existing badge slot) and (2) a standalone warning icon on each affected event row — deliberately not a pill-color change alone, and not a modal/toast, per Spencer's "can't miss it but not naggy" requirement.
_Novelty_: Repurposes map/location math for something that isn't a map feature at all — catching unrealistic schedules — solved via a two-tier aggregate+specific badge system rather than a single visual tweak or an interruption.

**[SCAMPER-E #1]**: Primary Action Flips on State, Not Just Style (supersedes original Phase 1 popover design)
_Concept_: Eliminates the static-preview popover from the original Phase 1 plan entirely. The address pill's tap target changes job based on state — empty: "add location" (unchanged); filled: primary tap deep-links straight to external maps (no in-app preview, no popover), editing demoted to a small secondary icon/action. Single big obvious touch target once an address exists.
_Novelty_: The *same* touch target's meaning changes with state rather than adding a new element beside it — matches the existing codebase convention of conditional UI based on field state (e.g. the Remove-button pattern in `reservation-field-dialog.tsx`). Confirmed with Spencer: simpler than the original plan, not an addition to it.

**User Creative Strengths:** Spencer drove nearly every SCAMPER letter to a concrete, buildable conclusion rather than stopping at raw ideas — caught a factual error (rail components are all dead code, not just mini-map-rail), pushed back on a weak idea (fuzzy location inference) before it was fully formed, and reversed the facilitator's own Phase 1 recommendation (E #1) once the fuller picture made the popover redundant.

**Energy Level:** High engagement throughout, consistently pulling toward "how would this actually manifest" over abstract ideation — comfortable rejecting ideas outright (fuzzy location) rather than softening or hedging.

### Phase 3: Role Playing

**Interactive Focus:** Stepping into specific travelers' shoes to stress-test the ideas from Phases 1–2 against lived moments, rather than continuing to generate in the abstract.

**[Role Playing #1]**: The Now Card's Unused Distance Placeholder is the Real Primary Surface
_Concept_: Playing "the day-of walker, phone in hand, standing outside stop 2" surfaced that the biggest friction isn't lack of a day-strip — it's that finding the next event already takes too many taps. Discovered: `now-card.tsx`'s "Next Event" row already has a hardcoded, unused placeholder (`{eventTimeLabel} · — · — km`) reserved for exactly this data and never wired up. Filling it with real distance/time-to-next-stop, and making that line the primary "open maps" tap target (per SCAMPER-E #1's state-flip rule), solves the walker's actual complaint directly from the home screen — no itinerary tab, no day strip required.
_Novelty_: Reframes the day-strip idea from "the" solution to a secondary/optional one — the Now Card, which already deep-links to the current/next event, is the real highest-leverage surface, and it already has the exact UI shape waiting for this data.

**User Creative Strengths:** Grounded the abstract "day-of walker" role-play in a real, specific complaint (too many taps to find the next address) rather than a generic wish list, which directly led to finding the second dead-placeholder in the codebase.

**[Role Playing #2 — refined]**: Absence-of-Data vs. Absence-of-Permission Are Different Cases
_Concept_: The "never show placeholders/hints" rule applies to missing *address data* the user chose not to enter (never nag). It does not apply to missing *browser geolocation permission* when addresses already exist — a compact, on-card "Enable location to see travel times" hint is legitimate there, since entering an address already signals intent to use it.
_Novelty_: Sharpens a blanket "no hints ever" into "no hints about things opted out of, yes hints about things blocking something opted into."

**[Role Playing #3]**: Live GPS-to-Next-Event for the Now Card, Static Event-to-Event for Planning Views
_Concept_: Split the distance data source by context — Now Card uses real-time device location → next event (geolocation permission, one-time ask, silent omission if denied and no addresses exist), while the day-strip/Map tab stay static event-to-event (no permission needed, works pre-trip too). Mapbox Directions API is the likely mechanism; cost/rate-limit validation flagged as a pre-commitment technical spike, not resolved in this session.
_Novelty_: Recognizes the Now Card is a *live* surface and the day-strip/Map tab are *planning* surfaces — they don't share a data-sourcing assumption just because they show similar-looking numbers.

**[Role Playing #4 — parked]**: Location-Optimized Accommodation Search
_Concept_: "Given these must-see places I've already jotted down, suggest/evaluate hotel options by how well they sit relative to all of them" — a recommendation-style feature, not a display feature.
_Novelty_: N/A — explicitly parked. Identified as meaningfully beyond current scope; good candidate for a future, separate brainstorming session.

**Overall Creative Journey:** Started from lived traveler needs (Phase 1), passed through the app's real existing surfaces including two previously-unknown dead-code discoveries (Phase 2 — the entire `RailPanel` family and the Now Card's hardcoded distance placeholder), then pressure-tested against three concrete personas (Phase 3), one of which (the neighborhood-comparison planner) cleanly identified an out-of-scope idea rather than being forced into the existing plan.

### Creative Facilitation Narrative

This session moved unusually fast from abstract to concrete because Spencer kept redirecting toward "how would this actually manifest" rather than settling for a list of feature names — first with the day-route-strip mock, then by asking pointed implementation questions (trip-edit sheet placement, mini-map-rail's actual usage) that the facilitator had to go verify in the codebase rather than assume. That verification habit paid off twice: it caught that the entire rail-panel family is dead code, and it surfaced the Now Card's unused distance placeholder — arguably the single most valuable discovery of the session, since it reframed the "day-of walker" navigation problem as a fix to something half-built rather than a new feature to design from scratch.

### Session Highlights

**User Creative Strengths:** Fast at spotting when an idea didn't hold up (fuzzy-location inference, rejected on the spot) and equally fast at recognizing when an idea was genuinely good but out of scope (the accommodation-search idea, parked rather than forced in). Consistently supplied the missing constraint the facilitator hadn't considered (no adaptive learning from overrides; absence-of-data vs. absence-of-permission).
**AI Facilitation Approach:** Verified claims against the real codebase at each turning point rather than reasoning in the abstract, which repeatedly changed the direction of the conversation (dead rail components, the Now Card placeholder, the real trip-edit-sheet structure).
**Breakthrough Moments:** The Now Card distance placeholder (Role Playing #1); the realization that the original Phase 1 "view on map" popover became unnecessary once the fuller system existed (SCAMPER-E #1).
**Energy Flow:** Sustained and specific throughout — no lulls, every technique transition was user-initiated ("move on," "k," "next persona") rather than facilitator-prompted.

## Idea Organization and Prioritization

**Thematic Organization:**

**Theme 1: The Now Card Is the Real Primary Surface**
_Focus: Live, in-the-moment navigation help, not planning-ahead display._
- Fill the Now Card's existing unused placeholder with real distance/time to the next event (Role Playing #1)
- Use live GPS → next event for this specific surface, distinct from static planning views (Role Playing #3)
- On-card, compact "enable location" hint — only when addresses exist and permission is missing (Role Playing #2 — refined)
- Pattern Insight: This theme emerged last (Phase 3) but tests as the highest-leverage, lowest-friction win — it fixes a complaint (too many taps) using a component and a data slot that already exist and already ship today.

**Theme 2: Ambient, Non-Nagging Awareness**
_Focus: Information that shows itself without being asked, and disappears cleanly when there's nothing to show._
- Per-day route strip: thumbnail + distance/time + transit mode, 2+ located stops only (SCAMPER-S #1, mocked)
- Route thumbnail as a tap-affordance icon, not an information display (SCAMPER-M #1)
- Schedule-conflict detection, two-tier badge (day-header + per-row icon), reusing the same distance math (SCAMPER-P #1)
- Absence renders as absence — no placeholders, no hints, for data the user chose not to enter (Role Playing #2)
- Pattern Insight: All of these depend on the same underlying "gather located stops, compute distance" logic — one shared calculation, several ambient surfaces.

**Theme 3: Transit Mode as a System, Not a Setting**
_Focus: How the app decides (and lets you override) walk/drive/transit._
- Infer default mode per-trip from trip context — rental car, transit pass, etc. (First Principles #1)
- Three-layer cascade: smart default → global preference → per-hop override, no cross-trip learning (First Principles #2)
- Preference modeled as default + one distance-threshold exception, not a flat toggle (First Principles #3)
- "Getting Around" as its own trip-edit section, global default seeding a per-trip override (First Principles #4)
- Inline tappable chip for the per-hop override, not invisible clickable text (SCAMPER-A #1)
- Pattern Insight: This is a real standalone feature — useful even before any map UI exists — bundled inside what looked like a small ambient-display detail.

**Theme 4: The Address Pill and the Map Tab**
_Focus: Deliberate, single-item and whole-trip map interactions._
- Address pill's primary action flips on state — add when empty, open-in-maps when filled, edit demoted to secondary (SCAMPER-E #1, supersedes the original static-preview-popover plan)
- Map tab with a day selector as the single landing target for both a deliberate click and a day-strip tap-through (SCAMPER-M #2)
- Pattern Insight: Both of these simplified rather than added scope over the course of the session — the popover idea was eliminated once the fuller system existed, and two planned separate map surfaces (day-drill-in, trip overview) collapsed into one filtered view.

**Additional Categories:**

- **Breakthrough Concepts:** The Now Card's unused distance placeholder (Role Playing #1) and the dead `RailPanel` family discovery (SCAMPER-S #1) — both reframed "build a map feature" as "finish something already half-built."
- **Rejected:** Auto-suggesting a location from an event's plain-text name (too much risk of guessing wrong; conflicts with the no-forced-location principle).
- **Parked for a future session:** Location-optimized accommodation search (Role Playing #4).
- **Confirmed build sequence:** 1a (address popover — now simplified to a direct deep-link per SCAMPER-E #1, no popover) → 1b (day strip + full transit-mode system, ambient/non-clickable) → 2 (Map tab with day selector, makes 1b's thumbnail clickable) — with the Now Card rework (Theme 1) identified afterward as arguably higher-priority than all three and not yet slotted into that sequence.

**Prioritization Results:**

- **Top Priority:** Theme 1, the Now Card rework — chosen for highest impact.
- **Likely Quick Win (proposed, not explicitly confirmed):** Theme 4's address-pill state-flip — no popover, no new dependency, simplifies existing behavior rather than adding to it.
- **Scope Risk to Watch:** Theme 3 (transit-mode system) is a full standalone feature bundled inside what looked like a small display detail — whether to cut/defer part of it for v1 was raised but left open.

**Action Planning:**

**Priority 1 — Now Card Rework**
_Why this matters:_ Directly answers the "too many clicks" complaint from the day-of-walker persona (Role Playing #1), and completes an already-shipped placeholder rather than building new UI from scratch.
_Next steps:_
1. Validate Mapbox Directions API fit (rate limits/cost for on-demand, one-lookup-per-view usage) — the one open technical unknown
2. Wire up browser geolocation (one-time permission ask, silent omission if denied and no addresses exist)
3. Replace the hardcoded `— · — km` in `now-card.tsx`'s event row with real GPS-to-next-event distance/time
4. Add the compact on-card "enable location" hint, shown only when the next event has an address and permission is missing
5. Make that line double as the primary "open in maps" tap target once distance is showing
_Resources needed:_ Mapbox Directions API access/budget confirmed; geolocation permission flow; a shared distance-calculation piece (reusable by Theme 2 below)
_Potential obstacles:_ Permission UX needs to feel like a one-time ask, not a gate. Directions API cost validated 2026-07-12 (mapbox.com/pricing): 100,000 requests/month free, then $2.00/1,000 (100k-500k/mo), $1.60/1,000 (500k-1M/mo), $1.20/1,000 (1M+/mo) — a light, cache-friendly usage pattern like one on-demand lookup per Now Card view is well inside the free tier for this app's likely volume. No published per-minute/per-second rate limit on the pricing page — check Mapbox's API reference docs for that before finalizing implementation, but cost is not a blocker.
_Success indicator:_ Standing at an event with the next stop's address saved, the Now Card shows real distance/time with no itinerary-tab detour, and tapping it opens navigation directly

**Backlog — Theme 2 (Ambient, Non-Nagging Awareness)**
_Next steps:_ Build the shared point/distance-calculation piece (reused by Theme 1 and the Map tab); implement the per-day route strip (mocked design already exists) gated on 2+ located stops; add the two-tier schedule-conflict badge (day-header count + per-row icon) once the strip ships, since both consume the same calculation.
_Depends on:_ Theme 3's transit-mode default (for the strip's mode label) — sequence after Theme 3 or ship the strip with a placeholder mode-agnostic distance-only display first.

**Backlog — Theme 3 (Transit Mode as a System)**
_Next steps:_ Ship the "Getting Around" trip-edit section (global default + per-trip override) first, independent of any map UI — it's useful on its own. Layer in per-hop override and the inline tappable-chip affordance once Theme 2's strip exists to host it.
_Open question carried forward:_ whether to cut per-hop override or the distance-threshold-exception preference from a v1 scope, given the system turned out larger than expected.

**Backlog — Theme 4 (Address Pill and Map Tab)**
_Next steps:_ Ship the address-pill state-flip alone first (no dependencies, simplifies existing behavior). Follow with the Map tab + day selector (bigger scope, deep-linkable via the existing `?tab=map` convention) once Theme 2/3 exist to feed it real pins and modes.
_Note:_ This was the original entry point into the whole session (an unused Map tab) and ends up last in build order — everything else turned out to be higher-leverage or a dependency of it.

**Recommended overall build order:** Theme 1 (Now Card) → Theme 3's "Getting Around" section (independent, low-dependency) → Theme 2 (shared distance calc, day strip, conflict badges) → Theme 4's pill state-flip (can actually ship any time, no dependencies) → Theme 4's Map tab + day selector (last, consumes everything above).

## Session Summary and Insights

**Key Achievements:**

- 16 ideas generated across First Principles Thinking, SCAMPER, and Role Playing
- 4 themes identified, each with a next-steps backlog entry — nothing generated in this session was left undocumented
- One idea mocked as a real HTML concept (day-route strip) and reviewed against the app's actual design tokens
- Two dead-code discoveries (the `RailPanel` family, the Now Card's distance placeholder) that turned two different "build a new feature" instincts into "finish something half-built"
- A clear, dependency-ordered build sequence spanning all 4 themes, not just the top priority

**Session Reflections:**

The session's throughline was a repeated pattern: propose an idea, get asked "how would this actually manifest," go verify against the real codebase, and often find the answer was smaller or different than expected (the transit-mode system turned out bigger than it looked; the original Phase 1 popover turned out unnecessary; the Map tab — the original trigger for this whole session — turned out to be the last and lowest-priority piece once everything else was accounted for). The session's one clean rejection (auto-guessing a location from event text) and one clean scope-out (accommodation search by location) were both decided quickly and confidently rather than lingering, which kept momentum high throughout.
