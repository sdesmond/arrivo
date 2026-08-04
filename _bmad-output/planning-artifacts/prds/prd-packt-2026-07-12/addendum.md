# PRD Addendum: Location-Aware Itinerary

## Source Scope

Primary scope source:

- `_bmad-output/brainstorming/brainstorming-session-2026-07-11-1818.md`

Other local context can inform consistency but should not expand product scope.

## Technical Notes For Architecture

- Existing brainstorming notes say Addresses already capture latitude/longitude through Mapbox autocomplete on events and reservations.
- Existing brainstorming notes say current display is plain text only.
- Existing brainstorming notes say Map tab exists as placeholder.
- Existing brainstorming notes say Mapbox static-image proxy route exists but is unused.
- Existing brainstorming notes say no interactive map library is installed.
- Existing brainstorming notes identify `now-card.tsx` as having a hardcoded unused distance placeholder.
- Existing brainstorming notes identify `RailPanel` family as dead code and not a layout constraint.
- Direction provider, live location flow, request caching, and rate limits require architecture validation before story breakdown.

## Rejected Ideas

- Silent location inference from Event or Reservation title text.
- Static map preview popover for Address pill.
- Adaptive learning from Per-Hop Overrides.

## Parked Ideas

- Location-optimized accommodation search.
- Advanced routing modes beyond walk, drive, and transit.
- In-app turn-by-turn navigation.

## Source Build Sequence

Brainstorming source recommended:

1. Theme 1: Now Card rework.
2. Theme 3: Getting Around section.
3. Theme 2: Shared distance calculation, Day Route Strip, conflict badges.
4. Theme 4: Address pill state-flip, shippable any time.
5. Theme 4: Map Tab with day selector.

PRD draft recommends moving Address pill state-flip earlier because it is low-dependency and clarifies map access.
