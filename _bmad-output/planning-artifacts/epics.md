---
stepsCompleted: [1, 2, 3, 4]
status: complete
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/prd.md
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/addendum.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md
---

# packt - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for packt, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

Scope: Location-Aware Itinerary feature (PRD `prd-packt-2026-07-12`) — Now Card distance/navigation, optional-location behavior, Transit Mode defaults, Day Route Strip + Schedule Conflict detection, Address pill state-flip, and a Map Tab with day selector.

**✅ Reconciled 2026-07-13 (was flagged discrepancy):** `architecture.md` recorded a scope amendment reversing a PRD-finalized decision — pulling account-level Transit Mode preference and the distance-threshold "walk if close" exception into MVP, dropping the "smart" mode option (walk/drive/transit only). PM ratified the amendment; `prd.md` §4.3/§6.2/§12/§13.2 and the UX package's `DESIGN.md`/`EXPERIENCE.md` (+ `mockups/getting-around.html`, `mockups/day-route-strip.html`) are now updated to match this document's scope. PRD, architecture, UX, and epics all agree: 3 modes, account-level default + walk-threshold shipped in MVP. See each document's `.decision-log.md` for the 2026-07-13 entries.

## Requirements Inventory

### Functional Requirements

FR-1: Show live distance/time for Next Event — authenticated users see distance and estimated travel time from current device location to the Next Event when it is a Located Item and geolocation permission is granted.

FR-2: Prompt for geolocation only when location data exists — a compact enable-location hint appears on the Now Card only when the Next Event is a Located Item and geolocation permission is missing/denied; never for Freeform Items.

FR-3: Open External Maps from the Distance/Time Line — tapping the Now Card's distance/time pill opens External Maps for the Next Event; the affordance remains even if travel time can't be calculated, as long as Coordinates exist.

FR-4: Preserve Freeform Items as first-class — Events/Reservations without Coordinates never show missing-location warnings, placeholders, or nudges, and remain fully visible/editable as today.

FR-5: Reject silent location inference from item text — Packt must never auto-geocode a title into Coordinates; Coordinates are only set through explicit user action (existing Mapbox autocomplete selection).

FR-6: Provide a Trip Transit Default — a trip-edit "Getting Around" section lets users set the Trip Transit Default. **[AMENDED per architecture.md]** Mode set is walk/drive/transit only — "smart" is dropped, not a no-op placeholder.

FR-7: Seed trip mode with a safe default — new trips get a deterministic Transit Mode default (`input.transitMode ?? user.transitMode ?? "drive"`); existing trips display a valid default without forcing an edit flow.

FR-8: Preserve room for advanced Transit Mode preferences. **[AMENDED per architecture.md]** — Rather than merely "leaving room," MVP ships the account-level global default (`users.transitMode`) and the distance-threshold walk exception (`users.walkThresholdMeters`) now. Travel estimates identify which Transit Mode was used; no hidden adaptive learning is introduced from overrides.

FR-9: Support Per-Hop Override as post-MVP extension — remains deferred unless PM explicitly pulls it forward; MVP estimates work from the trip/account-resolved Transit Mode without it.

FR-10: Show Day Route Strip for located days — a Day Route Strip appears on a trip day with two or more Located Items, summarizing route distance/time/mode using Located Items only; days with fewer than two render no strip.

FR-11: Use route thumbnail as affordance — Day Route Strip includes a route thumbnail that signals map availability (not detailed geography); can remain non-clickable/hidden before Map Tab exists.

FR-12: Detect schedule conflicts — Packt compares estimated travel time between adjacent timed Located Items against the scheduled gap and flags a Schedule Conflict. **[Resolved by architecture.md]** Buffer model: flag when `travel_time + 10 minutes > scheduled_gap` (fixed 10-minute buffer, uniform across transit modes). Day-level warning summarizes count (non-modal); row-level warning identifies the specific item; Freeform Items never trigger conflicts.

FR-13: Make filled Address primary action open maps — a filled Address surface's primary action opens External Maps; edit moves to a secondary affordance. Empty Address surfaces are unchanged. No static map preview popover.

FR-14: Show whole-trip map — Map Tab renders all Located Items (Events + Reservations) for a trip by default; Freeform Items are omitted from pins without warning; a trip with zero Located Items shows a neutral empty state.

FR-15: Filter Map Tab by day — a day selector switches Map Tab scope between whole-trip and individual days, updating visible pins/route context; deep-linkable via the existing `?tab=map` query-param convention.

FR-16: Deep-link from Day Route Strip to Map Tab — tapping the Day Route Strip thumbnail opens Map Tab pre-scoped to that day, once Map Tab exists; the day selector always allows returning to whole-trip scope.

### NonFunctional Requirements

