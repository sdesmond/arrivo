---
baseline_commit: 4699601dd56714da458fab483d0a5f4fe1fe57af
---

# Story 4.1: Show Day Route Strip for days with 2+ Located Items

Status: done

## Story

As a traveler planning a day with multiple located stops,
I want to see a route summary for that day,
so that I understand the overall distance and travel time before I'm on the ground.

## Acceptance Criteria

1. **Given** a day with 2+ Located Items
   **When** the Itinerary Day View renders
   **Then** a Day Route Strip appears showing route distance, travel time, and the effective Trip Transit Default

2. **Given** a day with 0–1 Located Items
   **When** the Itinerary Day View renders
   **Then** no Day Route Strip appears — no empty-state clutter

3. **Given** route data is being calculated
   **When** the strip first renders
   **Then** it shows a neutral skeleton thumbnail with no distance/time figures until resolved

4. **Given** the thumbnail
   **When** rendered
   **Then** it is a real 44×44px element signaling map availability (not detailed geography) — it may remain non-clickable or hidden until Map Tab ships (Epic 5 wires the actual deep-link)

5. **Given** the thumbnail's size
   **When** viewed at any viewport width
   **Then** it stays a fixed compact size — it never grows to fill available width on wider viewports; detailed inspection always happens in the Map Tab, never by enlarging the thumbnail itself

6. **And** the shared `route.ts` module's multi-hop day aggregation reuses the per-hop resolver from Epic 1 and the `route_cache` from Epic 2 — no duplicated fetch/compute logic

## Tasks / Subtasks

- [x] Task 1: Add `getDayRouteSummary` to `src/lib/route.ts` (AC: 1, 6)
  - [x] Subtask 1.1: Define `DayRouteSummary` type in `src/data/types.ts`: `{ status: "loading" } | { status: "ready"; totalDistanceMeters: number; totalDurationSeconds: number; hopCount: number } | { status: "unavailable" }`
  - [x] Subtask 1.2: Add `getDayRouteSummary(events: TripEvent[], tripTransitMode: TransitMode, walkThresholdMeters: number | null | undefined): Promise<DayRouteSummary>` to `src/lib/route.ts`
  - [x] Subtask 1.3: Filter events to those with `locationLat` and `locationLng` (Located Items), sort by `position`
  - [x] Subtask 1.4: Iterate adjacent pairs, resolve effective mode per hop via `resolveEffectiveMode`, call `getRouteDistanceTime` for each pair
  - [x] Subtask 1.5: If any hop returns `"unavailable"`, aggregate partial results where possible or return `"unavailable"` if no hops resolved
  - [x] Subtask 1.6: Sum `distanceMeters` and `durationSeconds` across all hops, return aggregate as `DayRouteSummary`
  - [x] Subtask 1.7: Add unit tests for `getDayRouteSummary` in `src/lib/route.test.ts` — cover: no located items, 1 located item, 2+ located items with all hops available, 2+ with some unavailable, hop count assertion

- [x] Task 2: Create `DayRouteStrip` component (AC: 1, 3, 4, 5)
  - [x] Subtask 2.1: Create `src/components/packt/day-route-strip.tsx` with `"use client"` at top
  - [x] Subtask 2.2: Define `DayRouteStripProps`: `summary: DayRouteSummary; tripId: string; dayNumber: number; tripTransitMode: TransitMode`
  - [x] Subtask 2.3: Render bordered `surface` card with `rounded.lg` styling: `border: "1px solid var(--line)"`, `borderRadius: 14`, `background: "var(--bg)"`
  - [x] Subtask 2.4: Render compact route thumbnail: `surface-2` background, `accent-brand` route line/active pins, `surface-3` inactive pins — use SVG similar to `mini-map-rail.tsx` but smaller, fixed 44×44px
  - [x] Subtask 2.5: When `summary.status === "loading"`, render skeleton thumbnail (surface-2 bg, no pins/route) and no distance/time figures
  - [x] Subtask 2.6: When `summary.status === "ready"`, render summary text: total distance + total duration (formatted as "X min" or "X hr Y min") + transit mode label
  - [x] Subtask 2.7: When `summary.status === "unavailable"`, render the strip with a muted "Route unavailable" message and no thumbnail route line
  - [x] Subtask 2.8: Thumbnail is a 44×44px div/button — not clickable yet (Epic 5 wires deep-link to Map Tab), but marked with `role="img"` and `aria-label` for accessibility
  - [x] Subtask 2.9: Strip renders below the day header, above the timeline items (inside `DayCardBody`)
  - [x] Subtask 2.10: Use `cn()` for className merging from `@/lib/utils`

