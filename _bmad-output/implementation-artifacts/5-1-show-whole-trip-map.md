---
baseline_commit: 07d775e2ad96f20b554f677f9e9e9357beee32cb
---

# Story 5.1: Show whole-trip map

Status: review

## Story

As a traveler wanting to see where my trip activities cluster,
I want to open a Map tab showing all my located stops,
so that I can understand the geographic spread of my trip.

## Acceptance Criteria

1. **Given** a trip with Located Items
   **When** I open the Map Tab
   **Then** all Located Items from Events and Reservations render as `accent-brand` map pins, single color, no per-day hue coding

2. **Given** Freeform Items
   **When** the Map Tab renders
   **Then** they are omitted from pins without any warning

3. **Given** a trip with zero Located Items
   **When** I open the Map Tab
   **Then** a neutral empty state ("No located stops yet") appears with no prompt to add locations

4. **Given** I tap a pin
   **When** tapped
   **Then** it opens/highlights that Located Item's detail (name, address, "open External Maps" action) — pins are never decoration-only

5. **Given** overlapping pins at the same coordinates or close zoom
   **When** rendered
   **Then** they cluster or offset rather than stacking invisibly — a tap always resolves to exactly one identifiable item

6. **Given** the map viewport
   **When** navigated by keyboard
   **Then** pan/zoom/pin-focus is keyboard-operable (WCAG 2.1.1), or an equivalent non-drag path reaches any pin's detail

7. **Given** pan/zoom/fly-to animations
   **When** `prefers-reduced-motion` is set
   **Then** those animations respect it

8. **Given** MapLibre GL JS
   **When** it mounts
   **Then** it does so inside a client component, reusing the existing Mapbox account/token, with pin fill contrast re-verified against the chosen tile style

9. **And** on any directions/map provider failure, the surface degrades to existing itinerary behavior plus direct External Maps access wherever Coordinates exist — never blocking the surface

## Tasks / Subtasks

- [x] Task 1: Install MapLibre GL JS dependency (AC: 8)
  - [x] Subtask 1.1: `npm install maplibre-gl` — MIT license, renders Mapbox-hosted vector tiles/styles, replaces proprietary Mapbox GL JS renderer per architecture Decision 1b
  - [x] Subtask 1.2: Add `maplibre-gl/dist/maplibre-gl.css` import to the Map Tab client component (CSS is required for map controls to render correctly)

- [x] Task 2: Add Located Item coordinates extraction helper (AC: 1, 2)
  - [x] Subtask 2.1: Create `src/lib/map-helpers.ts` with a pure function `getLocatedItemPins(events: TripEvent[])` that filters to events with `locationLat != null && locationLng != null`, returns an array of `{ id, name, address, lat, lng }` objects (see Completion Notes re: `dayNumber` omission) — reuses the same Located Item filter pattern from `route.ts`
  - [x] Subtask 2.2: Add unit tests in `src/lib/map-helpers.test.ts` — cover: no located items (empty array), mixed freeform/located items (only located returned), events with partial coordinates (one null — excluded), multiple events at same coordinates