NFR-1 (Accessibility): All map, mode, Address, warning, and navigation controls meet Packt's existing 44×44px interactive-sizing rule on both axes and existing keyboard/focus requirements. WCAG 2.2 AA floor. Schedule Conflict indicators always pair icon + text (never color alone). Live-updating content follows defined `aria-live` behavior: passive distance/time ticking is never wrapped in an assertive/polite live region; Schedule Conflict badge appearance/disappearance triggered by an in-page edit (time, order, transit-mode change) is wrapped in `aria-live="polite"`.

NFR-2 (Privacy): Browser geolocation is requested only for user-visible value and used transiently for distance/time calculation — no persistent storage of live device location.

NFR-3 (Performance): Now Card location/directions lookup must never block initial page render. **[Resolved by architecture.md]** Directions API calls time out at 3 seconds, resolving to `{status: "unavailable"}` on timeout — same path as any other provider failure. Now Card distance/time refreshes on a flat 60-second cadence while visible and focused (single `getCurrentPosition()` read per tick, not `watchPosition()`), paused when backgrounded. Planning views must avoid recomputing routes on every render (shared cache, see Additional Requirements).

NFR-4 (Reliability): Any failure to calculate distance, travel time, map tiles, or route data degrades to existing itinerary behavior plus direct External Maps access wherever Coordinates exist — never blocks the surface. Implemented via the `RouteResult` discriminated union's `"unavailable"` status, never a thrown error.

NFR-5 (Cost): Directions/map usage is bounded through on-demand lookup and caching. **[Resolved by architecture.md]** Provider is Mapbox Directions API — free tier covers 100k requests/month, then $2/1k (100k–500k) and $1.60/1k (500k–1M). Guardrail monitoring relies on Mapbox's own account-level usage dashboard, not custom in-app metering.

NFR-6 (Security): All server actions/route handlers introduced for map or directions data preserve existing Packt `requireUser()` + `assertTripAccess()` authentication/authorization rules. Directions API calls happen server-side only (Server Action or route handler) — the Mapbox token is never exposed to the client.

### Additional Requirements

