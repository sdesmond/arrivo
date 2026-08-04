---
title: "Packt Location-Aware Itinerary PRD"
status: final
created: "2026-07-12"
updated: "2026-07-13"
---

# PRD: Packt Location-Aware Itinerary

## 0. Document Purpose

This PRD defines a launch-level product scope for making saved location data useful in Packt without making location entry mandatory. It is for product, UX, architecture, story creation, and QA planning. Source scope is `_bmad-output/brainstorming/brainstorming-session-2026-07-11-1818.md`; existing project context and code references may inform feasibility but do not expand scope. Requirements are grouped by user-facing feature, with stable FR IDs, named user journeys, glossary terms, explicit non-goals, success metrics, and indexed assumptions.

## 1. Vision

Packt should make location useful at the exact moments travelers need it: when they are moving to the next stop, scanning whether a day is realistic, or opening a saved address in maps. A traveler who already entered an address should get value from that address without hunting through itinerary details. A traveler who did not enter an address should never be nagged, blocked, or made to feel their freeform itinerary item is incomplete.

The product bet is that location should behave as an enrichment layer, not as a required field. Packt will surface map access, distance, travel time, and route awareness only when enough location data exists. Empty location data remains clean absence. This keeps freeform items like "shopping" first-class while giving high-value help for events and reservations that already have addresses.

Launch scope prioritizes the highest-leverage day-of surface first: the Now Card. It then formalizes transit-mode defaults, planning-aware day summaries, schedule conflict detection, direct address map access, and a Map tab that can pivot between whole-trip and day-specific views.

## 2. Target User

### 2.1 Jobs To Be Done

- When I am out during a trip, I want to see how far I am from my next located stop so I can move without digging through the itinerary.
- When I have saved an address, I want one obvious way to open it in maps so I can navigate immediately.
- When I am planning a day, I want to understand travel time between located stops so I can spot unrealistic schedules before I am on the ground.
- When I jot freeform itinerary items, I want them to remain valid without adding a location.
- When I care how I get around, I want Packt to infer sensible transit modes while still letting me override them.

### 2.2 Non-Users (v1)

- Users expecting Packt to auto-discover locations from event titles alone.
- Users seeking hotel or accommodation recommendations based on trip geography.
- Users needing offline turn-by-turn navigation inside Packt.

### 2.3 Key User Journeys

- **UJ-1. Maya gets to her next stop from the Now Card.**
  - **Persona + context:** Maya is traveling in Tokyo, walking between planned stops with her phone in hand.
  - **Entry state:** Maya is authenticated and opens Packt on trip day. The next event has a saved address with coordinates.
  - **Path:** Packt shows the Now Card. The Next Event row includes distance and travel time from Maya's current device location. Maya taps the distance/time line. Packt opens external maps for the next event.
  - **Climax:** Maya reaches navigation in one tap from the home surface, without opening the itinerary tab.
  - **Resolution:** Maya can continue using her preferred maps app; Packt remains a clean trip context.
  - **Edge case:** If browser geolocation permission is missing, Packt shows a compact enable-location hint only because the next event already has a saved address.

- **UJ-2. Jordan keeps a freeform day uncluttered.**
  - **Persona + context:** Jordan is sketching a flexible travel day and adds "shopping" with no specific address.
  - **Entry state:** Jordan is authenticated and editing a trip day.
  - **Path:** Jordan creates or keeps an item without an address. Packt does not show missing-location placeholders, warnings, or map hints for that item. Located items elsewhere still get map affordances.
  - **Climax:** Jordan sees that freeform itinerary items remain first-class.
  - **Resolution:** Jordan can later add a location if wanted, but Packt does not pressure them.

- **UJ-3. Priya catches an unrealistic schedule while planning.**
  - **Persona + context:** Priya is planning a tightly timed day with restaurant and museum stops.
  - **Entry state:** Priya is authenticated and viewing a day with two or more located stops.
  - **Path:** Packt computes event-to-event travel time using the trip's transit mode. A day-level warning badge shows one schedule conflict. Priya scans the day and sees an icon on the specific event row causing the issue.
  - **Climax:** Priya understands which part of the schedule is unrealistic without opening a modal or reading a verbose warning.
  - **Resolution:** Priya can adjust event times, reorder stops, or change transit mode.

