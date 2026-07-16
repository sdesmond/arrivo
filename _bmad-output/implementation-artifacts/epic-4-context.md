# Epic 4 Context: Day Route Strip & Schedule Conflict Awareness

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Users planning a day with 2+ located stops see a route summary (Day Route Strip) and get warned — via a day-level badge and a row-level icon — when travel time between stops doesn't fit the scheduled gap. This turns the itinerary from a flat list of times into something that surfaces unrealistic plans before the traveler is on the ground, without ever interrupting them with a modal.

## Stories

- Story 4.1: Show Day Route Strip for days with 2+ Located Items
- Story 4.2: Detect and surface Schedule Conflicts

## Requirements & Constraints

- **Day Route Strip trigger:** appears only on a day with 2+ Located Items (Event/Reservation with Coordinates); days with 0–1 render no strip — no empty-state clutter.
- **Strip content:** route distance, travel time, and the effective Trip Transit Default for that day, computed from Located Items only. Freeform Items (no Coordinates) never factor into route/conflict math and never show a "missing location" nudge.
- **Loading state:** neutral skeleton fill/thumbnail while route data is pending — never stale, zero, or dashed values.
- **Thumbnail:** a real 44×44px tap target signaling map availability, not detailed geography. Can ship non-clickable/hidden until Map Tab (Epic 5) exists; Epic 5 wires the actual deep-link to a day-scoped Map Tab. Fixed compact size at any viewport — never enlarges; detailed inspection always happens in Map Tab.
- **Schedule Conflict rule (buffer model):** flag a conflict when `travel_time + 10 minutes > scheduled_gap`, evaluated between two adjacent timed Located Items on the same day. Fixed 10-minute buffer, uniform across all transit modes for MVP (absorbs Directions API estimate variance; strict `travel_time > scheduled_gap` was rejected as too noisy). A Freeform Item adjacent to a Located Item never triggers or displays a route-based conflict.
- **Day-level badge:** shows once per day, summarizing conflict count; icon + word always paired (never color alone); never shown at zero conflicts — silence is the neutral signal.
- **Row-level icon:** appended after the Time chip on the specific affected row only.
- **Live-region behavior:** when an in-page edit (time change, reorder, or transit-mode change) flips conflict status, the badge/icon appearance or disappearance is wrapped in `aria-live="polite"`. Passive distance/time ticking elsewhere is never wrapped in a live region — this distinction is load-bearing, don't blanket-apply `aria-live`.
- **Accessibility floor:** 44×44px minimum on both axes for the strip's thumbnail; WCAG 2.2 AA.
- **Reliability:** any route/distance calculation failure degrades gracefully (existing itinerary behavior + direct External Maps access wherever Coordinates exist) — never blocks the surface. Never a thrown error.
- **Voice:** plain, factual microcopy — e.g. "1 tight connection today," not "Uh oh, your schedule looks tight!"

## Technical Decisions

- All route/distance reads go through the shared `src/lib/route.ts` module — no component or action queries `route_cache` or calls the Directions API directly. This epic's multi-hop day aggregation and conflict evaluation reuse the per-hop `resolveEffectiveMode` resolver (built in Epic 1) and the `route_cache`-backed lookups (added in Epic 2) rather than duplicating fetch/compute logic.
- Results flow through the shared `RouteResult` discriminated union: `{status:"loading"} | {status:"ready", distanceMeters, durationSeconds} | {status:"unavailable"}` — this is what makes the skeleton/resolved/degraded states consistent across surfaces.
- Trip Transit Default's per-hop resolver is a hard dependency of both stories in this epic — neither the route summary nor conflict detection can compute correctly without it.
- New/modified files: `src/components/packt/day-route-strip.tsx` + test [NEW]; `src/components/packt/place-row.tsx` + test [MODIFY, Schedule Conflict row icon]; wiring into the day view happens via `trip-detail-tab-body.tsx` + test [MODIFY].
- Schedule Conflict row icon mirrors the existing `TabStatusIcon` accessibility pattern: icon is `aria-hidden`, a visually-hidden `sr-only` span carries the text so the row's accessible name becomes e.g. "Time, Schedule conflict."
- Day badge follows the budget tab's `status-badge` pattern (`warning-soft`/`warning-ink`, `rounded.full`) — reuses the existing `warning` semantic color family rather than inventing a new one. Unlike the row icon, the day badge's count text itself is the visible/accessible name; the icon stays `aria-hidden` with no extra `sr-only` span.
- Day Route Strip card: bordered `surface`, `rounded.lg` (matches `chart-card` and other bordered surface cards). Thumbnail: `surface-2` background, `accent-brand` route line/active pins, `surface-3` inactive pins.
- Open/deferred (not blocking this epic): whether the existing unused `src/app/api/mapbox/static/route.ts` static-image proxy gets reused for the thumbnail, vs. a new approach — resolvable at story-creation/implementation time.
- Request deduplication for overlapping same-hop lookups when Day Route Strip and Schedule Conflict both request the same hop on one page render is a reasonable candidate for React's `cache()`, not required by architecture.
- `route.ts`, `transit-actions.ts` are server-only; this epic introduces no new client-only geolocation surface (that's Epic 2).

## UX & Interaction Patterns

- Located Item = Event/Reservation with Coordinates; Freeform Item = without. This distinction gates every rule in this epic.
- Colors: `warning`/`warning-soft`/`warning-ink` for both conflict indicators (never a new semantic color); `accent-brand` for route line and active pins in the thumbnail; `surface-2`/`surface-3`/`fg-3` for neutral/inactive states.
- Icon: `lucide:triangle-alert`, stroke-width 1.5, for both row icon and day badge.
- Do: pair every Schedule Conflict indicator with icon + word. Don't: rely on `warning` color alone.
- Do: show a neutral skeleton fill on the Day Route Strip thumbnail while pending. Don't: show stale/zero/placeholder-dash values mid-calculation.
- Reference flow (UJ-3, from EXPERIENCE.md): day with two timed, adjacent Located Items and tight timing → strip renders with distance/time/mode → conflict detected → day badge ("1 tight connection today") + row-level icon on the specific affected row, no modal → user adjusts start time, reorders, or changes Trip Transit Default → conflict clears on next render.
- Composition reference mock: `mockups/day-route-strip.html` (covers both the strip and the conflict indicators).

## Cross-Story Dependencies

- Depends on Epic 1 (Story 1.1's `resolveEffectiveMode` per-hop resolver and seeded `trips.transitMode`) and Epic 2 (Story 2.1's live `route.ts` Directions API integration, `route_cache` read/write, and `RouteResult` union) — both must exist before this epic's day-level aggregation and conflict math can run.
- Epic 5 (Map Tab) wires the actual deep-link from the Day Route Strip thumbnail (Story 5.3); until then the thumbnail may ship non-clickable/hidden per Story 4.1's acceptance criteria.
- Within this epic, Story 4.2 (conflict detection) builds on the same day-level route aggregation Story 4.1 introduces for the strip — no separate aggregation logic should be built twice.