- **Direction/distance provider:** Mapbox Directions API — reuses the existing Mapbox account/token already used for `@mapbox/search-js-core` address autocomplete; no new vendor relationship.
- **Interactive map library:** MapLibre GL JS (MIT license), rendering Mapbox-hosted vector tiles/styles — a rendering-layer-only replacement for the proprietary Mapbox GL JS renderer, used exclusively by Map Tab.
- **Shared caching:** a server-side `route_cache` table keyed by (origin coordinates, destination coordinates, transit mode) → `distance_meters`, `duration_seconds`, `fetched_at`, with a 24-hour TTL. All 4 consuming surfaces (Now Card, Day Route Strip, Schedule Conflict, Map Tab) read through one shared calculation module — no surface calls the Directions API directly.
- **Shared calculation module:** `src/lib/route.ts` — Directions API call, `route_cache` read/write, per-hop transit-mode resolver, and the `RouteResult` discriminated union (`{status:"loading"} | {status:"ready", distanceMeters, durationSeconds} | {status:"unavailable"}`). No component or action queries `route_cache` or calls the Directions API directly.
- **Transit Mode data model** (mirrors the existing currency-preference pattern exactly): `users.transitMode` (nullable global default: walk/drive/transit) and `users.walkThresholdMeters` (nullable integer, meters) as new columns; `trips.transitMode` (nullable, seeded once at trip creation via `input.transitMode ?? user.transitMode ?? "drive"`, edited independently thereafter with no ongoing reference back to the global value).
- **Per-hop resolution:** `effectiveMode = (user.walkThresholdMeters is set AND hopDistance < walkThresholdMeters) ? "walk" : trip.transitMode` — the threshold check reads the user's global setting live per hop; it is not itself seeded onto the trip.
- **Schema-first sequencing:** the transit-mode schema changes (`users.transitMode`, `users.walkThresholdMeters`, `trips.transitMode`, `route_cache` table) must land before Now Card work, regardless of the PRD's UI-facing build order, because Now Card already needs to read `trip.transitMode` through the per-hop resolver.
- **`route.ts` ownership split (readiness-check fix, 2026-07-13):** `src/lib/route.ts` is built incrementally, not created whole by either epic — Epic 1/Story 1.1 creates the file with the `route_cache` table and the pure `resolveEffectiveMode` per-hop resolver only (no Directions API dependency, independently testable); Epic 2/Story 2.1 adds the Directions API call, `route_cache` read/write, and the `RouteResult` union to the same file as its first live consumer. Neither story owns the other's half.
- **Naming conventions:** canonical component name `DistanceTimePill` (`distance-time-pill.tsx`); `TransitMode` as a const-object + union type per project convention (`walk | drive | transit`, no "smart"); cache table `route_cache` with snake_case columns; shared module at `src/lib/route.ts` (not `utils.ts`).
- **New server actions:** trip-level Getting Around mutations go in a new colocated file `src/app/(app)/trips/[tripId]/transit-actions.ts`; the global preference mutation (`transitMode`, `walkThresholdMeters`) reuses the existing profile actions file (`src/app/(app)/profile/actions.ts`).
- **Storage format:** distance/duration stored as plain integer columns (`distance_meters`, `duration_seconds`) — explicitly not the numeric-string currency convention (`numeric().toString()` + `db-mappers.ts` parsing), since these are whole-unit measurements with no comparable precision requirement.
- **Walk-threshold input surface:** lives on the existing profile page (`src/app/(app)/profile/page.tsx`) alongside `distanceUnit`/`currency`, since it is a global preference rather than a trip one. **[Reconciled 2026-07-13]** Speced in DESIGN.md/EXPERIENCE.md (see UX-DR9) — preset-distance `Select`, mirroring the Budget threshold pattern.
- **Dead code removal:** `now-card.tsx`'s hardcoded distance placeholder (`now-card.tsx:196-197`) must be removed as part of the Now Card rework; `mini-map-rail.tsx`/`RailPanel` family is confirmed dead code, safe to remove.
- **Deferred to story-creation time (not blocking):** whether the existing unused `src/app/api/mapbox/static/route.ts` static-image proxy is reused for the Day Route Strip thumbnail, or a new approach is used instead.
- **Deferred to implementation time (not blocking):** request deduplication for overlapping same-hop lookups when multiple components on one page request the same hop simultaneously (e.g., Day Route Strip + Schedule Conflict) — reasonable to resolve with React's `cache()`.
- **File map (new/modified, from architecture.md):** `src/db/schema.ts` [MODIFY]; `src/lib/route.ts` + `route.test.ts` [NEW in Story 1.1 — `route_cache` table + `resolveEffectiveMode`; MODIFY in Story 2.1 — Directions API call + cache read/write + `RouteResult`]; `src/components/packt/distance-time-pill.tsx` + test [NEW]; `now-card.tsx` + test [MODIFY]; `place-row-action-bar.tsx` + test [MODIFY]; `place-row.tsx` + test [MODIFY]; `getting-around-section.tsx` + test [NEW]; `day-route-strip.tsx` + test [NEW]; `map-tab.tsx` + test [MODIFY]; `mini-map-rail.tsx` + test [REMOVE]; `src/app/(app)/trips/[tripId]/transit-actions.ts` + test [NEW]; `trip-detail-tab-body.tsx` + test [MODIFY]; `src/app/(app)/profile/preferences-section.tsx` + test [MODIFY]; `profile/actions.ts` [MODIFY]; `src/data/types.ts` [MODIFY] (TransitMode, RouteResult).
- **Architectural boundaries:** all route/distance reads go through `src/lib/route.ts` only; `DistanceTimePill` and the Address `ButtonGroup` segments must be DOM siblings, never nested inside existing interactive elements (Next Event `Link`, Address button); `transit-actions.ts` and `route.ts` are server-only, geolocation (`getCurrentPosition()`) is client-only.

### UX Design Requirements

UX-DR1: `DistanceTimePill` is a single component with an internal state switch between geo-hint and distance/time display — one stable DOM node across the transition (never remounts on state change), 44×44px minimum, `accent-soft`/`accent-ink` fill, `lucide:navigation` icon (stroke-width 1.5), neutral skeleton loading fill while calculating (never accent-soft or stale/zeroed data until resolved).

UX-DR2: Next Event row restructures into two independent sibling tap zones in the Now Card: (1) the existing name/time area (`Link` to itinerary, unchanged), and (2) the new distance/time-or-geo-hint pill below it. The pill must never be nested inside the row's outer `Link`. Only the Next Event row changes shape — other rows are unaffected.

UX-DR3: Geo-hint pill occupies the exact same slot as the Distance/Time pill (mutually exclusive, never both shown) when Coordinates exist but geolocation permission is missing/denied. Neutral `surface-2`/`fg-3` fill (not accent). Distinct label for "not yet asked" vs. "previously denied" states; tapping always re-attempts rather than repeating a no-op prompt.

UX-DR4: Filled Address surfaces become a two-segment shadcn Base UI `ButtonGroup` (horizontal orientation): segment 1 (`lucide:map-pin` + location name, `outline` variant) opens External Maps; segment 2 (`lucide:pencil` icon-only, `outline` variant) opens the edit dialog — the only way to reach edit once an Address exists. Segments are genuine DOM siblings sharing a border, each meeting 44×44px, never one nested inside the other. Empty Address stays a single unchanged button, no group.

UX-DR5: Every `PlaceRowActionBar` chip (Time, Cost, Docs, Attach, and the empty-Address single button) resizes to 44×44px minimum (up from ~24px effective height) — a deliberate consistency decision beyond the PRD's stated FRs, applied app-wide to every event/reservation row, not just Located ones. Shape/fill/icon-size otherwise unchanged.