- **UJ-4. Luis previews a whole trip geographically.**
  - **Persona + context:** Luis wants to understand where trip activities cluster before finalizing plans.
  - **Entry state:** Luis opens the Map tab for a trip that has multiple located events and reservations.
  - **Path:** Packt shows a whole-trip map by default. Luis switches the selector to a specific day. The map filters to that day, preserving a route-aware view of located stops only.
  - **Climax:** Luis sees geographic spread and day-by-day concentration without losing non-located items in the itinerary.
  - **Resolution:** Luis can return to whole-trip scope or deep-link into the Map tab from a day route strip.

## 3. Glossary

- **Address** - Human-readable location text saved on an Event or Reservation.
- **Coordinates** - Latitude and longitude associated with an Address.
- **Located Item** - Event or Reservation with Coordinates.
- **Freeform Item** - Event or Reservation without Coordinates, intentionally valid in Packt.
- **Now Card** - Home-surface card showing current or next trip context.
- **Next Event** - Next upcoming Event shown in the Now Card.
- **Distance/Time Line** - Compact text or chip showing distance and estimated travel time.
- **Transit Mode** - Travel method used for estimates: walk, drive, or transit.
- **Trip Transit Default** - Trip-level Transit Mode preference used for planning estimates.
- **Per-Hop Override** - One-off Transit Mode override for travel between two adjacent Located Items.
- **Day Route Strip** - Compact day-level surface shown when a day has two or more Located Items.
- **Schedule Conflict** - Case where estimated travel time between adjacent timed Located Items exceeds available schedule gap.
- **Map Tab** - Trip-level map surface with whole-trip and day-specific filters.
- **External Maps** - User's maps/navigation application opened outside Packt.

## 4. Features

### 4.1 Now Card Distance and Navigation

**Description:** The Now Card becomes the primary day-of location surface. When the Next Event has Coordinates, Packt can show live distance and travel time from device location to that event. The Distance/Time Line becomes the primary tap target for opening External Maps. Missing Address data produces no placeholder. Missing geolocation permission may produce a compact hint only when the Next Event is already a Located Item. Realizes UJ-1 and protects UJ-2.

#### FR-1: Show live distance/time for Next Event

Authenticated users can see distance and estimated travel time from current device location to the Next Event when the Next Event is a Located Item and geolocation permission is granted. Realizes UJ-1.

**Consequences (testable):**

- If Next Event has Coordinates and geolocation is available, Now Card shows a non-placeholder distance and travel time.
- If Next Event has no Coordinates, Now Card shows no distance/time placeholder and no location hint.
- If current device location cannot be obtained, Packt does not block access to Now Card or trip content.

#### FR-2: Prompt for geolocation only when location data exists

Authenticated users can see a compact enable-location hint on the Now Card when the Next Event is a Located Item and geolocation permission is missing or denied. Realizes UJ-1.

**Consequences (testable):**

- The hint appears only when the Next Event has Coordinates.
- The hint does not appear for Freeform Items.
- Denying permission leaves the Now Card usable and suppresses repeated blocking prompts. [ASSUMPTION: Browser-level permission prompts are user-initiated through the compact hint rather than shown automatically on page load.]

#### FR-3: Open External Maps from the Distance/Time Line

Authenticated users can tap the Now Card Distance/Time Line to open External Maps for the Next Event when the Next Event is a Located Item. Realizes UJ-1.

**Consequences (testable):**

- The tap target meets Packt interactive target sizing requirements.
- The opened maps URL includes the destination Address or Coordinates.
- If distance/time cannot be calculated but Coordinates exist, the user still has a visible map-opening affordance. [ASSUMPTION: External Maps should remain available when directions calculation fails.]

### 4.2 Optional Location Behavior

**Description:** Packt keeps location optional across all itinerary surfaces. A missing Address is treated as absence of enrichment, not a defect. Located Items receive map and route features; Freeform Items retain normal itinerary behavior without nagging. Realizes UJ-2.

#### FR-4: Preserve Freeform Items as first-class

