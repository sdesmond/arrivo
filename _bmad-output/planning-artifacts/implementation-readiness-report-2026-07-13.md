---
stepsCompleted: ['document-discovery', 'prd-analysis', 'epic-coverage-validation', 'ux-alignment', 'epic-quality-review', 'final-assessment']
status: complete
---

# Implementation Readiness Assessment Report

**Date:** 2026-07-13
**Project:** packt

## Document Discovery

**Re-run following PRD/UX/epics reconciliation** (previous assessment dated 2026-07-13 flagged three findings; this re-run verifies they're resolved).

### PRD

**Sharded:**
- Folder: `_bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/`
  - `prd.md` (updated 2026-07-13 — amended §4.3/FR-6/FR-8/§6.2/§12/§13.2)
  - `addendum.md`
  - `.decision-log.md` (2026-07-13 entry added: ratified architecture's Transit Mode scope amendment)
  - `review-rubric.md`

### Architecture

**Whole Document:**
- `_bmad-output/planning-artifacts/architecture.md` (unchanged since prior assessment)

### Epics & Stories

**Whole Document:**
- `_bmad-output/planning-artifacts/epics.md` (updated 2026-07-13 — route_cache/resolver AC added to Story 1.1, discrepancy warning reconciled, UX-DR8/DR9 reconciled)

### UX Design

**Sharded:**
- Folder: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/`
  - `DESIGN.md` (updated 2026-07-13 — 3-segment Getting Around control, new transit-preference-fields token)
  - `EXPERIENCE.md` (updated 2026-07-13 — 3-segment control, new profile preferences surface, corrected Day Route Strip deep-link timing)
  - `.decision-log.md` (2026-07-13 reconciliation entry)
  - `review-accessibility.md`, `review-rubric.md`
  - `mockups/` — address-pill.html, day-route-strip.html (annotated), getting-around.html (updated, smart segment removed), map-tab.html, now-card-next-event.html

## Issues Found

- No duplicates found.
- All four required document types present and unambiguous.

## Documents Selected for Assessment

- PRD: `_bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/prd.md` (+ addendum.md)
- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- Epics: `_bmad-output/planning-artifacts/epics.md`
- UX: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/DESIGN.md` + `EXPERIENCE.md`

## PRD Analysis

### Functional Requirements

FR-1: Show live distance/time for Next Event — distance/time from device location to Next Event when Located and geolocation granted. Realizes UJ-1. Consequences: non-placeholder distance/time when available; no placeholder/hint when Freeform; never blocks Now Card/trip content when location unavailable.

FR-2: Prompt for geolocation only when location data exists — compact enable-location hint when Next Event is Located and permission missing/denied. Realizes UJ-1. Consequences: hint only for Located Items; never for Freeform; denial leaves Now Card usable, no repeated blocking prompts. [ASSUMPTION: user-initiated hint, not auto-prompt on load.]

FR-3: Open External Maps from the Distance/Time Line — tap opens External Maps for the Next Event. Realizes UJ-1. Consequences: tap target meets sizing requirements; maps URL includes Address/Coordinates; map-opening affordance stays visible even if directions calc fails. [ASSUMPTION: External Maps available even when directions calc fails.]

FR-4: Preserve Freeform Items as first-class — no missing-location warnings for Freeform Items. Realizes UJ-2. Consequences: no placeholders/route warnings/nudges outside existing edit affordances; remain visible in itinerary; route/map features omit them without altering saved data.

FR-5: Reject silent location inference from item text — no auto-geocoding of titles. Realizes UJ-2. Consequences: "Narita Airport" titled event with no Address stays Freeform; no Coordinates added from title text at save/view/route/map; future suggestion flows require explicit confirmation.

FR-6: Provide a Trip Transit Default — trip-edit "Getting Around" section. Realizes UJ-3, UJ-4. Consequences: distinct "Getting Around" section; supports walk, drive, transit (no "smart" — dropped per architecture amendment, updated 2026-07-13) [ASSUMPTION: bike/rideshare/ferry/mixed-mode out of MVP]; existing trips get a safe default without forced action.

FR-7: Seed trip mode with a safe default — deterministic seed when no explicit choice. Realizes UJ-3. Consequences: new trips get deterministic default; existing trips show a valid default without forcing edit flow; smart inference optional, falls back to deterministic default.

FR-8: Ship an account-level Transit Mode default and walk-distance exception (**updated 2026-07-13**, was "Preserve room for advanced Transit Mode preferences") — global Transit Mode default + optional walk-distance threshold on profile, alongside currency/distanceUnit. Realizes UJ-3. **[AMENDED 2026-07-13: pulled into MVP from post-MVP "preserve room" scope; reuses currency-preference seed pattern.]** Consequences: global preferences editable from profile; new trips seed from global preference when unset; hops shorter than threshold resolve to walk, overriding trip default; estimates identify Transit Mode used per hop; no hidden adaptive learning; Per-Hop Override (FR-9) is the only remaining post-MVP layer.

FR-9: Support Per-Hop Override as post-MVP extension — per-hop Transit Mode override, post-MVP unless PM pulls forward. Realizes UJ-3. Consequences: if included, affects only that hop, surfaced via clear chip; if deferred, MVP estimates still work from Trip Transit Default.

FR-10: Show Day Route Strip for located days — shown for days with ≥2 Located Items. Realizes UJ-3. Consequences: <2 Located Items → no strip; summary uses Located Items only; no empty-state clutter for Freeform-only days.

FR-11: Use route thumbnail as affordance — indicates map availability, not detailed geography. Realizes UJ-3, UJ-4. Consequences: legible at compact size; detailed inspection happens in Map Tab; can be non-clickable/hidden before Map Tab launch. [ASSUMPTION: Day Route Strip may ship before Map Tab.]

FR-12: Detect schedule conflicts — compare available time vs. estimated travel time. Realizes UJ-3. Consequences: conflict shown on affected day + event row when travel time exceeds gap; day-level warning summarizes count without modal/toast; row-level warning identifies specific item; Freeform Items never trigger route-based conflicts.

FR-13: Make filled Address primary action open maps — filled Address opens External Maps as primary action. Realizes UJ-1. Consequences: empty Address invites add/edit as today; filled Address opens External Maps as primary action; edit via secondary affordance; no static map preview popover required for MVP.

FR-14: Show whole-trip map — Map Tab shows all Located Items by default. Realizes UJ-4. Consequences: renders Located Items from Events/Reservations; Freeform Items omitted without warning; zero-Located-Items trip shows unobtrusive empty state, no add-location prompt. [ASSUMPTION: neutral empty state acceptable inside deliberate Map Tab.]

FR-15: Filter Map Tab by day — switch between whole-trip and day scope. Realizes UJ-4. Consequences: selector includes whole-trip + each day; switching updates pins/route context; query params support deep-linking. [ASSUMPTION: existing `?tab=map` convention preferred.]

FR-16: Deep-link from Day Route Strip to Map Tab — opens Map Tab pre-scoped to a day once Map Tab exists. Realizes UJ-3, UJ-4. Consequences: Day Route Strip opens Map Tab for matching day; selector allows return to whole-trip scope; linkage not required before Map Tab launch.

Total FRs: 16

### Non-Functional Requirements

NFR-1 (Accessibility): All map, mode, Address, warning, and navigation controls must meet existing Packt interactive target sizing and keyboard/focus requirements.

NFR-2 (Privacy): Packt must request browser geolocation only for user-visible value and must not store live device location unless a later PRD explicitly requires it. [ASSUMPTION: MVP uses live location transiently for distance/time calculation.]

NFR-3 (Performance): Now Card location/directions lookup must not block initial page rendering; architecture must define an explicit latency target before implementation. Planning views must avoid repeated route calculations on every render.

NFR-4 (Reliability): Failure to calculate distance, travel time, map tiles, or route data must degrade to existing itinerary behavior plus direct map access when Coordinates exist.

NFR-5 (Cost): Directions and map usage must be bounded through on-demand lookup, caching where appropriate, and explicit spike validation before implementation commitment; architecture must define a monthly request budget or equivalent guardrail.

NFR-6 (Security): All server actions and route handlers introduced for map or directions data must preserve existing Packt authentication and trip-access rules.

Total NFRs: 6

### Additional Requirements

**Product Guardrails (§6.1):** Location remains optional. Freeform Items remain valid and uncluttered. No silent geocoding from title text. No nagging for missing Address data. No static map preview popover in MVP.

**Technical Guardrails (§6.2):** Source of truth for domain types remains `src/data/types.ts`. Existing Mapbox autocomplete Coordinates should be reused where present. Direction provider, rate limits, and cost require a technical spike before implementation is committed (Mapbox Directions API likely, revalidate pricing during architecture). Interactive Map Tab likely requires an interactive map dependency, deferred to architecture. **[Added 2026-07-13]** The account-level Transit Mode default and walk-distance exception (FR-8) mirror the existing `currency`/`distanceUnit` global-preference pattern.

**Non-Goals (§8):** No requirement that every Event/Reservation have a location; no title-based Coordinate inference; no accommodation search/hotel optimization; no in-app turn-by-turn navigation; no adaptive learning from Per-Hop Overrides; no static map preview popover for MVP; map features must not be the only way to understand the itinerary.

**MVP Scope In (§9.1):** Now Card live distance/time; geolocation hint gated on Located Items; one-tap External Maps from Now Card; optional-location behavior everywhere; Address pill state-flip; Trip Transit Default + Getting Around section; Day Route Strip (2+ Located Items); Schedule Conflict detection; Map Tab with whole-trip/day selector.

**MVP Scope Out (§9.2):** Accommodation search by location; silent title-based geocoding; adaptive learning from overrides; in-app navigation; bike/ferry/ride-share/mixed-mode routing; public sharing or collaborative map editing.

**Recommended Build Order (§10):** 1) Now Card distance/time + External Maps action, 2) Address pill state-flip, 3) Trip Transit Default + Getting Around section, 4) Shared route/distance calculation, 5) Day Route Strip + Schedule Conflict indicators, 6) Map Tab with day selector, 7) Day Route Strip deep-link to Map Tab.