UX-DR6: Schedule Conflict row icon — `lucide:triangle-alert` (stroke-width 1.5), `warning` color, appended after the Time chip on the specific affected `PlaceRow`. Mirrors the existing `TabStatusIcon` accessibility pattern: icon is `aria-hidden`, a visually-hidden `sr-only` span carries the text so the row's accessible name becomes e.g. "Time, Schedule conflict."

UX-DR7: Schedule Conflict day badge — same icon + `warning-soft`/`warning-ink` pairing as the budget tab's `status-badge` pattern, shown once per day summarizing conflict count; never shown at zero conflicts (silence is the neutral signal). Unlike the row icon, the count text itself is the visible/accessible name — icon stays `aria-hidden` with no extra `sr-only` span needed.

UX-DR8: Getting Around segmented control in the Trip Edit sheet — icon+label segmented button group, 3 segments (walk/drive/transit only, "smart" dropped). **[Reconciled 2026-07-13]** DESIGN.md and EXPERIENCE.md updated to 3 segments, matching this scope. Selected segment: `accent-soft` fill / `accent-ink` text; each segment meets 44×44px on both width and height (not just height, since this is a settings control, not a compact chip); arrow-key roving-tabindex keyboard model with Home/End jumping to first/last, matching the existing trip-detail tab bar convention.

UX-DR9: Walk-threshold preference input — new global-preference surface on the profile page alongside `distanceUnit`/`currency`, since it's a global (not trip-level) preference. **[Reconciled 2026-07-13]** Now speced in DESIGN.md (`transit-preference-fields` token) and EXPERIENCE.md (Component Patterns, State Patterns): global Transit Mode default reuses the Getting Around segmented control; walk-distance threshold is a preset-distance `Select` ("Off" + short list), mirroring the existing Budget Warning %/Danger % pattern rather than a slider or free-text field. Key-screen mock: `mockups/profile-transit-preferences.html`.

UX-DR10: Day Route Strip — new component (not a restyle of the dead `mini-map-rail.tsx`), bordered `surface` card with `rounded.lg`, containing a compact route thumbnail (`surface-2` background, `accent-brand` route line/active pins, `surface-3` inactive pins) that is a real 44×44px tap target deep-linking to Map Tab scoped to that day. Renders a neutral skeleton block while route data is pending — no distance/time figures shown until resolved. Only renders for days with ≥2 Located Items.

UX-DR11: Map Tab day selector — horizontal scrollable segmented control reusing the trip-detail tab bar's exact visual language (2px `accent-brand` bottom border on selected segment, `fg` vs. `fg-3` text color split). "Whole Trip" is always the first segment. Each segment meets 44×44px on both axes; arrow-key roving-tabindex + Home/End keyboard model, same convention as the Getting Around control.

UX-DR12: Map pin — single `accent-brand` color for every Located Item pin in both whole-trip and day-scoped views; no per-day hue coding (the day selector, not pin color, narrows scope). Tapping a pin opens/highlights that item's detail (name, address, "open External Maps" action) — pins are never decoration-only. Overlapping pins at the same coordinates/zoom level must cluster or offset rather than stacking invisibly (exact clustering mechanism is an implementation detail; "a tap must always resolve to exactly one identifiable item" is the requirement). `accent-brand` pin fill contrast must be re-verified for 3:1 non-text contrast (WCAG 1.4.11) against whichever base map tile style is used.

UX-DR13: Accessibility floor for this feature — 44×44px minimum on every new interactive target (Distance/Time pill, geo-hint pill, each Address ButtonGroup segment, Day Route Strip thumbnail, each Getting Around segment, each Map Tab day-selector segment). Distance/Time pill and geo-hint pill carry explicit accessible names distinct from decorative icon labeling (e.g. "Open directions to {event name}, 12 minutes" / "Enable location for directions to {event name}") since the pill is now a sibling target rather than nested inside the row's link. Pill focus continuity: the Distance/Time pill and geo-hint pill are a single stable DOM node across the geo-hint ↔ distance/time transition — content/label updates only, focus is never lost to a remount.

UX-DR14: Map Tab hands off to the interactive map library, independent of dependency choice: (1) pins carry accessible names/labels; (2) the map viewport is keyboard-operable (pan/zoom/pin-focus, WCAG 2.1.1) or the surface provides an equivalent non-drag/list-based path to reach any pin's detail; (3) pan/zoom/fly-to animations respect `prefers-reduced-motion`; (4) `map-pin`'s `accent-brand` fill is contrast-reverified against whichever base tile style is chosen.