Authenticated users can create, edit, view, and keep Events or Reservations without Coordinates without seeing missing-location warnings. Realizes UJ-2.

**Consequences (testable):**

- Freeform Items do not render map placeholders, route warnings, or "add location" nudges outside existing edit affordances.
- Freeform Items remain visible in itinerary ordering and existing detail views.
- Route and map features omit Freeform Items without changing their saved data.

#### FR-5: Reject silent location inference from item text

Packt must not automatically geocode an Event or Reservation title to create Coordinates without explicit user action. Realizes UJ-2.

**Consequences (testable):**

- An Event titled "Narita Airport" with no selected Address remains a Freeform Item.
- Packt does not add Coordinates from title text during save, view, route computation, or map display.
- Future explicit search or suggestion flows must require user confirmation before Coordinates are saved.

### 4.3 Transit Mode Defaults and Overrides

**Description:** Packt needs a Transit Mode model because distance and travel time are misleading without mode. MVP requires a Trip Transit Default that can drive Now Card fallback behavior, Day Route Strip estimates, and Schedule Conflict checks, backed by an account-level global default and a walk-distance exception so trip setup starts from a sensible seed. Per-Hop Override is the only layer that must not block the first launch. The trip-edit experience includes a "Getting Around" section for trip-level control. Realizes UJ-1, UJ-3, and UJ-4. **[AMENDED 2026-07-13: architecture pulled the account-level default and walk-distance exception into MVP and dropped "smart" as a mode; see FR-8 and `.decision-log.md`.]**

#### FR-6: Provide a Trip Transit Default

Authenticated users can set a Trip Transit Default in a trip-edit "Getting Around" section. Realizes UJ-3 and UJ-4.

**Consequences (testable):**

- Trip edit includes a distinct "Getting Around" section.
- Trip Transit Default supports walk, drive, and transit (no separate "smart" mode — dropped per architecture amendment). [ASSUMPTION: Bike, ride share, ferry, and mixed-mode are out of MVP.]
- Existing trips receive a safe default without requiring immediate user action.

#### FR-7: Seed trip mode with a safe default

Packt can seed Trip Transit Default with a deterministic safe default when no explicit trip choice exists. Realizes UJ-3.

**Consequences (testable):**

- New trips start with a deterministic Transit Mode default.
- Existing trips display a valid Trip Transit Default without forcing users through edit flow.
- Smart inference from trip context is optional for MVP and must fall back to the deterministic default when unavailable.

#### FR-8: Ship an account-level Transit Mode default and walk-distance exception

Authenticated users can set a global Transit Mode default and an optional walk-distance threshold on their profile, alongside existing `currency`/`distanceUnit` preferences. The global default seeds new trips' Trip Transit Default; the threshold overrides the Transit Mode for any individual hop shorter than the set distance, regardless of trip default. Realizes UJ-3. **[AMENDED 2026-07-13: originally scoped as "preserve room for" a post-MVP layer (§13.2 Q6/Q7); architecture pulled both into MVP to reuse the existing currency-preference seed pattern (`trip.transitMode ?? user.transitMode ?? "drive"`). Per-Hop Override (FR-9) is the only remaining post-MVP layer.]**

**Consequences (testable):**

- A global Transit Mode preference and walk-distance threshold are editable from the profile page alongside existing preferences.
- New trips seed their Trip Transit Default from the global preference when the user hasn't chosen one explicitly.
- Any hop shorter than the walk-distance threshold resolves to walk for that hop, overriding the trip's Transit Mode default.
- Travel estimates identify which Transit Mode was used per hop.
- No hidden adaptive learning is introduced from user overrides.
- Per-Hop Override (FR-9) remains the only Transit Mode capability deferred past MVP.

#### FR-9: Support Per-Hop Override as post-MVP extension

Authenticated users should eventually be able to change Transit Mode for a specific adjacent pair of Located Items without changing trip or account defaults. This is post-MVP unless PM explicitly pulls it forward. Realizes UJ-3.

**Consequences (testable):**

- If included, Per-Hop Override affects only that hop.
- If included, Per-Hop Override is surfaced through a clear chip or equivalent affordance, not bare clickable text.
- If deferred, MVP estimates still work from Trip Transit Default.