- [x] Task 3: Create `DayRouteStrip` unit tests (AC: 1, 3, 4, 5)
  - [x] Subtask 3.1: Create `src/components/packt/day-route-strip.test.tsx`
  - [x] Subtask 3.2: Test loading state renders skeleton (no distance/time text visible)
  - [x] Subtask 3.3: Test ready state renders distance, duration, and transit mode text
  - [x] Subtask 3.4: Test unavailable state renders muted message
  - [x] Subtask 3.5: Test thumbnail is 44×44px minimum (`min-h-11 min-w-11`)
  - [x] Subtask 3.6: Test thumbnail has `role="img"` and `aria-label`

- [x] Task 4: Wire `DayRouteStrip` into `DayCardBody` (AC: 1, 2)
  - [x] Subtask 4.1: Add props to `DayCardBodyProps`: `tripId?: string; tripTransitMode?: TransitMode | null; walkThresholdMeters?: number | null`
  - [x] Subtask 4.2: Inside `DayCardBody`, compute located items count via `day.events.filter(e => e.locationLat != null && e.locationLng != null)`
  - [x] Subtask 4.3: If locatedItems.length >= 2, call `getDayRouteSummary` via server action and render `<DayRouteStrip>` between header and timeline
  - [x] Subtask 4.4: Use `useState`/`useEffect` or a custom hook to manage route summary loading state client-side
  - [x] Subtask 4.5: Pass through `tripId`, `tripTransitMode`, `walkThresholdMeters` from parent

- [x] Task 5: Thread props through `DayCard` and `TripItineraryView` (AC: 1, 2)
  - [x] Subtask 5.1: Add `tripId?: string; tripTransitMode?: TransitMode | null; walkThresholdMeters?: number | null` to `DayCardProps`
  - [x] Subtask 5.2: Pass these props to `<DayCardBody>` in `day-card.tsx`
  - [x] Subtask 5.3: Add same props to `TripItineraryViewProps`
  - [x] Subtask 5.4: Pass these props to `<DayCard>` in `trip-itinerary-view.tsx`
  - [x] Subtask 5.5: Thread from `page-client.tsx` → `trip-detail-tab-body.tsx` → `TripItineraryView` (if `tripId`/`transitMode`/`walkThresholdMeters` are available in the trip detail payload)

- [x] Task 6: Add server action for day route summary (AC: 1, 6)
  - [x] Subtask 6.1: Add `getDayRouteSummary` server action to `src/app/(app)/trips/[tripId]/route-actions.ts` — wraps the `route.ts` function with `requireUser()` + `assertTripAccess("viewer")`
  - [x] Subtask 6.2: Add unit test in `route-actions.test.ts` for the new action

- [x] Task 7: Add feature mapping for E2E segmentation (AC: 1)
  - [x] Subtask 7.1: Add `day-route-strip` entry to `FEATURE_MAP` in `tests/e2e/feature-map.mjs` with glob `src/components/packt/day-route-strip.tsx`
  - [x] Subtask 7.2: Create `tests/e2e/features/day-route-strip.feature` with `@feat:day-route-strip` tag and basic scenarios
  - [x] Subtask 7.3: Create `tests/e2e/steps/day-route-strip.steps.ts` with step definitions