**Open Architecture-Owned Questions (§13.1):** (1) Should Now Card open External Maps even when travel time is unavailable but Coordinates exist? (2) What data should be cached for distance/time estimates, and for how long? (3) Which provider/dependency powers Map Tab interaction? (4) Minimum viable Schedule Conflict threshold — strict travel time exceeds gap, or travel time plus buffer? (5) Launch latency target and monthly request budget for directions usage? — all 5 were resolved by architecture.md in the prior assessment; re-verified below.

**Post-MVP Product Questions (§13.2, amended 2026-07-13):** Only Per-Hop Override (numbered "6." in the current list, referenced as "Q8" in the resolved-decision line immediately below it — a minor internal numbering inconsistency introduced by the 2026-07-13 amendment, see Findings) remains open; account-level default and walk-distance exception questions are resolved into MVP scope.

**Success Metrics (§11):** SM-1 through SM-5 (primary/secondary) and SM-C1 through SM-C3 (counter-metrics) tie back to FR-1, FR-3, FR-4, FR-5, FR-12, FR-13, FR-14, FR-15.

**Addendum Technical Notes:** Addresses already capture lat/long via Mapbox autocomplete on events/reservations; current display is plain text only; Map tab exists as a placeholder; a Mapbox static-image proxy route exists but is unused; no interactive map library is installed yet; `now-card.tsx` has a hardcoded unused distance placeholder; `RailPanel` family is dead code, not a layout constraint.