### 4.4 Day Route Strip and Schedule Awareness

**Description:** Planning views should show ambient route awareness only when useful. A Day Route Strip appears when a day has two or more Located Items. It summarizes route distance, travel time, and Transit Mode. The same calculation supports Schedule Conflict detection using day-level and row-level warnings. Realizes UJ-3.

#### FR-10: Show Day Route Strip for located days

Authenticated users can see a Day Route Strip for a trip day with two or more Located Items. Realizes UJ-3.

**Consequences (testable):**

- Days with fewer than two Located Items render no Day Route Strip.
- Day Route Strip shows route summary using Located Items only.
- Day Route Strip does not create empty-state clutter for Freeform-only days.

#### FR-11: Use route thumbnail as affordance

Day Route Strip can include a route thumbnail whose job is to indicate map availability, not to communicate detailed geography. Realizes UJ-3 and UJ-4.

**Consequences (testable):**

- Thumbnail is legible as a route/map affordance at compact size.
- Detailed route inspection happens in the Map Tab, not inside the thumbnail.
- Before Map Tab launch, thumbnail can remain non-clickable or hidden. [ASSUMPTION: Day Route Strip may ship before Map Tab.]

#### FR-12: Detect schedule conflicts

Packt can compare available time between adjacent timed Located Items against estimated travel time and flag Schedule Conflicts. Realizes UJ-3.

**Consequences (testable):**

- If estimated travel time exceeds schedule gap, Packt shows a Schedule Conflict on the affected day and event row.
- Day-level warning summarizes count without opening a modal or toast.
- Row-level warning identifies the specific affected item.
- Freeform Items without Coordinates do not trigger route-based conflicts.

### 4.5 Address Pill State-Flip

**Description:** Address interaction should be direct. When an Address is empty, the primary action remains adding a location. When an Address is filled, the primary action opens External Maps, while editing moves to a secondary affordance. This removes the static map popover concept from scope. Realizes UJ-1 and UJ-2.

#### FR-13: Make filled Address primary action open maps

Authenticated users can open External Maps from a filled Address pill or equivalent Address surface. Realizes UJ-1.

**Consequences (testable):**

- Empty Address surface invites add/edit location using existing behavior.
- Filled Address surface opens External Maps as the primary action.
- Edit remains available through a secondary affordance.
- No static map preview popover is required for MVP.

### 4.6 Map Tab with Day Selector

**Description:** The Map Tab is the deliberate geographic exploration surface. It shows Located Items for the whole trip by default and lets users filter to a specific day. Day Route Strip taps can deep-link to this tab with day scope. Freeform Items remain visible in itinerary views but are omitted from map pins. Realizes UJ-4.

#### FR-14: Show whole-trip map

Authenticated users can open the Map Tab and see all Located Items for a trip. Realizes UJ-4.

**Consequences (testable):**

- Map Tab renders Located Items from Events and Reservations.
- Freeform Items are omitted from map pins without warning.
- If a trip has no Located Items, Map Tab shows an unobtrusive empty state that does not prompt users to add locations. [ASSUMPTION: A neutral empty state is acceptable inside the deliberate Map Tab, unlike itinerary surfaces.]

#### FR-15: Filter Map Tab by day

Authenticated users can switch Map Tab scope between whole trip and individual days. Realizes UJ-4.

**Consequences (testable):**

- Day selector includes whole-trip scope and each trip day.
- Switching day scope updates visible pins and route context.
- Query params support deep-linking to Map Tab and day scope. [ASSUMPTION: Existing `?tab=map` convention remains preferred.]

#### FR-16: Deep-link from Day Route Strip to Map Tab

Authenticated users can open Map Tab pre-scoped to a day from Day Route Strip once Map Tab exists. Realizes UJ-3 and UJ-4.

**Consequences (testable):**

- Day Route Strip opens Map Tab for the matching day.
- Map Tab selector allows return to whole-trip scope.
- This linkage is not required before Map Tab launch.

## 5. Cross-Cutting NFRs