- [x] Task 8: Run targeted Vitest tests (AC: 1-6)
  - [x] Subtask 8.1: `npx vitest run src/lib/route.test.ts` — all pass
  - [x] Subtask 8.2: `npx vitest run src/components/packt/day-route-strip.test.tsx` — all pass
  - [x] Subtask 8.3: `npx vitest run src/components/packt/day-card.test.tsx` — no regressions
  - [x] Subtask 8.4: `npx vitest run src/components/packt/day-card-body.test.tsx` — no regressions

- [x] Task 9: Run `packt-build-validator` (AC: 1-6)
  - [x] Subtask 9.1: lint, TypeScript, coverage, build, affected E2E
  - [x] Subtask 9.2: Fix any issues flagged
  - [x] Subtask 9.3: Re-run until PASS

### Review Findings

- [x] [Review][Patch] Partial-hop route totals render identically to fully-resolved totals — `DayRouteStrip` never reads `summary.hopCount`. FIXED: added `totalHopCount` prop (computed in `day-card-body.tsx` as `locatedEvents.length - 1`), prefixes distance with `~` when `summary.hopCount < totalHopCount`. [src/components/packt/day-route-strip.tsx; src/components/packt/day-card-body.tsx]
- [x] [Review][Patch] Day Route Strip never appears for trips with `transitMode: null`, violating AC1 — REOPENED after initial dismissal: dismissed first based on the app's own `trips/actions.ts` creation path always resolving a non-null value, but the new positive-path E2E scenario (added for this same review) proved a second real path exists — `tests/e2e/scenario-fixture.ts`'s `createTrip` fixture never set `transitMode` on insert, and the DB column has no default, so every E2E-seeded trip had `transitMode: null`. FIXED both sides: added the `?? TransitMode.Drive` fallback in `trip-detail-tab-body.tsx:173` (matching `now-card.tsx`'s existing convention, with a new `trip-detail-tab-body.test.tsx` case), and set `transitMode: TransitMode.Drive` as the default on all three E2E trip mothers plus the fixture's insert fallback, so seeded trips accurately reflect real production data shape. [src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx; tests/e2e/e2e-seed-data.ts; tests/e2e/scenario-fixture.ts]
- [x] [Review][Patch] Unhandled promise rejection in the route-summary fetch — the `useEffect` in `DayCardBody` calls `getDayRouteSummary(...).then(...)` with no `.catch()`; any rejection (auth failure, network error) becomes an unhandled rejection instead of degrading to `{status:"unavailable"}`. FIXED: added `.catch()` falling back to `{status:"unavailable"}`, plus a rejection test in `day-card-body.test.tsx`. [src/components/packt/day-card-body.tsx]
- [x] [Review][Patch] New `getDayRouteSummary` server action has no access-denial test — its sibling `getRouteDistanceTime` in the same file asserts the delegate isn't called when `assertTripAccess` denies; the new action only tests the success path. FIXED: added denial test (and a `beforeEach(vi.clearAllMocks)` the describe block was missing). [src/app/(app)/trips/[tripId]/route-actions.test.ts]
- [x] [Review][Patch] E2E coverage only exercises the negative case (AC2) — no scenario covers AC1 (strip actually appearing with distance/time/mode for a day with 2+ located items), despite Task 7 and Testing Requirements calling for "basic scenarios" (plural). Per project testing-first gate, this is a blocking gap. FIXED: added `@trip-with-located-events`-tagged scenario using the existing Object Mother pattern (two located `EventSeed`s on day 1), asserting the strip is visible via `data-testid="day-route-strip"` rather than exact distance/duration text (which would depend on live Mapbox access in the test env). [tests/e2e/features/day-route-strip.feature; tests/e2e/steps/day-route-strip.steps.ts]
- [x] [Review][Patch] The one E2E step assertion that exists only checks `page.getByText("Route unavailable")` has zero count, so it would still pass if the strip incorrectly rendered in "loading" or "ready" state for a day with <2 located items. FIXED: added `data-testid="day-route-strip"` to the component root and switched the assertion to `page.getByTestId("day-route-strip")).toHaveCount(0)`. [src/components/packt/day-route-strip.tsx; tests/e2e/steps/day-route-strip.steps.ts]
- [x] [Review][Patch] Subtask 1.7's required test matrix isn't fully covered — missing a genuine "1 located item" case (the existing test uses an item with no location at all) and a "2+ located items, all hops available" success-path case; only the 0-located and mixed-success/failure cases are tested. FIXED: added both cases. [src/lib/route.test.ts]
- [x] [Review][Patch] `formatDistance` is reimplemented in `day-route-strip.tsx` with different rounding rules than the existing `formatDistance` in `distance-time-pill.tsx` (`toFixed(1)` always vs. `toLocaleString` with magnitude-based fraction digits), producing inconsistent distance formatting between two nearby travel-distance UI elements. The story's own Dev Notes anticipated reuse via `@/lib/utils` — no such export exists there. FIXED: extracted `distance-time-pill.tsx`'s version into `src/lib/utils.ts`, both components now import it, added `utils.test.ts` coverage. Verified `day-route-strip.test.tsx`'s existing "1.3 km" assertion still passes. [src/lib/utils.ts; src/components/packt/day-route-strip.tsx; src/components/packt/distance-time-pill.tsx]
- [x] [Review][Dismiss] ~~Located-events sort has no tie-break for equal `position` values~~ — reviewers' cited evidence didn't hold up: the two same-`position` events in the existing `route.test.ts` case ("freeform" and "second") aren't both located items — "freeform" has no `locationLat`/`locationLng` and is filtered out of `locatedEvents` before the sort runs, so no genuine tie exists in that test today. No evidence this is reachable in practice (position is presumably kept unique by the app's own reorder logic elsewhere); not worth a defensive patch without a real repro.
- [x] [Review][Defer] `walkThresholdMeters` is threaded through every component layer but never supplied a real value — `trip-detail-tab-body.tsx` never passes it, and it isn't even a field on the `Trip` type (only on `UserProfile`); no file in the codebase currently reads `userProfile.walkThresholdMeters` into any route calculation. Not a regression from this story (the setting has been unwired since it was added), but `resolveEffectiveMode`'s walk-distance override is a permanent no-op until a future story threads the user's preference into the trip detail payload. [src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx] — deferred, pre-existing
- [x] [Review][Defer] `getDayRouteSummary` server action accepts client-supplied `events` without validating them against the trip's stored events, letting a viewer of any trip submit fabricated coordinates to trigger Directions API/`route_cache` lookups. Mirrors the exact pre-existing pattern in the sibling `getRouteDistanceTime` action in the same file. [src/app/(app)/trips/[tripId]/route-actions.ts] — deferred, pre-existing
- [x] [Review][Defer] `getDayRouteSummary` awaits hops sequentially with no cap or `AbortController` — a day with many located items serializes N-1 round trips; unmounting only suppresses the state update, not in-flight requests. Low real-world impact given typical day sizes and `route_cache` bounding repeat cost. [src/lib/route.ts] — deferred, low priority
- [x] [Review][Defer] New `getStraightLineDistanceMeters` haversine helper estimates hop distance before the real route is known, to pick a per-hop transit mode. Verified not a duplicate — `resolveEffectiveMode` had zero production call sites before this diff. Reasonable proxy, but can misassign mode when road distance diverges from straight-line distance; currently moot since `walkThresholdMeters` is always undefined (see above), so every hop resolves to the raw trip mode regardless. Revisit once `walkThresholdMeters` is wired. [src/lib/route.ts] — deferred, currently inert
- [x] [Review][Defer] Inconsistent null-check style in the same file — located-item filtering uses `!= null`, the strip's render gate uses plain truthy `&&`. Cosmetic; no functional difference given current prop types. [src/components/packt/day-card-body.tsx] — deferred, cosmetic
- [x] [Review][Defer] The route-summary `useEffect`'s dependency array includes both the derived `routeSummaryKey` string and the `locatedEvents` array reference; a parent re-render producing a new but content-identical `day.events` reference re-fires the fetch even though nothing meaningful changed. No visible symptom (the render gate is keyed off the string), just a wasted background request. [src/components/packt/day-card-body.tsx:643] — deferred, low priority