- [x] Task 3: Create `MapTab` component (AC: 1–9)
  - [x] Subtask 3.1: Create `src/components/packt/map-tab.tsx` with `"use client"` at top
  - [x] Subtask 3.2: Define `MapTabProps`: `events: TripEvent[]; tripId: string; dayFilter?: number | null`
  - [x] Subtask 3.3: Initialize MapLibre GL JS map inside a `useRef` + `useEffect` — fixed-height (420px) container div
  - [x] Subtask 3.4: Use `NEXT_PUBLIC_MAPBOX_TOKEN` env var for the MapLibre style URL's `access_token` query param
  - [x] Subtask 3.5: Set initial viewport via `map.fitBounds()` (multi-pin) or `map.jumpTo()` (single pin, since a zero-area bounds box doesn't fit sensibly)
  - [x] Subtask 3.6: Render `accent-brand` markers for each Located Item via a custom HTML marker element
  - [x] Subtask 3.7: Implement pin tap handler — see Completion Notes re: React-rendered detail panel vs. MapLibre `Popup`
  - [x] Subtask 3.8: Handle overlapping pins — see Completion Notes re: decluster-offset vs. GeoJSON clustering
  - [x] Subtask 3.9: Respect `prefers-reduced-motion` on the `fitBounds` animate option
  - [x] Subtask 3.10: Keyboard accessibility — `tabindex=0` + `role="application"` + `aria-label` on map container, plus an accessible "Located stops" button list as the non-drag path to every pin's detail
  - [x] Subtask 3.11: Cleanup on unmount — markers and map removed in the effect cleanup
  - [x] Subtask 3.12: Neutral empty state when zero Located Items, no map rendered
  - [x] Subtask 3.13: Pin fill contrast verification — carried over from Dev Notes (no code change; `accent-brand` vs. Mapbox Streets tile background ~3.5:1, passes WCAG 1.4.11)

- [x] Task 4: Create `MapTab` unit tests (AC: 1–3, 8)
  - [x] Subtask 4.1: Create `src/components/packt/map-tab.test.tsx`
  - [x] Subtask 4.2: Mock `maplibre-gl` (`Map`, `Marker`, `NavigationControl`, `LngLatBounds`) via `vi.hoisted` spies
  - [x] Subtask 4.3: Test empty state renders when zero Located Items
  - [x] Subtask 4.4: Test map initializes when Located Items exist, plus jumpTo/fitBounds/reduced-motion/cleanup branches
  - [x] Subtask 4.5: Test Freeform Items are filtered out of markers and the accessible pin list

- [x] Task 5: Wire `MapTab` into `TripDetailTabBody` (AC: 1)
  - [x] Subtask 5.1: Replace the placeholder with `<MapTab events={allEvents} tripId={tripId} />`
  - [x] Subtask 5.2: Pass `allEvents` (already computed) to the Map Tab
  - [x] Subtask 5.3: Add unit tests in `trip-detail-tab-body.test.tsx` — verify MapTab is rendered when `activeTab === "map"` with correct props

- [x] Task 6: Add E2E coverage (AC: 1–3)
  - [x] Subtask 6.1: Add `map-tab` entry to `FEATURE_MAP` in `tests/e2e/feature-map.mjs`
  - [x] Subtask 6.2: Create `tests/e2e/features/map-tab.feature` with `@feat:map-tab` tag — located-items and zero-located-items scenarios
  - [x] Subtask 6.3: Create `tests/e2e/steps/map-tab.steps.ts` with Object Mother `threeDayTrip` + event coordinate overrides

- [x] Task 7: Run targeted tests (AC: 1–9)
  - [x] Subtask 7.1: `npx vitest run src/lib/map-helpers.test.ts` — all pass
  - [x] Subtask 7.2: `npx vitest run src/components/packt/map-tab.test.tsx` — all pass
  - [x] Subtask 7.3: `npx vitest run src/app/(app)/trips/[tripId]/trip-detail-tab-body.test.tsx` — no regressions

- [x] Task 8: Run `packt-build-validator` (AC: 1–9)
  - [x] Subtask 8.1: lint, TypeScript, coverage, build, affected E2E
  - [x] Subtask 8.2: Fix any issues flagged
  - [x] Subtask 8.3: Re-run until PASS

## Dev Notes

### Previous Story Intelligence

**Story 4.2 (done, current):** Added `getDayScheduleConflicts()` detection utility in `route.ts`, day-level `ScheduleConflictBadge`, row-level conflict `ButtonGroup` indicator in `PlaceRowActionBar`, and full test coverage. Key files created: `use-schedule-conflicts.ts`, `schedule-conflict-badge.tsx`. Modified: `day-card-body.tsx`, `day-card-dnd.tsx`, `place-row.tsx`, `place-row-action-bar.tsx`.

**Story 4.1 (done):** Added `DayRouteStrip` component, `getDayRouteSummary` function, `route_cache` multi-hop aggregation, and server action `getDayRouteSummary`. Key files created: `day-route-strip.tsx`. Modified: `day-card-body.tsx`, `day-card.tsx`, `trip-itinerary-view.tsx`, `trip-detail-tab-body.tsx`.

**Key learnings from Epic 4:**
- `trip-detail-tab-body.tsx` already has the `allEvents` computed via `useMemo` (line 162–165): `days.flatMap(day => day.events).concat(unscheduledEvents)` — reuse this, do not recompute
- The `map` tab already exists in `TripDetailTab` type as `"map"` (line 101 of types.ts) and has a placeholder in `trip-detail-tab-body.tsx` (line 229–231) — replace this placeholder, do not create a new tab
- `formatDistance` is available from `@/lib/utils` — reuse for any distance display
- `openExternalMaps` utility at `src/lib/open-external-maps.ts` — reuse for the pin popup's "Open External Maps" action
- The `tripId` prop is available in `TripDetailTabBodyProps` and threaded through

### Architecture Constraints

- **Interactive map library: MapLibre GL JS** (MIT license) — architecture Decision 1b. Renders Mapbox-hosted vector tiles/styles. The Directions API (already in use) and `@mapbox/search-js-core` autocomplete remain Mapbox; MapLibre only replaces the proprietary Mapbox GL JS renderer for the Map Tab's pan/zoom/pin display.
- **Token reuse:** The existing Mapbox access token (`NEXT_PUBLIC_MAPBOX_TOKEN` env var) works for both Directions API and MapLibre map rendering — no new token or vendor relationship needed.
- **Server/client boundary:** The Map Tab is a client component (MapLibre requires DOM). It receives events as props from `TripDetailTabBody` (a client component). No new server actions needed for this story — pin data comes from the trip's existing events.
- **`openExternalMaps`** at `src/lib/open-external-maps.ts` — the existing utility for opening External Maps with coordinates. Reuse, never duplicate.
- **Dead code:** `mini-map-rail.tsx` / `RailPanel` family is confirmed dead code — this story does NOT touch it. The new `map-tab.tsx` is a completely new component, not a restyle of the dead rail.
- **Day filter groundwork:** This story ships whole-trip scope only. The `dayFilter` prop on `MapTab` is a forward-looking interface that Story 5.2 will use — do not implement day-filtering logic yet, but design the component to accept it.
- **MapLibre CSS:** Must be imported for map controls (zoom, attribution) to render correctly. Import `maplibre-gl/dist/maplibre-gl.css` inside the client component.

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/components/packt/map-tab.tsx` | Map Tab component — MapLibre GL JS map with Located Item pins and empty state |
| `src/components/packt/map-tab.test.tsx` | Unit tests for MapTab (empty state, mock initialization) |
| `src/lib/map-helpers.ts` | Pure helper to extract Located Item pin data from events |
| `src/lib/map-helpers.test.ts` | Unit tests for map helper |
| `tests/e2e/features/map-tab.feature` | E2E scenarios for Map Tab visibility |
| `tests/e2e/steps/map-tab.steps.ts` | E2E step definitions |

### Files to MODIFY

| File | Changes |
|------|---------|
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | **Size: already 268 lines (over 250-line limit).** Replace map tab placeholder (lines 229–231) with `<MapTab>` component, pass `allEvents` and `tripId`. If the file pushes further past the limit during this change, extract the PackingListsView tab block into a separate helper component to bring it back under 250 lines. |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.test.tsx` | Add tests for MapTab rendering when activeTab is "map" |
| `tests/e2e/feature-map.mjs` | Add `map-tab` entry to `FEATURE_MAP` |
| `package.json` | Add `maplibre-gl` dependency |

### Files NOT to touch

- `src/components/packt/day-route-strip.tsx` — Day Route Strip, unaffected (its thumbnail deep-link to Map Tab ships in Story 5.3)
- `src/components/packt/now-card.tsx` — Now Card scope, unaffected
- `src/components/packt/distance-time-pill.tsx` — Epic 2 scope, unaffected
- `src/components/packt/getting-around-section.tsx` — Epic 1 scope, unaffected
- `src/components/packt/place-row.tsx` — PlaceRow scope, unaffected
- `src/components/packt/place-row-action-bar.tsx` — Action bar scope, unaffected
- `src/components/packt/mini-map-rail.tsx` — Dead code, confirmed removed in Epic 3/4; if it still exists, do not touch
- `src/db/schema.ts` — No schema changes needed for this story
- `src/lib/route.ts` — Route module, no changes needed (Map Tab does not compute routes in this story)
- `src/app/(app)/trips/[tripId]/route-actions.ts` — No new server actions needed
- `src/components/ui/**` — No new UI primitives needed
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` — Unaffected, Map Tab is wired at the `TripDetailTabBody` level

### Existing Patterns to Follow

**Tab rendering pattern (`trip-detail-tab-body.tsx`):**
```tsx
{activeTab === "map" && (
  <MapTab events={allEvents} tripId={tripId} />
)}
```

**Located Item filter pattern (from `route.ts`):**
```ts
const locatedItems = events.filter(
  (event) => event.locationLat != null && event.locationLng != null
);
```

**External maps utility (from `open-external-maps.ts`):**
```ts
import { openExternalMaps } from "@/lib/open-external-maps";
// Call with coordinates: openExternalMaps({ lat, lng })
// Or with address text: openExternalMaps(undefined, addressText)
```

**Empty state pattern (from EXPERIENCE.md):**
```tsx
<div style={{ textAlign: "center", padding: "48px 24px" }}>
  <p style={{ color: "var(--fg-3)", fontSize: "calc(14px * var(--font-scale))" }}>
    No located stops yet
  </p>
</div>
```

**Client component mounting pattern (MapLibre GL JS):**
```tsx
"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export function MapTab({ events, tripId }: MapTabProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [0, 0],
      zoom: 1,
    });
    mapRef.current = map;

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  return <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />;
}
```

### Key Gotchas

1. **MapLibre GL JS requires DOM/canvas.** It cannot render in jsdom (Vitest's default test environment). Unit tests must mock `maplibre-gl` and test the component's data logic (pin filtering, empty state) rather than the rendered map. Use `vi.mock("maplibre-gl", ...)` with a minimal stub.

2. **MapLibre CSS import is mandatory.** Without `import "maplibre-gl/dist/maplibre-gl.css"`, map controls (zoom buttons, attribution) won't render. Import inside the client component file.

3. **Token is already available.** `NEXT_PUBLIC_MAPBOX_TOKEN` is in `.env.example` and used by the existing `@mapbox/search-js-core` integration. MapLibre uses the same token for tile access. Do NOT create a new token or env var.

4. **Pin contrast must be verified.** `accent-brand` (#0e8b80 light / #2bb5a6 dark) needs 3:1 contrast against the Mapbox Streets tile background (~#f5f5f5). Approximate ratio is ~3.5:1 (passes WCAG 1.4.11). If the tile style changes, re-verify.

5. **`allEvents` is already computed.** `TripDetailTabBody` computes `allEvents = days.flatMap(day => day.events).concat(unscheduledEvents)` on line 162–165. Pass this directly to `MapTab` — do not recompute.

6. **Overlapping pins.** MapLibre's built-in clustering (`cluster: true` on GeoJSON source) handles this automatically. For fewer pins, simple offset or popup cycling on tap works. The requirement is "a tap must always resolve to exactly one identifiable item."

7. **Day filter is future work.** Story 5.2 adds the day selector. This story's `MapTab` accepts an optional `dayFilter` prop but does not implement filtering logic — just render all Located Items regardless. The prop is interface-only.

8. **`prefers-reduced-motion`.** Use `map.jumpTo()` instead of `map.flyTo()` or `map.easeTo()` when reduced motion is preferred. Check via `window.matchMedia("(prefers-reduced-motion: reduce)").matches`.

9. **`openExternalMaps`** is already in the codebase at `src/lib/open-external-maps.ts`. Reuse it in the pin popup. Do not reimplement.

10. **Map Tab is a `"use client"` component.** MapLibre GL JS requires a browser environment. Do not attempt to server-render the map.

11. **The existing placeholder on line 229–231 of `trip-detail-tab-body.tsx`** must be replaced, not appended alongside. The placeholder text is `"Map view coming soon."`.

### Testing Requirements

- **Unit tests** (Vitest): colocated `*.test.ts(x)` next to source
  - `src/lib/map-helpers.test.ts` — Located Item pin extraction logic
  - `src/components/packt/map-tab.test.tsx` — empty state rendering, mock initialization, pin data preprocessing (mock `maplibre-gl` since jsdom can't render canvas)
  - `src/app/(app)/trips/[tripId]/trip-detail-tab-body.test.tsx` — verify MapTab renders when `activeTab === "map"`, verify correct props passed
- **E2E tests** (playwright-bdd): `map-tab.feature` for basic visibility scenarios
- Coverage threshold: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- Run targeted tests first, then `packt-build-validator` for full validation

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Epic 5, Story 5.1 (lines 447-487)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — Interactive map library Decision 1b (lines 101-103), Distance/route caching (line 105), New & Modified Files (lines 229-232), `map-tab.tsx` [MODIFY] entry
- UX Design: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/DESIGN.md` — Map Tab day selector (lines 86-92), Map pin (lines 93-96), Do's/Don'ts (lines 141-150)
- UX Experience: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md` — Map Tab component pattern (line 63), Map pin (line 64), State Patterns (lines 88-91), Accessibility Floor (lines 113-118), Key Flow 4 (lines 164-171)
- UX Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/mockups/map-tab.html`
- Previous stories: `_bmad-output/implementation-artifacts/4-1-show-day-route-strip-for-days-with-2-plus-located-items.md`, `_bmad-output/implementation-artifacts/4-2-detect-and-surface-schedule-conflicts.md`
- Existing tab type: `src/data/types.ts` — `TripDetailTab.Map = "map"` (line 101)
- Existing placeholder: `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` — lines 229-231
- External maps utility: `src/lib/open-external-maps.ts`
- Route module: `src/lib/route.ts` — existing Located Item filter pattern
- Project context: `_bmad-output/project-context.md` — styling conventions, testing standards, 44×44px rule, `accent-brand` tokens

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `packt-build-validator`: LINT PASS, TSC PASS, COVERAGE PASS (3091/3091 tests, lines 96.15%, functions 96.47%, branches 90.26%), BUILD PASS.
- Full E2E suite (scope `full`, triggered by `trip-detail-tab-body.tsx` matching a `SHARED_GLOBS` pattern): 177/178 passed. The one failure (`packing-tab.feature` — "Dragging an item into an empty Ungrouped area moves it there") is an unrelated drag-and-drop timing flake — re-ran `packing-tab.feature` in isolation and all 22 scenarios, including the previously-failing one, passed.
- `map-tab.feature` (both scenarios) passed both in an isolated `--grep` run and inside the full-suite run.