**Rejected Ideas (Addendum):** Silent location inference from title text; static map preview popover for Address pill; adaptive learning from Per-Hop Overrides.

**Parked Ideas (Addendum):** Location-optimized accommodation search; advanced routing modes beyond walk/drive/transit; in-app turn-by-turn navigation.

### PRD Completeness Assessment

The PRD's 2026-07-13 amendment (FR-6, FR-8, §4.3, §6.2, §12, §13.2) is internally consistent and testable: FR-8 was rewritten from a "preserve room" placeholder into a fully specified, testable requirement with its own consequences, not just a scope-flag change. The glossary (§3) already defined Transit Mode as walk/drive/transit only — it was never touched by the amendment and was already consistent with the new FR-6/FR-8 text, confirming the amendment didn't introduce a new internal contradiction. One cosmetic issue found: §13.2's remaining open question is numbered "6." in the list but referenced as "(Q8)" in the adjacent resolved-decision sentence — leftover from renumbering when Q6/Q7 were removed as resolved. Low severity, easy fix, flagged in Findings below. Otherwise the PRD is complete and ready for epic coverage re-validation.

## Epic Coverage Validation

### Epic FR Coverage Extracted

`epics.md`'s "FR Coverage Map" (lines 126–143) plus its "Requirements Inventory" restate all 16 FRs and 6 NFRs with architecture-resolved detail, unchanged in structure from the prior assessment:

FR-1: Epic 2 (Story 2.1) — FR-2: Epic 2 (Story 2.3) — FR-3: Epic 2 (Story 2.2) — FR-4: Epic 2 (Story 2.1 AC, reinforced Epics 3–5) — FR-5: Epic 2 (Story 2.1 AC) — FR-6: Epic 1 (Story 1.3), 3 modes — FR-7: Epic 1 (Story 1.2) — FR-8: Epic 1 (Story 1.1), account-level default + walk-threshold, **now with an explicit route_cache/resolver-creation AC (2026-07-13 fix)** — FR-9: Epic 1 (documented, deferred) — FR-10: Epic 4 (Story 4.1) — FR-11: Epic 4 (Story 4.1) — FR-12: Epic 4 (Story 4.2) — FR-13: Epic 3 (Story 3.1) — FR-14: Epic 5 (Story 5.1) — FR-15: Epic 5 (Story 5.2) — FR-16: Epic 5 (Story 5.3).

Total FRs in epics: 16

### FR Coverage Analysis

| FR Number | PRD Requirement (short) | Epic Coverage | Status |
| --- | --- | --- | --- |
| FR-1 | Live distance/time for Next Event | Epic 2, Story 2.1 | ✓ Covered |
| FR-2 | Geolocation hint gated on Located Item | Epic 2, Story 2.3 | ✓ Covered |
| FR-3 | Open External Maps from Distance/Time Line | Epic 2, Story 2.2 | ✓ Covered |
| FR-4 | Freeform Items stay first-class | Epic 2, Story 2.1 AC (+ reinforced Epics 3–5) | ✓ Covered |
| FR-5 | Reject silent location inference from title text | Epic 2, Story 2.1 AC | ✓ Covered |
| FR-6 | Trip Transit Default in Getting Around section (3 modes) | Epic 1, Story 1.3 | ✓ Covered — scope now matches PRD verbatim (no longer an amendment note, PRD itself says 3 modes) |
| FR-7 | Seed trip mode with safe default | Epic 1, Story 1.2 | ✓ Covered |
| FR-8 | Account-level default + walk-distance exception, ships in MVP | Epic 1, Story 1.1 | ✓ Covered — scope now matches PRD verbatim; **story-ownership gap from prior assessment closed**: Story 1.1 AC now explicitly scopes creation of `route_cache` + pure `resolveEffectiveMode` resolver, decoupled from Story 2.1's Directions-API responsibilities |
| FR-9 | Per-Hop Override, post-MVP | Epic 1 (documented, correctly not built) | ✓ Covered |
| FR-10 | Day Route Strip for located days | Epic 4, Story 4.1 | ✓ Covered |
| FR-11 | Route thumbnail as affordance | Epic 4, Story 4.1 | ✓ Covered — deep-link timing language now correctly phased (non-clickable until Epic 5) |
| FR-12 | Detect schedule conflicts | Epic 4, Story 4.2 | ✓ Covered |
| FR-13 | Filled Address opens maps as primary action | Epic 3, Story 3.1 | ✓ Covered |
| FR-14 | Show whole-trip map | Epic 5, Story 5.1 | ✓ Covered |
| FR-15 | Filter Map Tab by day | Epic 5, Story 5.2 | ✓ Covered |
| FR-16 | Deep-link from Day Route Strip to Map Tab | Epic 5, Story 5.3 | ✓ Covered |