UX-DR15: Responsive behavior — Map Tab day selector is horizontally scrollable at any viewport width once segment count exceeds available width (same `overflow-x-auto` pattern as the existing trip-detail tab bar), never wrapping or collapsing. Day Route Strip thumbnail stays a fixed compact size regardless of viewport — it is an affordance, not a detailed map, and never enlarges to fill available width; detailed inspection always happens in the Map Tab.

UX-DR16: Microcopy voice — plain, factual register matching the existing budget-feature Do/Don't table; no exclamation points or hype (e.g. "12 min walk" not "quick 12-minute stroll!"; "Couldn't get directions — try again." not "Oops! Something went wrong finding directions."; "1 tight connection today" not "Uh oh, your schedule looks tight!"). Silence is the correct treatment for freeform-only days and empty Addresses — never an "add a location" nudge on a Freeform Item.

### FR Coverage Map

FR-1: Epic 2 - Live distance/time for Next Event on the Now Card
FR-2: Epic 2 - Geolocation hint shown only when a Located Item can benefit
FR-3: Epic 2 - Tap distance/time pill to open External Maps
FR-4: Epic 2 - Freeform Items stay first-class (no placeholders/warnings), reinforced across all later surfaces
FR-5: Epic 2 - No silent geocoding from item title text
FR-6: Epic 1 - Trip Transit Default in "Getting Around" section (walk/drive/transit)
FR-7: Epic 1 - Deterministic seeded default for new and existing trips
FR-8: Epic 1 - Account-level default + walk-distance-threshold exception (amended into MVP)
FR-9: Epic 1 - Per-Hop Override documented as deferred (not built)
FR-10: Epic 4 - Day Route Strip for days with 2+ Located Items
FR-11: Epic 4 - Route thumbnail as map-availability affordance
FR-12: Epic 4 - Schedule Conflict detection (day + row level, buffer model)
FR-13: Epic 3 - Filled Address primary action opens External Maps
FR-14: Epic 5 - Whole-trip Map Tab showing all Located Items
FR-15: Epic 5 - Map Tab day-selector filtering
FR-16: Epic 5 - Deep-link from Day Route Strip into Map Tab

## Epic List

### Epic 1: Trip-Level Transit Mode & Getting Around Preferences
Users can set a trip's transit mode (walk/drive/transit) via a new "Getting Around" section in trip edit, back it with an account-level global default and walk-distance-threshold override, and every trip (new or existing) shows a valid seeded default from day one.
**FRs covered:** FR-6, FR-7, FR-8, FR-9

### Epic 2: Now Card Live Distance & Navigation
Users see live distance/time to their next located stop on the Now Card and can tap to open external maps in one action; freeform items and missing geolocation permission degrade gracefully with no nagging.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5

### Epic 3: Address Pill Direct Navigation
Users get one clear action to open maps directly from any filled address anywhere in the app, with edit moved to a secondary action; every action-bar chip on that row meets the interactive-sizing bar.
**FRs covered:** FR-13

### Epic 4: Day Route Strip & Schedule Conflict Awareness
Users planning a day with 2+ located stops see a route summary and get warned (day badge + row icon) when travel time between stops doesn't fit the schedule.
**FRs covered:** FR-10, FR-11, FR-12

### Epic 5: Map Tab with Whole-Trip and Day Views
Users can open a Map tab to see every located stop across a trip, narrow to a single day, and deep-link in from a Day Route Strip thumbnail.
**FRs covered:** FR-14, FR-15, FR-16

## Epic 1: Trip-Level Transit Mode & Getting Around Preferences

Users can set a trip's transit mode (walk/drive/transit) via a new "Getting Around" section in trip edit, back it with an account-level global default and walk-distance-threshold override, and every trip (new or existing) shows a valid seeded default from day one.

**FRs covered:** FR-6, FR-7, FR-8, FR-9 (FR-9 / Per-Hop Override intentionally not built in this epic — deferred per PRD/architecture)

### Story 1.1: Set global Transit Mode preference and walk-distance threshold

As a traveler,
I want to set a personal default transit mode and a "walk if it's close" distance threshold,
So that new trips start with my usual preference and short hops are always walked regardless of trip mode.

**Acceptance Criteria:**

**Given** the database migration for this feature is applied
**When** it completes
**Then** `users.transitMode` (nullable text: walk/drive/transit) and `users.walkThresholdMeters` (nullable integer) columns exist, the `route_cache` table exists (`origin_lat`, `origin_lng`, `destination_lat`, `destination_lng`, `transit_mode`, `distance_meters`, `duration_seconds`, `fetched_at`, snake_case columns), and `src/lib/route.ts` exports a pure `resolveEffectiveMode(hopDistanceMeters, tripTransitMode, walkThresholdMeters)` function — this AC scopes only the `route_cache` table and this pure per-hop resolver; Directions API calls, `route_cache` reads/writes, and the `RouteResult` union are Story 2.1's responsibility, added to the same file without touching this function