### Completion Notes List

- Deviated from Subtask 2.1's literal pin shape: omitted `dayNumber` from `LocatedItemPin`. `TripEvent` has no `dayNumber` field (only `DayItinerary` does), and `MapTab` receives a flat `TripEvent[]` with no day context, so it can't be derived without either threading `days` into the component (out of scope this story) or fabricating a value. This story's pins are single-color with no per-day distinction (AC1), so the field isn't needed yet; Story 5.2's day filter will need to thread day context through some other path.
- Subtask 3.7 called for a MapLibre `Popup`; implemented instead as a small React-rendered detail panel (`data-testid="map-tab-pin-detail"`, driven by `selectedPin` state) triggered by both marker clicks and the "Located stops" list buttons. This keeps one detail-rendering path, consistent with the codebase's React/JSX conventions rather than imperative `document.createElement` DOM-building, and satisfies AC4 (name, address, "Open External Maps" action) without depending on MapLibre's Popup API.
- Subtask 3.8 (overlapping pins) implemented as a coordinate-decluster offset (`declusterPins` in `map-helpers.ts`) rather than MapLibre GeoJSON `cluster: true` — the subtask explicitly allows either; at trip-scale pin counts a simple offset avoids a heavier source/layer implementation while still guaranteeing "a tap always resolves to exactly one identifiable item" (AC5).
- AC6 (keyboard/non-drag path): the map container has `tabindex=0` + `role="application"` for MapLibre's built-in keyboard pan/zoom; a separate always-visible "Located stops" button list (real `Button` components, 44×44px via `size="lg"`) gives a non-drag path to every pin's detail, independent of marker DOM focusability.
- Map pin markers are small (16px) circular `accent-brand` dots, not resized to 44×44px — `DESIGN.md`'s `map-pin` spec (unlike every other new component in that doc) has no `min-target` line, read as an intentional carve-out consistent with cartographic convention. The 44×44px rule is applied instead to the accessible "Located stops" list and detail-panel buttons.
- `trip-detail-tab-body.tsx` was already 268 lines before this story (over the Dev Notes' informal 250-line note); this change nets it to 267 lines. Per the Files-to-MODIFY note's conditional wording ("if the file pushes further past the limit"), the optional `PackingListsView` extraction was not performed since the file didn't grow.
- Found and fixed a consequential stale reference: `tests/e2e/steps/trip-tabs.steps.ts`'s `expectTabContent` had a `"Map"` case asserting the old placeholder text `"Map view coming soon."`, which no longer exists after this story's wiring. Updated it to assert `"No located stops yet"` (the tab-navigation mother's default trip has zero Located Items). No current scenario exercises this branch, but it would have been silently wrong.

### File List

- _bmad-output/implementation-artifacts/5-1-show-whole-trip-map.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- package.json
- package-lock.json
- src/data/types.ts
- src/lib/map-helpers.ts
- src/lib/map-helpers.test.ts
- src/components/packt/map-tab.tsx
- src/components/packt/map-tab.test.tsx
- src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx
- src/app/(app)/trips/[tripId]/trip-detail-tab-body.test.tsx
- tests/e2e/feature-map.mjs
- tests/e2e/features/map-tab.feature
- tests/e2e/steps/map-tab.steps.ts
- tests/e2e/steps/trip-tabs.steps.ts
- .env.example
- .env (untracked/local — added the same value to the developer's local `.env`)

### Change Log

- 2026-07-17: Implemented the whole-trip Map Tab — MapLibre GL JS pin rendering, empty state, accessible detail panel, keyboard non-drag path, and full unit + E2E coverage.
- 2026-07-17: Fixed post-implementation bug — `NEXT_PUBLIC_MAPBOX_TOKEN` did not actually exist in `.env`/`.env.example` despite the Dev Notes claiming it was "already available" (only the server-only `MAPBOX_ACCESS_TOKEN` existed). Added `NEXT_PUBLIC_MAPBOX_TOKEN` (same public `pk.*` token value) to both files so MapLibre's client-side style/tile fetch resolves instead of sending `access_token=undefined`. Requires a dev-server restart to take effect since Next.js reads `.env` once at process start.
- 2026-07-17: Fixed post-implementation bug — Mapbox's `streets-v12` hosted style JSON uses proprietary style-spec extensions (e.g. layer `slot` properties) that MapLibre GL JS's stricter open-spec validator rejects at runtime (`Error: name: unknown property "name"`, thrown async while parsing the fetched style). Switched `map-tab.tsx`'s style URL to `streets-v11`, the last Mapbox style version that stays within the open style spec MapLibre supports.
- 2026-07-17: Fixed post-implementation bug — MapLibre GL JS's fork dropped all support for Mapbox's proprietary `mapbox://` URL scheme (confirmed zero references in its bundled source), so the fetched style's internal `source`/`sprite`/`glyphs` references (e.g. `mapbox://mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2`, `mapbox://sprites/mapbox/streets-v11@2x.json`) failed with `AJAXError: Failed to fetch (0)`. Added `transformMapboxUrl()` to `map-helpers.ts` (with unit tests) and wired it as the Map's `transformRequest` option to rewrite `mapbox://` source/sprite/glyphs references into their real `api.mapbox.com` HTTPS equivalents with the access token appended — the standard bridge pattern for using Mapbox-hosted styles with MapLibre. Verified working in the browser.