**NFR coverage:** all 6 PRD NFRs reappear in the epics document's Requirements Inventory with architecture-resolved specifics, unchanged from the prior assessment — still no open architecture question remains unresolved.

### Missing Requirements

None. All 16 FRs and all 6 NFRs from the PRD have explicit, traceable coverage in the epics document. No FRs appear in the epics document that aren't traceable back to the PRD.

### Resolved Since Prior Assessment

- **PRD/architecture/epics scope agreement (was Critical Issue #1):** PRD §4.3/FR-6/FR-8 now state the architecture-amended scope directly — no more "epics follows architecture, PRD still says something else." `epics.md`'s FR-6/FR-8 restatements (lines 36, 40) still carry `[AMENDED per architecture.md]` annotations describing the amendment's history, which is accurate as an audit trail but could now read as if a live discrepancy still exists — flagged as a Low finding below (cosmetic only, not a coverage or scope conflict, since the actual mode/scope values in both documents already match).
- **route_cache/resolver story ownership (was Major finding):** Story 1.1 now has an explicit AC. See FR-8 row above.

### Coverage Statistics

- Total PRD FRs: 16
- FRs covered in epics: 16
- Coverage percentage: 100%
- Total PRD NFRs: 6
- NFRs covered in epics: 6
- NFR coverage percentage: 100%

## UX Alignment Assessment

### UX Document Status

**Found.** Sharded UX package at `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/`: `DESIGN.md` + `EXPERIENCE.md`, both `updated: 2026-07-13`, `status: final`. Same package as the prior assessment, now carrying a 2026-07-13 reconciliation pass.

### UX ↔ PRD Alignment

Strong, and the prior assessment's core finding (UX matched the PRD-as-written but not architecture's amendment) no longer applies, because the PRD itself was amended to match architecture. IA table, Component Patterns, and Key Flows still mirror PRD UJ-1–UJ-4 and cite governing FRs throughout, unchanged in structure from the prior pass.

### UX ↔ Architecture Alignment — Prior Issues Re-Checked

**Issue 1 — Getting Around segment count (was flagged discrepancy): RESOLVED.** `DESIGN.md`'s `getting-around-segmented-control` token now specs 3 segments (walk/drive/transit); `EXPERIENCE.md`'s IA row and Component Patterns row match. `mockups/getting-around.html` updated to remove the "Smart" segment. PRD, architecture, epics, and UX all agree on 3 modes.