## Dev Notes

### Previous Story Intelligence

**Story 3.2 (done):** Resized all PlaceRowActionBar chips to 44×44px. Added `h-11` class and widened `px-2` → `px-3` on Time, Cost, Docs, Attach buttons. Post-review follow-up unified filled-location button into one accent-filled `ButtonGroup` pill and widened inter-chip gap from `gap-1` to `gap-2`.

**Story 3.1 (done):** Split `place-row.tsx` into smaller components (extracted `place-row-linked-event.tsx`). Installed shadcn `button-group.tsx`. Restructured Address chip into two-segment ButtonGroup with `onOpenMaps` callback. Post-review fix restored accent-soft/accent-ink filled styling on ButtonGroup segments.

**Key learnings from Epic 3:**
- `ButtonGroup` is now installed at `src/components/ui/button-group.tsx`
- `place-row.tsx` is ~360 lines after split
- `openExternalMaps` utility at `src/lib/open-external-maps.ts` — reuse, never duplicate
- Filled pill styling uses inline `style` with `var(--accent-soft)` / `var(--accent-ink)` and `borderColor: "transparent"`

### Architecture Constraints

- **Shared route module:** `src/lib/route.ts` owns ALL route calculations. No component or action queries `route_cache` or calls Directions API directly. This story adds `getDayRouteSummary` to the same file.
- **Per-hop resolution:** Each hop resolves transit mode via `resolveEffectiveMode(hopDistanceMeters, tripTransitMode, walkThresholdMeters)` from Epic 1 — never read `tripTransitMode` directly in UI.
- **`RouteResult` discriminated union:** Every route lookup returns `{status:"loading"} | {status:"ready", distanceMeters, durationSeconds} | {status:"unavailable"}`. The Day Route Strip's aggregate is `DayRouteSummary` following the same pattern.
- **`route_cache` reuse:** Multi-hop aggregation reads/writes through the same cache table (keyed by origin/destination/mode) — no new cache tables.
- **Server-only route data:** All Directions API calls happen server-side only. Client components call server actions to fetch route data.
- **Thumbnail approach deferred:** Architecture defers the Day Route Strip thumbnail rendering technique to story-creation time. The existing `src/app/api/mapbox/static/route.ts` static-image proxy exists but is currently unused — evaluate reuse vs. a simple SVG approach. For this story, use a compact SVG similar to `mini-map-rail.tsx`'s thumbnail (no external API dependency).