- **Accessibility:** All map, mode, Address, warning, and navigation controls must meet existing Packt interactive target sizing and keyboard/focus requirements.
- **Privacy:** Packt must request browser geolocation only for user-visible value and must not store live device location unless a later PRD explicitly requires it. [ASSUMPTION: MVP uses live location transiently for distance/time calculation.]
- **Performance:** Now Card location/directions lookup must not block initial page rendering; architecture must define an explicit latency target before implementation. Planning views must avoid repeated route calculations on every render.
- **Reliability:** Failure to calculate distance, travel time, map tiles, or route data must degrade to existing itinerary behavior plus direct map access when Coordinates exist.
- **Cost:** Directions and map usage must be bounded through on-demand lookup, caching where appropriate, and explicit spike validation before implementation commitment; architecture must define a monthly request budget or equivalent guardrail.
- **Security:** All server actions and route handlers introduced for map or directions data must preserve existing Packt authentication and trip-access rules.

## 6. Constraints and Guardrails

### 6.1 Product Guardrails

- Location remains optional.
- Freeform Items remain valid and uncluttered.
- No silent geocoding from title text.
- No nagging for missing Address data.
- No static map preview popover in MVP.

### 6.2 Technical Guardrails

- Source of truth for domain types remains `src/data/types.ts`.
- Existing Mapbox autocomplete Coordinates should be reused where present.
- Direction provider, rate limits, and cost require a technical spike before implementation is committed. [NOTE FOR PM: Brainstorming notes identify Mapbox Directions API as likely fit, but API reference and pricing should be revalidated during architecture.]
- Interactive Map Tab likely requires an interactive map dependency. [NOTE FOR PM: Dependency choice belongs in architecture, not this PRD.]
- The account-level Transit Mode default and walk-distance exception (FR-8) mirror the existing `currency`/`distanceUnit` global-preference pattern on the profile page — same seed-at-trip-creation, edit-independently-after shape as `budgetCurrency`/`preferredCurrency`.

## 7. Information Architecture

- **Home / Now Card:** Live next-stop distance/time and map-opening action.
- **Itinerary Day View:** Optional Day Route Strip and Schedule Conflict indicators.
- **Trip Edit:** "Getting Around" section for Trip Transit Default.
- **Address Surfaces:** State-flipped Address action for add vs open maps.
- **Map Tab:** Whole-trip and day-specific geographic exploration.

## 8. Non-Goals

- Packt will not require every Event or Reservation to have a location.
- Packt will not infer Coordinates from item titles without explicit user confirmation.
- Packt will not build accommodation search or hotel optimization in this scope.
- Packt will not build in-app turn-by-turn navigation.
- Packt will not use Per-Hop Overrides as adaptive learning signals.
- Packt will not ship a static map preview popover for Address pills in MVP.
- Packt will not make map features the only way to understand the itinerary.

## 9. MVP Scope

### 9.1 In Scope

- Now Card live distance/time to Next Event.
- Geolocation hint only when a Located Item can benefit from it.
- One-tap open to External Maps from Now Card.
- Optional-location behavior across itinerary surfaces.
- Address pill state-flip for filled Addresses.
- Trip Transit Default and "Getting Around" section.
- Day Route Strip for days with two or more Located Items.
- Schedule Conflict detection using estimated travel time.
- Map Tab with whole-trip and day selector.

### 9.2 Out of Scope for MVP

- Accommodation search by location fit, deferred to separate discovery.
- Silent title-based geocoding, rejected.
- Adaptive learning from Transit Mode overrides, rejected.
- In-app navigation, deferred indefinitely unless product strategy changes.
- Bike, ferry, ride share, or advanced mixed-mode routing, deferred.
- Public sharing or collaborative map editing, not covered by source scope.

## 10. Recommended Build Order

1. Now Card distance/time and External Maps action.
2. Address pill state-flip, because it has low dependency and simplifies existing behavior.
3. Trip Transit Default and "Getting Around" section.
4. Shared route/distance calculation for planning surfaces.
5. Day Route Strip and Schedule Conflict indicators.
6. Map Tab with whole-trip and day selector.
7. Day Route Strip deep-link into Map Tab.

[DECISION: Address Pill state-flip moves to second in build order. Brainstorming treated it as shippable anytime; PM confirmed earlier sequencing because it is low-dependency and gives immediate map-access value.]