**Issue 2 — Walk-threshold preference input (was: zero design coverage): RESOLVED, with one residual gap.** `DESIGN.md` gained a new `transit-preference-fields` token (global default reusing the Getting Around control + a preset-distance `Select` for the walk threshold, explicitly modeled on the existing Budget Warning %/Danger % `Select` pattern in `preferences-section.tsx` — grounded in real code, not invented from nothing). `EXPERIENCE.md` gained a matching IA row, Component Patterns row, and two State Patterns rows (threshold off/set). **Residual gap:** no key-screen mock exists for this surface yet (both spines and epics.md's UX-DR9 note this explicitly). This is lower-risk than the original finding — the spec is complete enough to implement by direct analogy to `preferences-section.tsx`'s existing Select-based fields — but it's worth a call: render a mock before Story 1.1, or accept spec-only and implement directly.

**Issue 3 — Day Route Strip → Map Tab deep-link timing (was: assumed single-pass delivery): RESOLVED.** `EXPERIENCE.md`'s Component Patterns row, Interaction Primitives bullet, two new State Patterns rows (pre/post Map Tab), and Flow 4's resolution beat all now describe the phased rollout matching `epics.md` (Epic 4 ships the thumbnail non-clickable/hidden; Epic 5 makes it a live deep-link). `mockups/day-route-strip.html` annotated to clarify it depicts the post-Map-Tab-launch state. `DESIGN.md`'s `day-route-strip` token still describes the thumbnail as unconditionally "clickable" — this is consistent with DESIGN.md's stated scope (visual spec only; behavioral timing is EXPERIENCE.md's job per the two spines' own division of labor), not a contradiction, but flagged as a Low finding below since a reader skimming DESIGN.md alone could miss the phasing.

**Not re-checked (unchanged from prior assessment, still clean):** MapLibre GL JS, Mapbox Directions API, `route_cache` TTL/cadence, and the 10-minute Schedule Conflict buffer remain compatible with DESIGN.md/EXPERIENCE.md.

### Warnings

- `architecture.md`'s own "Flagged UX/PRD follow-up" note (Data Model: Transit Mode Preference section) still describes Issues 1–2 as open — it predates this reconciliation pass and was not updated. No scope conflict (the target state it describes is exactly what UX now implements), but worth a cleanup pass so a reader of `architecture.md` alone doesn't see a stale "not yet resolved" flag. Low severity, documentation hygiene only.

## Epic Quality Review

Re-validated all 5 epics / 12 stories. Structure, independence, and forward-dependency checks are unchanged from the prior assessment (still zero violations) — this pass focuses on whether the two prior fixes hold up under the same rigor, plus a fresh Database/Entity Creation Timing check on the route_cache placement specifically.

### Epic Structure Validation

Unchanged from prior assessment: all 5 epic titles/goals remain user-centric, no technical-milestone epics, all cross-epic dependencies point backward only (Epic 2 ← Epic 1, Epic 4 ← Epic 1 + Epic 2, Epic 5 Story 5.3 ← Epic 4 Story 4.1's already-shipped non-clickable thumbnail). ✅ No violations.

### Story Quality Assessment — Story 1.1 Re-Reviewed

**Acceptance criteria quality:** Story 1.1's first AC now bundles three deliverables under one Given/When/Then (users columns, `route_cache` table, `resolveEffectiveMode` function) — each is independently testable (column existence, table existence, function export/behavior), so this isn't a vagueness violation, just a denser foundational AC. The AC text explicitly states the ownership boundary ("this AC scopes only the `route_cache` table and this pure per-hop resolver; Directions API calls, `route_cache` reads/writes, and the `RouteResult` union are Story 2.1's responsibility") — an implementer picking up Story 1.1 now has unambiguous scope, and Story 2.1's AC (line 279, "served from `route_cache` instead of a new Directions API call") correctly assumes the table already exists as a backward dependency on Story 1.1. ✅ Resolved cleanly.

**Database/Entity Creation Timing — route_cache placement specifically re-checked:** Creating `route_cache` in Story 1.1 even though its first *read/write* consumer is Story 2.1 could look like premature table creation under the general "tables created only when first needed" rule. On inspection this is not a violation: `epics.md`'s pre-existing "Schema-first sequencing" note (Additional Requirements, present before this fix) already groups `route_cache` with `users.transitMode`/`users.walkThresholdMeters`/`trips.transitMode` as one deliberate single-migration deliverable that "must land before Now Card work, regardless of the PRD's UI-facing build order" — a documented architectural decision to land this feature's entire schema in one migration rather than stagger it story-by-story. The check this rule guards against is unrelated-future-epic tables created speculatively; grouping one feature's own schema into its first foundational story is the sanctioned pattern (same as Epic 1 already creating `trips.transitMode` ahead of Epic 1 Story 1.3's own usage of it). ✅ No violation — confirmed intentional, not accidental.

### Dependency Analysis Findings

**Prior 🟠 Major finding — unowned `route_cache`/resolver dependency: CLOSED.** See Story 1.1 re-review above. No remaining unowned cross-cutting dependency found in this pass.

No new dependency violations found.

### Quality Assessment Documentation

#### 🔴 Critical Violations

None found (unchanged).

#### 🟠 Major Issues

None remaining. The one Major issue from the prior assessment (`route_cache`/resolver story ownership) is closed.

#### 🟡 Minor Concerns

1. **Story 2.1 AC density** — unchanged from prior assessment, still not a structural violation, still worth a sizing gut-check at sprint estimation.
2. **Story 1.1's profile-page AC now has a spec to build against** (downgraded from the prior assessment's Minor Concern #2, "no finalized visual spec") — DESIGN.md/EXPERIENCE.md now define the component pattern and tokens; only a key-screen mock is still missing (see UX Alignment Warnings above). Downgraded from "no spec" to "spec without mock" — implementable without further design work if the team accepts spec-only for this one surface.
3. **Epic 4 Story 4.1's AC names Epic 5** — unchanged from prior assessment, confirmed sanctioned backward-safe pattern, no action needed.
4. **New, Low:** `architecture.md`'s stale "not yet resolved" follow-up note (see UX Alignment Warnings) and the PRD §13.2 numbering/reference mismatch ("6." vs "(Q8)", see PRD Completeness Assessment) are both cosmetic documentation-hygiene items, not scope or coverage defects.

### Best Practices Compliance Checklist

| Epic | User value | Independent | Stories sized | No forward deps | Tables created when needed | Clear AC | FR traceability |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 — Transit Mode & Getting Around | ✅ | ✅ | ✅ | ✅ | ✅ (route_cache ownership gap closed) | ✅ | ✅ |
| 2 — Now Card Distance & Navigation | ✅ | ✅ | ⚠️ (AC-dense, Story 2.1, unchanged) | ✅ | ✅ | ✅ | ✅ |
| 3 — Address Pill Direct Navigation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 4 — Day Route Strip & Schedule Conflict | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 5 — Map Tab | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Summary and Recommendations

### Overall Readiness Status

**READY**

All three items flagged in the 2026-07-13 assessment are closed:

1. The three-way Getting Around scope disagreement (PRD said 4 modes/trip-level-only, architecture+epics said 3 modes/MVP-shipped account default) is resolved — PM ratified architecture's amendment, and PRD, DESIGN.md, EXPERIENCE.md, architecture.md, and epics.md now all agree: 3 modes, account-level default + walk-distance exception ship in MVP.
2. The walk-threshold preference input (`users.walkThresholdMeters`) now has a full behavioral and component spec in DESIGN.md/EXPERIENCE.md, modeled directly on the existing Budget preset-`Select` pattern in `preferences-section.tsx`.
3. Story 1.1 now explicitly owns creation of the `route_cache` table and the pure `resolveEffectiveMode` resolver, decoupled from Story 2.1's Directions-API responsibilities — the prior Major dependency-ownership gap is closed.

FR/NFR coverage remains 100% (16/16 FRs, 6/6 NFRs), and epic/story structure still passes every independence and forward-dependency check with zero critical or major violations.

### Remaining Items (Low severity, non-blocking) — all closed same-day

None of the following blocked Story 1.1 implementation; all three were cleaned up immediately after this assessment:

1. ~~No key-screen mock for the new profile Transit preferences surface.~~ **Closed:** `mockups/profile-transit-preferences.html` rendered (threshold off / threshold set states), linked from DESIGN.md and EXPERIENCE.md.
2. ~~`architecture.md`'s "Flagged UX/PRD follow-up" note is stale.~~ **Closed:** both the scope-amendment callout and the follow-up note in `architecture.md`'s Data Model section marked `[RATIFIED 2026-07-13]` / `[RESOLVED 2026-07-13]`.
3. ~~PRD §13.2 numbering/reference mismatch.~~ **Closed:** renumbered to "8." to match the "(Q8)" reference in the adjacent resolved-decision sentence.

### Recommended Next Steps

1. Proceed to Story 1.1 implementation. All findings from this assessment, including the three Low-severity items above, are closed.

### Final Note

This re-run assessment closed all 3 critical/major findings from the 2026-07-13 initial assessment (Getting Around scope disagreement, missing walk-threshold UX design, unowned route_cache/resolver dependency), surfaced 3 new Low-severity, non-blocking documentation-hygiene items along the way, and those three were closed the same day. Zero FR/NFR coverage gaps, zero critical or major epic-structure violations, and zero open findings of any severity remain. Implementation is clear to proceed.

---

**Assessed by:** BMad Implementation Readiness Workflow (re-run)
**Date:** 2026-07-13