- **Distance/duration storage:** Plain integer columns (`distance_meters`, `duration_seconds`) — NOT the numeric-string currency convention.

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/components/packt/day-route-strip.tsx` | Day Route Strip component — bordered card with route thumbnail + summary text |
| `src/components/packt/day-route-strip.test.tsx` | Unit tests for DayRouteStrip |
| `tests/e2e/features/day-route-strip.feature` | E2E scenarios for Day Route Strip visibility |
| `tests/e2e/steps/day-route-strip.steps.ts` | E2E step definitions |

### Files to MODIFY

| File | Changes |
|------|---------|
| `src/data/types.ts` | Add `DayRouteSummary` type |
| `src/lib/route.ts` | Add `getDayRouteSummary()` function — multi-hop day aggregation using existing `getRouteDistanceTime` and `resolveEffectiveMode` |
| `src/lib/route.test.ts` | Add tests for `getDayRouteSummary` |
| `src/app/(app)/trips/[tripId]/route-actions.ts` | Add `getDayRouteSummary` server action with auth |
| `src/app/(app)/trips/[tripId]/route-actions.test.ts` | Add tests for new server action |
| `src/components/packt/day-card.tsx` | Pass `tripId`, `tripTransitMode`, `walkThresholdMeters` props to DayCardBody |
| `src/components/packt/day-card-body.tsx` | Render `<DayRouteStrip>` between header and timeline when ≥2 located items; manage route summary loading state |
| `src/components/packt/day-card-body.test.tsx` | Add tests for DayRouteStrip integration |
| `src/components/packt/day-card.test.tsx` | Add tests for new props passthrough |
| `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` | Pass `tripId`, `tripTransitMode`, `walkThresholdMeters` to DayCard |
| `tests/e2e/feature-map.mjs` | Add `day-route-strip` entry to FEATURE_MAP |

### Files NOT to touch

- `src/components/packt/distance-time-pill.tsx` — Epic 2 scope, unaffected
- `src/components/packt/now-card.tsx` — Now Card scope, unaffected
- `src/components/packt/place-row-action-bar.tsx` — Action bar scope, unaffected
- `src/components/packt/place-row.tsx` — PlaceRow scope, unaffected
- `src/components/packt/map-tab.tsx` — Epic 5 scope, not yet built
- `src/components/packt/getting-around-section.tsx` — Epic 1 scope, unaffected
- `src/db/schema.ts` — No schema changes (route_cache already exists from Epic 1)
- `src/lib/open-external-maps.ts` — Utility unchanged, just consumed elsewhere

### Existing Patterns to Follow

**Route calculation pattern (`route.ts`):**
```ts
export async function getRouteDistanceTime(
  origin: GeoCoords,
  destination: GeoCoords,
  transitMode: TransitMode
): Promise<RouteResult> {
  // 1. Check route_cache
  // 2. Call Mapbox Directions API if cache miss
  // 3. Store in route_cache
  // 4. Return RouteResult
}
```

**Server action pattern (`route-actions.ts`):**
```ts
"use server";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { getRouteDistanceTime as getRoute } from "@/lib/route";