**Given** the profile preferences page
**When** I view it
**Then** `transitMode` and `walkThresholdMeters` inputs appear alongside the existing currency/distanceUnit preferences

**Given** I have set `walkThresholdMeters`
**When** any hop's distance is calculated as less than that threshold
**Then** `route.ts`'s `resolveEffectiveMode` (created above) resolves `effectiveMode` to `"walk"` for that hop specifically, overriding whichever trip mode is otherwise in effect

**And** `walkThresholdMeters` is stored in meters internally regardless of my `distanceUnit` display preference, converting only for display

### Story 1.2: Seed Trip Transit Default automatically

As a traveler,
I want every trip to have a sensible transit mode set automatically,
So that I don't have to configure anything for travel estimates to work.

**Acceptance Criteria:**

**Given** the database migration for this feature is applied
**When** it completes
**Then** `trips.transitMode` (nullable text) column exists

**Given** a user creates a new trip without specifying a transit mode
**When** the trip is saved
**Then** `trips.transitMode` is set via `input.transitMode ?? user.transitMode ?? "drive"` (reading the global preference from Story 1.1)

**Given** an existing trip created before this feature shipped
**When** it's viewed anywhere transit mode is read
**Then** it resolves to a valid Trip Transit Default without requiring the user to visit an edit flow first

### Story 1.3: Set Trip Transit Default via Getting Around section

As a trip owner or editor,
I want to set my trip's transit mode in a "Getting Around" section,
So that travel estimates match how I actually get around on this trip.

**Acceptance Criteria:**

**Given** the trip edit sheet
**When** I open it
**Then** a distinct "Getting Around" section is visible containing a 3-segment control: walk, drive, transit — pre-selected to the trip's seeded default from Story 1.2

**Given** I select a mode and save
**When** the mutation runs
**Then** it calls `requireUser()` then `assertTripAccess("editor")` before persisting to `trips.transitMode`, independently of the global preference value going forward

**Given** I'm using a keyboard only
**When** I press arrow keys within the segmented control
**Then** focus roves between segments, and Home/End jump to the first/last segment

**And** each segment meets the 44×44px minimum interactive target on both axes

## Epic 2: Now Card Live Distance & Navigation

Users see live distance/time to their next located stop on the Now Card and can tap to open external maps in one action; freeform items and missing geolocation permission degrade gracefully with no nagging.

**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5 (FR-4/FR-5 are guardrails enforced via acceptance criteria rather than dedicated stories)

### Story 2.1: Show live distance/time for the Next Event

As a traveler on a trip day,
I want to see live distance and travel time to my next stop,
So that I know how far I am without digging through the itinerary.

**Acceptance Criteria:**

**Given** the Next Event has Coordinates and geolocation permission is granted
**When** the Now Card renders
**Then** it shows a `DistanceTimePill` in its distance/time state with live distance and time

**Given** distance/time is being calculated
**When** the pill first renders
**Then** it shows a neutral skeleton fill — never a stale, zero, or dashed value

**Given** the Now Card is visible and the tab has focus
**When** 60 seconds elapse
**Then** distance/time refreshes using a single `getCurrentPosition()` reading (not `watchPosition()`); refresh pauses when the tab is backgrounded

**Given** the Directions API call exceeds 3 seconds or fails for any reason
**When** this happens
**Then** `RouteResult` resolves to `{status: "unavailable"}`, the pill displays "Couldn't get directions — try again." instead of blank or omitted text, and the Now Card is never blocked from rendering

**Given** the Next Event has no Coordinates (Freeform)
**When** the Now Card renders
**Then** no pill, placeholder, or hint appears at all — the row looks exactly as it does today

**Given** the Next Event row's restructure
**When** the pill is added
**Then** the name/time area (existing `Link`) and the pill are genuine DOM siblings in their own tap zones — the pill is never nested inside the row's outer `Link`, and the existing link's accessible name/behavior is unchanged

**Given** any Event or Reservation title text
**When** it is saved, viewed, or used in route computation
**Then** Packt never derives Coordinates from that text automatically

**And** the distance/time lookup never blocks initial page render, and repeated requests for the same origin/destination/mode within 24 hours are served from `route_cache` instead of a new Directions API call

### Story 2.2: Open External Maps from the Distance/Time pill

As a traveler viewing the Now Card,
I want to tap the distance/time pill,
So that I can navigate to my next stop in one tap.

**Acceptance Criteria:**

**Given** the pill is showing live distance/time
**When** I tap it
**Then** Packt opens External Maps with the Next Event's Address or Coordinates as the destination

**Given** the tap target
**When** measured
**Then** it meets the 44×44px minimum on both axes