## 11. Success Metrics

**Primary**

- **SM-1:** Next-stop navigation activation: percentage of trips with a Located Next Event where user opens External Maps from Now Card. Target: establish baseline in beta, then improve by 25 percent after launch. Validates FR-1, FR-3.
- **SM-2:** Freeform preservation: percentage of Freeform Items that remain free of missing-location prompts or warnings. Target: 100 percent. Validates FR-4, FR-5.
- **SM-3:** Schedule conflict usefulness: percentage of flagged Schedule Conflicts that are followed by time, order, or Transit Mode edits. Target: establish baseline; use qualitative beta review before setting numeric target. Validates FR-12.

**Secondary**

- **SM-4:** Address map access: percentage of filled Address interactions that open External Maps vs edit location. Target: monitor to confirm state-flip matches intent. Validates FR-13.
- **SM-5:** Map Tab engagement: percentage of trips with two or more Located Items where user views Map Tab. Target: establish baseline after release. Validates FR-14, FR-15.

**Counter-metrics**

- **SM-C1:** Location nag rate: count of missing-location prompts shown for Freeform Items. Must remain zero. Counterbalances SM-1 and SM-5.
- **SM-C2:** Permission fatigue: repeated geolocation permission prompts per user per trip. Must not increase beyond one user-initiated prompt per relevant surface session. Counterbalances SM-1.
- **SM-C3:** Map dependency failure impact: percentage of itinerary views blocked by map/directions failure. Must remain zero. Counterbalances SM-5.

## 12. Risks and Mitigations

- **Risk:** Directions API cost or rate limits make live estimates expensive. **Mitigation:** Architecture spike, on-demand lookup, caching, graceful fallback.
- **Risk:** Geolocation permission feels intrusive. **Mitigation:** User-initiated compact hint only when Coordinates exist.
- **Risk:** Transit Mode scope expands beyond launch needs. **Mitigation:** Trip Transit Default plus account-level default and walk-distance exception ship in MVP (walk, drive, transit only); defer Per-Hop Override unless PM pulls it forward.
- **Risk:** Map Tab causes Freeform Items to feel invisible. **Mitigation:** Keep itinerary as source of truth and frame Map Tab as located-item view.
- **Risk:** Schedule Conflict warnings become noisy. **Mitigation:** Gate on adjacent timed Located Items and use two-tier non-modal indicators.

## 13. Open Questions

### 13.1 PM Confirmation Before Epics

_All PM sequencing decisions resolved._

### 13.1 Architecture-Owned

1. Should Now Card open External Maps even when travel time is unavailable but Coordinates exist?
2. What data should be cached for distance/time estimates, and for how long?
3. Which provider and dependency should power Map Tab interaction?
4. What is the minimum viable Schedule Conflict threshold: strict travel time exceeds gap, or travel time plus buffer exceeds gap?
5. What launch latency target and monthly request budget should govern directions usage?

### 13.2 Post-MVP Product

8. Should Per-Hop Override ship after Day Route Strip, and where should its chip appear?

**Resolved MVP decision (amended 2026-07-13):** Transit Mode MVP ships Trip Transit Default plus an account-level global default and walk-distance exception (`users.transitMode`, `users.walkThresholdMeters`) — architecture pulled Q6/Q7 into MVP, reusing the existing currency-preference seed pattern; the threshold is user-configurable rather than a fixed PM-set value. Per-Hop Override (Q8) remains the only post-MVP product question.

## 14. Assumptions Index

- §4.1 FR-2: Browser-level permission prompts are user-initiated through the compact hint rather than shown automatically on page load.
- §4.1 FR-3: External Maps should remain available when directions calculation fails.
- §4.3 FR-6: Bike, ride share, ferry, and mixed-mode are out of MVP.
- §4.4 FR-11: Day Route Strip may ship before Map Tab.
- §4.6 FR-14: Neutral empty state is acceptable inside the deliberate Map Tab, unlike itinerary surfaces.
- §4.6 FR-15: Existing `?tab=map` convention remains preferred.
- §5 Privacy: MVP uses live location transiently for distance/time calculation.