export async function getRouteDistanceTime(
  tripId: string, origin: GeoCoords, destination: GeoCoords, transitMode: TransitMode
): Promise<RouteResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "viewer");
  return getRoute(origin, destination, transitMode);
}
```

**DayRouteStrip card styling (from DESIGN.md + mini-map-rail.tsx reference):**
```tsx
<div style={{
  border: "1px solid var(--line)",
  borderRadius: 14,
  background: "var(--bg)",
  padding: "12px 14px",
}}>
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    {/* 44×44 thumbnail */}
    <div style={{
      width: 44, height: 44,
      background: "var(--surface-2)",
      borderRadius: 8,
      flexShrink: 0,
    }}>
      <svg>...</svg>
    </div>
    {/* Summary text */}
    <div>
      <span style={{ color: "var(--fg)", fontWeight: 600 }}>12 km</span>
      <span style={{ color: "var(--fg-3)" }}> · 25 min · drive</span>
    </div>
  </div>
</div>
```

**Skeleton loading pattern (from day-card-header.tsx):**
```tsx
{status === "loading" && (
  <div style={{ background: "var(--surface-2)", borderRadius: 8, width: 44, height: 44 }} />
)}
```

### Key Gotchas

1. **DayRouteSummary is NOT RouteResult.** `RouteResult` is per-hop (origin→destination). `DayRouteSummary` is the aggregate across all hops in a day. Both follow the discriminated-union pattern but have different shapes.

2. **Located Items = events with `locationLat` AND `locationLng` set.** Freeform Items have neither. The filter is `e.locationLat != null && e.locationLng != null`.

3. **Sort by `position` before computing hops.** Events within a day are ordered by their `position` field. The route is computed between consecutive positioned Located Items, skipping Freeform Items in between.

4. **Partial availability.** If one hop fails but others succeed, the strip should still show aggregated data for the successful hops. Only return `"unavailable"` if zero hops resolved. The `hopCount` in `DayRouteSummary` tells the UI how many hops were successfully computed.

5. **The strip sits between the header and timeline.** In `DayCardBody`, render it after the opening `<div className="p-3 flex flex-col">` but before `<DayCardDnd>`. It should be visually distinct from the timeline items.

6. **Trip props must thread through 3 levels:** `page-client.tsx` → `trip-detail-tab-body.tsx` → `TripItineraryView` → `DayCard` → `DayCardBody`. Check each level has the prop in its interface.

7. **Distance formatting.** Use `formatDistance` from `@/lib/utils` if available, or format inline: `totalDistanceMeters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m``. Duration: `totalDurationSeconds >= 3600 ? `${Math.floor(secs / 3600)} hr ${Math.round((secs % 3600) / 60)} min` : `${Math.round(secs / 60)} min``.