**Given** directions/time could not be calculated but the Next Event has Coordinates
**When** the pill renders
**Then** it shows the "Couldn't get directions — try again." error text in place of the distance/time text, and remains tappable to open External Maps directly — the tap target and maps action are never removed just because the estimate failed

**And** the pill's accessible name is explicit and distinct from the adjacent event name, e.g. "Open directions to {event name}, 12 minutes"

### Story 2.3: Prompt for geolocation only when it can help

As a traveler whose next stop has a saved address,
I want a clear, non-intrusive way to enable location,
So that I can get directions without being nagged when there's nothing to navigate to.

**Acceptance Criteria:**

**Given** the Next Event has Coordinates and geolocation permission has not yet been requested
**When** the Now Card renders
**Then** a geo-hint pill occupies the same slot as the distance/time pill, with neutral `surface-2`/`fg-3` styling and label "Enable location for directions"

**Given** I tap the geo-hint pill in its not-yet-asked state
**When** I tap it
**Then** the native browser permission prompt is triggered — never shown automatically on page load

**Given** permission was previously denied
**When** the Now Card renders
**Then** the geo-hint pill shows a distinct label communicating the block instead of repeating the same call-to-action, and tapping it again re-attempts rather than silently no-op-ing

**Given** the Next Event has no Coordinates (Freeform)
**When** the Now Card renders
**Then** the geo-hint pill never appears for it

**And** across the geo-hint ↔ distance/time transition, the pill remains a single stable DOM node — only content/label updates, focus is never lost to a remount

## Epic 3: Address Pill Direct Navigation

Users get one clear action to open maps directly from any filled address anywhere in the app, with edit moved to a secondary action; every action-bar chip on that row meets the interactive-sizing bar.

**FRs covered:** FR-13

### Story 3.1: Filled Address opens External Maps directly

As a traveler viewing an event or reservation with a saved address,
I want the address to be a direct action to open maps,
So that I can navigate there without an extra step.

**Acceptance Criteria:**

**Given** a `PlaceRow` with a filled Address
**When** it renders
**Then** it shows a two-segment shadcn `ButtonGroup`: segment 1 (`map-pin` icon + location name, `outline` variant) and segment 2 (`pencil` icon-only, `outline` variant)

**Given** I tap segment 1
**When** tapped
**Then** External Maps opens for that Address

**Given** I tap segment 2
**When** tapped
**Then** the edit dialog opens — the only way to reach edit once an Address exists

**Given** an empty Address
**When** rendered
**Then** it remains a single button (today's behavior) — no group

**And** each segment meets the 44×44px minimum, sharing a border with no visible gap, as genuine DOM siblings — never one nested inside the other

### Story 3.2: Resize action-bar chips to meet interactive-sizing minimum

As a traveler using Packt on any device,
I want every action chip on an itinerary row to be comfortably tappable,
So that I don't mis-tap adjacent controls.

**Acceptance Criteria:**

**Given** any `PlaceRow` (event or reservation, Located or Freeform)
**When** its Time, Cost, Docs, and Attach chips render
**Then** each meets the 44×44px minimum on both axes

**Given** the chip's shape/fill/icon-size
**When** resized
**Then** the `rounded-full` shape, `accent-soft`/`fg-4` fill logic, and 12px action-chip icon scale remain unchanged — only the tap area grows

**And** this resize applies to every event/reservation row app-wide, not just rows with a filled Address

## Epic 4: Day Route Strip & Schedule Conflict Awareness

Users planning a day with 2+ located stops see a route summary and get warned (day badge + row icon) when travel time between stops doesn't fit the schedule.

**FRs covered:** FR-10, FR-11, FR-12

### Story 4.1: Show Day Route Strip for days with 2+ Located Items

As a traveler planning a day with multiple located stops,
I want to see a route summary for that day,
So that I understand the overall distance and travel time before I'm on the ground.

**Acceptance Criteria:**

**Given** a day with 2+ Located Items
**When** the Itinerary Day View renders
**Then** a Day Route Strip appears showing route distance, travel time, and the effective Trip Transit Default

**Given** a day with 0–1 Located Items
**When** the Itinerary Day View renders
**Then** no Day Route Strip appears — no empty-state clutter

**Given** route data is being calculated
**When** the strip first renders
**Then** it shows a neutral skeleton thumbnail with no distance/time figures until resolved

**Given** the thumbnail
**When** rendered
**Then** it is a real 44×44px element signaling map availability (not detailed geography) — it may remain non-clickable or hidden until Map Tab ships (Epic 5 wires the actual deep-link)

**Given** the thumbnail's size
**When** viewed at any viewport width
**Then** it stays a fixed compact size — it never grows to fill available width on wider viewports; detailed inspection always happens in the Map Tab, never by enlarging the thumbnail itself

**And** the shared `route.ts` module's multi-hop day aggregation reuses the per-hop resolver from Epic 1 and the `route_cache` from Epic 2 — no duplicated fetch/compute logic

### Story 4.2: Detect and surface Schedule Conflicts

As a traveler planning a tightly-timed day,
I want to be warned when travel time between stops doesn't fit my schedule,
So that I can catch unrealistic plans before I'm on the ground.

**Acceptance Criteria:**

**Given** two adjacent timed Located Items on the same day
**When** `travel_time + 10 minutes > scheduled_gap`
**Then** Packt flags a Schedule Conflict

**Given** a flagged conflict
**When** the Itinerary Day View renders
**Then** a day-level badge shows the conflict count (icon + word, never color alone), and is never shown at zero conflicts

**Given** a flagged conflict
**When** the affected `PlaceRow` renders
**Then** a row-level triangle-alert icon appears after the Time chip, `aria-hidden`, with a visually-hidden span carrying the text so the row's accessible name becomes e.g. "Time, Schedule conflict"

**Given** a Freeform Item (no Coordinates) adjacent to a Located Item
**When** conflicts are evaluated
**Then** it never triggers or displays a route-based conflict

**And** when an in-page edit (time, order, or transit-mode change) changes conflict status, the badge/icon appearance or disappearance is announced via `aria-live="polite"`; passive distance/time ticking elsewhere is never wrapped in a live region

## Epic 5: Map Tab with Whole-Trip and Day Views

Users can open a Map tab to see every located stop across a trip, narrow to a single day, and deep-link in from a Day Route Strip thumbnail.

**FRs covered:** FR-14, FR-15, FR-16

### Story 5.1: Show whole-trip map

As a traveler wanting to see where my trip activities cluster,
I want to open a Map tab showing all my located stops,
So that I can understand the geographic spread of my trip.

**Acceptance Criteria:**

**Given** a trip with Located Items
**When** I open the Map Tab
**Then** all Located Items from Events and Reservations render as `accent-brand` map pins, single color, no per-day hue coding

**Given** Freeform Items
**When** the Map Tab renders
**Then** they are omitted from pins without any warning

**Given** a trip with zero Located Items
**When** I open the Map Tab
**Then** a neutral empty state ("No located stops yet") appears with no prompt to add locations

**Given** I tap a pin
**When** tapped
**Then** it opens/highlights that Located Item's detail (name, address, "open External Maps" action) — pins are never decoration-only

**Given** overlapping pins at the same coordinates or close zoom
**When** rendered
**Then** they cluster or offset rather than stacking invisibly — a tap always resolves to exactly one identifiable item

**Given** the map viewport
**When** navigated by keyboard
**Then** pan/zoom/pin-focus is keyboard-operable (WCAG 2.1.1), or an equivalent non-drag path reaches any pin's detail

**Given** pan/zoom/fly-to animations
**When** `prefers-reduced-motion` is set
**Then** those animations respect it

**Given** MapLibre GL JS
**When** it mounts
**Then** it does so inside a client component, reusing the existing Mapbox account/token, with pin fill contrast re-verified against the chosen tile style

**And** on any directions/map provider failure, the surface degrades to existing itinerary behavior plus direct External Maps access wherever Coordinates exist — never blocking the surface

### Story 5.2: Filter Map Tab by day

As a traveler viewing the Map Tab,
I want to narrow the view to a single day,
So that I can see concentration for one day without losing the whole-trip option.

**Acceptance Criteria:**

**Given** the Map Tab
**When** it renders
**Then** a day selector shows "Whole Trip" as the first segment followed by each trip day

**Given** I select a day segment
**When** selected
**Then** visible pins and route context filter to that day's Located Items only

**Given** the day selector
**When** the trip has many days
**Then** it is horizontally scrollable at any viewport width (same `overflow-x-auto` pattern as the trip-detail tab bar), never wrapping or collapsing

**Given** each day-selector segment
**When** measured
**Then** it meets 44×44px on both axes, with arrow-key roving-tabindex and Home/End keyboard navigation

**Given** the existing `?tab=map` query-param convention
**When** a day is selected
**Then** the URL supports deep-linking to that Map Tab + day scope

**And** selecting "Whole Trip" again returns the map to full trip scope

### Story 5.3: Deep-link from Day Route Strip to Map Tab

As a traveler viewing a Day Route Strip,
I want tapping its thumbnail to open the Map Tab scoped to that day,
So that I can go straight from a day's plan to seeing it geographically.

**Acceptance Criteria:**

**Given** a Day Route Strip thumbnail
**When** I tap it
**Then** the Map Tab opens pre-scoped to that day (day selector reflects the matching day)

**Given** I'm viewing a day-scoped Map Tab reached this way
**When** I want to see everything
**Then** the day selector still allows returning to whole-trip scope

**And** the Day Route Strip thumbnail (non-clickable/hidden as of Epic 4 Story 4.1) becomes a live tap target now that Map Tab exists