8. **Transit mode label.** Map `TransitMode` to display text: `walk → "walk"`, `drive → "drive"`, `transit → "transit"`. Lowercase, factual voice per EXPERIENCE.md voice rules.

9. **44×44px thumbnail is NOT clickable yet.** The thumbnail signals map availability (FR-11) but the deep-link to Map Tab ships in Epic 5 (Story 5.3). Use `role="img"` with `aria-label` rather than a button/link.

10. **`getDayRouteSummary` is async.** It calls `getRouteDistanceTime` which is async (DB + fetch). The component must handle the loading→ready/unavailable transition via state.

### Testing Requirements

- **Unit tests** (Vitest): colocated `*.test.tsx` next to source
  - `src/lib/route.test.ts` — add tests for `getDayRouteSummary`
  - `src/components/packt/day-route-strip.test.tsx` — component rendering tests
  - `src/components/packt/day-card-body.test.tsx` — integration tests for strip rendering
  - `src/components/packt/day-card.test.tsx` — prop passthrough tests
- **E2E tests** (playwright-bdd): add `day-route-strip.feature` for basic visibility scenarios
- Coverage threshold: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- Run targeted tests first, then `packt-build-validator` for full validation

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Epic 4, Story 4.1 (lines 385-413)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — Day Route Strip in New & Modified Files (line 227-228), Shared calculation module (line 207-209), route_cache (line 112-129)
- UX Design: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/DESIGN.md` — `day-route-strip` component spec (lines 76-85)
- UX Experience: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md` — Day Route Strip component pattern (line 60), State Patterns (lines 76-82), Interaction Primitives (line 99)
- Previous stories: `_bmad-output/implementation-artifacts/3-1-filled-address-opens-external-maps-directly.md`, `3-2-resize-action-bar-chips-to-meet-interactive-sizing-minimum.md`
- Route module: `src/lib/route.ts` — existing `getRouteDistanceTime` and `resolveEffectiveMode`
- Project context: `_bmad-output/project-context.md` — styling conventions, testing standards, 44×44px rule

## Dev Agent Record

### Agent Model Used


### Debug Log References

- `npx vitest run src/lib/route.test.ts src/components/packt/day-route-strip.test.tsx src/app/(app)/trips/[tripId]/route-actions.test.ts src/components/packt/day-card-body.test.tsx src/components/packt/day-card.test.tsx`
- `npm run lint`; `npx tsc --noEmit`; `npm run test:coverage`; `npm run test:e2e:affected`; `NEXT_DISTDIR=.next-validate npm run build`

### Completion Notes List

- Added cached multi-hop day route aggregation with partial-hop handling and secured server action.
- Added accessible fixed 44×44px route strip states and threaded route inputs through itinerary cards.
- Added route strip unit, integration, and E2E coverage; full validation passed.

### File List

- _bmad-output/implementation-artifacts/4-1-show-day-route-strip-for-days-with-2-plus-located-items.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/data/types.ts
- src/lib/route.ts
- src/lib/route.test.ts
- src/app/(app)/trips/[tripId]/route-actions.ts
- src/app/(app)/trips/[tripId]/route-actions.test.ts
- src/components/packt/day-route-strip.tsx
- src/components/packt/day-route-strip.test.tsx
- src/components/packt/day-card-body.tsx
- src/components/packt/day-card-body.test.tsx
- src/components/packt/day-card.tsx
- src/components/packt/day-card.test.tsx
- src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx
- src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx
- tests/e2e/feature-map.mjs
- tests/e2e/features/day-route-strip.feature
- tests/e2e/steps/day-route-strip.steps.ts

### Change Log

- 2026-07-15: Implemented Day Route Strip with route aggregation, server action, UI states, and test coverage.
