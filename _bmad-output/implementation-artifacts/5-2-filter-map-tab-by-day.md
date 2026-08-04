---
baseline_commit: 07d775e2ad96f20b554f677f9e9e9357beee32cb
---

# Story 5.2: Filter Map Tab by day

Status: done

## Story

As a traveler viewing the Map Tab,
I want to narrow the view to a single day,
so that I can see concentration for one day without losing the whole-trip option.

## Acceptance Criteria

1. **Given** the Map Tab
   **When** it renders
   **Then** a day selector shows "Whole Trip" as the first segment followed by each trip day

2. **Given** I select a day segment
   **When** selected
   **Then** visible pins and route context filter to that day's Located Items only

3. **Given** the day selector
   **When** the trip has many days
   **Then** it is horizontally scrollable at any viewport width (same `overflow-x-auto` pattern as the trip-detail tab bar), never wrapping or collapsing

4. **Given** each day-selector segment
   **When** measured
   **Then** it meets 44×44px on both axes, with arrow-key roving-tabindex and Home/End keyboard navigation

5. **Given** the existing `?tab=map` query-param convention
   **When** a day is selected
   **Then** the URL supports deep-linking to that Map Tab + day scope

6. **And** selecting "Whole Trip" again returns the map to full trip scope

## Tasks / Subtasks

- [x] Task 1: Add `days` and `unscheduledEvents` props to MapTab (AC: 1, 2)
  - [x] Subtask 1.1: Add `days: DayItinerary[]` and `unscheduledEvents: TripEvent[]` as optional props to `MapTabProps` in `src/components/packt/map-tab.tsx`
  - [x] Subtask 1.2: Add a `selectedDayNumber` state (`useState<number | null>(null)`) to MapTab — `null` = "Whole Trip", `1`, `2`, etc. = specific day
  - [x] Subtask 1.3: Read initial value from `dayFilter` prop (already defined, currently unused) — if `dayFilter` is a number, set `selectedDayNumber` to it on mount
  - [x] Subtask 1.4: Create a `useMemo` that computes filtered pins from `pins` based on `selectedDayNumber`:
    - When `selectedDayNumber === null` → return all `pins` (whole-trip scope, current behavior)
    - When `selectedDayNumber` is a day number → filter to only pins whose source event belongs to that day: match event IDs from `days[selectedDayNumber - 1].events` against `pins[].id` (reservations need special handling — see Key Gotchas #2)
  - [x] Subtask 1.5: Replace all references to `pins` with the filtered `filteredPins` in the map initialization effect, marker creation, empty state, and located-stops list

- [x] Task 2: Add day selector UI (AC: 1, 3, 4, 6)
  - [x] Subtask 2.1: Build a horizontal segmented control above the map container in `map-tab.tsx`
  - [x] Subtask 2.2: First segment: "Whole Trip" — always present
  - [x] Subtask 2.3: Remaining segments: one per `days` entry, labeled using the day's `label` field (e.g. "Day 1", "Day 2"), or fallback to `"Day ${dayNumber}"` if `label` is absent
  - [x] Subtask 2.4: Style each segment to match the existing trip-detail tab bar (`page-client.tsx:201-222`): same font size (`calc(13px * var(--font-scale))`), `fg` vs `fg-3` text color split, `2px solid var(--accent-brand)` bottom border on selected segment, `2px solid transparent` on unselected, `padding: 0 14px`, `min-height: 44px`, `min-width: 44px`
  - [x] Subtask 2.5: Wrap the segments in a `div` with `overflow-x: auto` and Tailwind class `scroll-thin` for horizontal scrolling — same pattern as `page-client.tsx:201`
  - [x] Subtask 2.6: Each segment is a `<button>` element with `role="tab"` and `aria-selected` — the selected segment gets `aria-selected="true"`
  - [x] Subtask 2.7: Keyboard navigation on the segmented control container:
    - ArrowRight/ArrowLeft: move selection to next/prev segment (wrapping optional, Home/End expected)
    - Home: select first segment ("Whole Trip")
    - End: select last segment
    - Only the selected segment has `tabIndex={0}`; all others have `tabIndex={-1}` (roving tabindex)
    - Handle `onKeyDown` on the container `div`, not on individual buttons
  - [x] Subtask 2.8: When a segment is clicked or keyboard-selected, set `selectedDayNumber` state (`null` for "Whole Trip", the day's `dayNumber` for day segments)
  - [x] Subtask 2.9: Reset `selectedPin` to `null` when the day selector changes (the previously selected pin may no longer be visible)

- [x] Task 3: Deep-link via URL query param (AC: 5)
  - [x] Subtask 3.1: Import `useSearchParams` from `next/navigation` in `map-tab.tsx`
  - [x] Subtask 3.2: On mount, read `searchParams.get("day")` — if present and parseable as a number, set `selectedDayNumber` to that value (overrides `dayFilter` prop if both present)
  - [x] Subtask 3.3: When the user selects a day segment, update the URL via `window.history.replaceState` (not `pushState`) to add/update `?day=N` — keep the existing `?tab=map` param intact
  - [x] Subtask 3.4: When "Whole Trip" is selected, remove the `?day` param from the URL (keep `?tab=map`)
  - [x] Subtask 3.5: Update existing `MapTabProps.dayFilter` JSDoc to clarify it accepts an initial day number for deep-linking and is read once on mount

- [x] Task 4: Wire `days` and `unscheduledEvents` through `TripDetailTabBody` (AC: 1, 2)
  - [x] Subtask 4.1: In `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` line 230, pass `days` and `unscheduledEvents` as additional props to `<MapTab>`
  - [x] Subtask 4.2: Add tests in `trip-detail-tab-body.test.tsx` — verify MapTab receives `days` and `unscheduledEvents` props when `activeTab === "map"`

- [x] Task 5: Create unit tests for day selector filtering (AC: 1, 2, 6)
  - [x] Subtask 5.1: Add tests in `src/components/packt/map-tab.test.tsx`:
    - Day selector renders "Whole Trip" + one segment per day when `days` prop is provided
    - Selecting a day filters pins to only that day's located events
    - Selecting "Whole Trip" after a day shows all pins again
    - Freeform events (no coordinates) don't appear in pins regardless of day selection
    - Day selector does not render when `days` is not provided (backward-compatible: existing whole-trip-only usage)
  - [x] Subtask 5.2: Add tests in `src/lib/map-helpers.test.ts` — add `getPinsForDay()` helper test (if the filtering helper is extracted there; otherwise test filtering inline in map-tab.test.tsx)

- [x] Task 6: Create unit tests for keyboard navigation (AC: 4)
  - [x] Subtask 6.1: Add tests in `src/components/packt/map-tab.test.tsx`:
    - ArrowRight moves focus to the next segment
    - ArrowLeft moves focus to the previous segment
    - Home moves focus to "Whole Trip"
    - End moves focus to the last day segment
    - Only the selected segment has `tabIndex={0}`

- [x] Task 7: Add E2E coverage (AC: 1, 2, 3, 6)
  - [x] Subtask 7.1: Update `tests/e2e/features/map-tab.feature` — add day-selector scenarios:
    - Selecting a day shows only that day's located stops
    - Selecting "Whole Trip" returns to full scope
    - Day selector is horizontally scrollable with many days
  - [x] Subtask 7.2: Update `tests/e2e/steps/map-tab.steps.ts` — add step definitions for day selector interactions

- [x] Task 8: Run targeted tests (AC: 1–6)
  - [x] Subtask 8.1: `npx vitest run src/components/packt/map-tab.test.tsx` — all pass
  - [x] Subtask 8.2: `npx vitest run src/lib/map-helpers.test.ts` — all pass
  - [x] Subtask 8.3: `npx vitest run src/app/(app)/trips/[tripId]/trip-detail-tab-body.test.tsx` — no regressions

- [x] Task 9: Run `packt-build-validator` (AC: 1–6)
  - [x] Subtask 9.1: lint, TypeScript, coverage, build, affected E2E
  - [x] Subtask 9.2: Fix any issues flagged
  - [x] Subtask 9.3: Re-run until PASS

### Review Findings

- [x] [Review][Patch] Day switch destroys and fully recreates the MapLibre map instance instead of just updating markers [src/components/packt/map-tab.tsx:125-166] — The map-lifecycle `useEffect` depends on `[filteredPins]`, and its cleanup calls `map.remove()` / `mapRef.current = null` on every dependency change. Since `filteredPins` gets a new array reference on every day-selector click (and every arrow-key press while roving focus), each selection tears down and rebuilds the entire `maplibregl.Map` — reloading the style/tiles from scratch — rather than just re-adding markers and calling `fitBounds`. This directly contradicts Key Gotcha #3's explicit claim that "the map itself persists across day changes — only the markers and fitBounds update... no special handling needed." Fix: split into a one-time map-init effect (create the map once, independent of pin content) plus a separate effect/handler that updates markers and `fitBounds` when `filteredPins` changes, without calling `map.remove()`.
- [x] [Review][Patch] No test asserts markers actually update (vs. the map being torn down and rebuilt) when the day filter changes [src/components/packt/map-tab.test.tsx] — Existing day-filter tests only assert on the sidebar `<ul>` list of buttons, never on `markerConstructorSpy`/`mapConstructorSpy` call counts, so the full-rebuild issue above passed the suite undetected. Add an assertion (e.g., `mapConstructorSpy` called once across day switches; marker count reflects the filtered set) once the effect split above is in place.
- [x] [Review][Patch] `selectedDayNumber` / `?day=` value is never validated against the actual `days` list [src/components/packt/map-tab.tsx:50-54,66-87] — `parseDayNumber` accepts `0`, negative numbers, and decimals (`Number("")` is `0`, which is finite), and nothing checks that the resulting day number matches an entry in `days`. A malformed or out-of-range `?day=` (or `days` shrinking later, e.g. a day deleted while filtered to it) silently filters out all scheduled-event pins with no tab shown as selected, instead of falling back to Whole Trip. Fix: validate `selectedDayNumber` has a matching entry in `days`/`scopeOptions` wherever it's derived or used; fall back to `null` when it doesn't.
- [x] [Review][Patch] `day.label` empty string isn't handled by `??` [src/components/packt/map-tab.tsx:92] — `day.label ?? \`Day ${day.dayNumber}\`` only catches `null`/`undefined`; a day with `label: ""` renders a blank, inaccessible tab. Fix: `day.label?.trim() ? day.label : \`Day ${day.dayNumber}\`` (or equivalent truthy check).
- [x] [Review][Patch] `useSearchParams()` used instead of the spec-prescribed `window.location.search` approach (Key Gotcha #6) [src/components/packt/map-tab.tsx:5,64,67,101-104] — The story explicitly recommends reading `window.location.search` in a `useEffect` instead of `next/navigation`'s `useSearchParams()`, to avoid a Suspense requirement and stay consistent with the rest of the component's `window.history` based URL writes. The diff imports and uses `useSearchParams()` instead, read once in the `useState` initializer, while all writes go through raw `window.history.replaceState` that Next's router never observes. This doesn't currently break the build (the route is already fully dynamic and `page-client.tsx` already calls `useSearchParams()` unguarded), but it's an unexplained deviation from explicit spec guidance and means a later `?day=` change via client-side navigation won't re-sync the component (searchParams is never re-read after mount). Fix: dropped the `next/navigation` import. A literal `useEffect` + `setState` (as the gotcha describes) trips this project's `react-hooks/set-state-in-effect` ESLint rule (Next 16's stricter hooks lint), so implemented with `useSyncExternalStore` instead — the React-idiomatic, SSR-safe way to read a browser-only value once without an effect or a hydration mismatch; same net behavior (URL param wins on mount, `next/navigation` no longer imported).
- [x] [Review][Patch] `dayFilter` prop has zero test coverage [src/components/packt/map-tab.test.tsx] — `dayFilter` (forward-looking plumbing for Story 5.3 per Key Gotcha #8) is read in the `useState` initializer but no test exercises it. Add a unit test rendering `MapTab` with `dayFilter` set and no `?day=` param, asserting it seeds `selectedDayNumber`.
- [x] [Review][Patch] No test confirms reservation pins stay visible under a day filter [src/components/packt/map-tab.test.tsx] — The reservation-pins-always-shown behavior (Key Gotcha #2) is correctly implemented (`map-tab.tsx:82-86`) but nothing verifies it: add a test combining a reservation pin with an active day filter, asserting the reservation pin remains visible while other days' events are filtered out.
- [x] [Review][Patch] Hand-rolled ARIA tabs pattern is missing `aria-controls` and a live-region announcement [src/components/packt/map-tab.tsx:168-205] — The new `role="tablist"`/`role="tab"` segments have no `aria-controls`/`id` link to the map/list region they filter, and no `aria-live` region announces the updated pin count after switching days. Not required by the stated ACs (AC4 covers only sizing and keyboard nav), but recommended for completeness of the ARIA APG tabs pattern this introduces.

## Dev Notes

### Previous Story Intelligence

**Story 5.1 (done, current baseline):** Created the whole-trip Map Tab — MapLibre GL JS pin rendering, empty state, accessible detail panel, keyboard non-drag path, and full unit + E2E coverage. Key files created: `map-tab.tsx`, `map-helpers.ts`. Modified: `trip-detail-tab-body.tsx`, `trip-tabs.steps.ts`.

**Key learnings from Story 5.1:**
- `MapTab` currently receives a flat `TripEvent[]` with no day context — this story must thread day context through some path (Completion Notes explicitly flagged this for Story 5.2)
- `trip-detail-tab-body.tsx` already has `days` (the `DayItinerary[]` prop) available — pass it through
- `TripEvent` has no `dayNumber` field; `DayItinerary` does — the filtering must match event IDs from the day's events array against pin IDs
- The `dayFilter` prop on `MapTab` was defined as a forward-looking interface — this story activates it
- `map-helpers.ts` contains `getLocatedItemPins()` — consider adding a `getPinsForDay()` helper there, or filter inline in `MapTab` via `useMemo`
- Post-implementation bugs from 5.1: `NEXT_PUBLIC_MAPBOX_TOKEN` env var had to be added, `streets-v12` had to be downgraded to `streets-v11`, `mapbox://` URL scheme required `transformMapboxUrl()` bridge — none of these affect this story, but be aware they exist
- The tab-detail tab bar visual language is defined at `page-client.tsx:197-223` — the day selector must replicate this exactly
- `scroll-thin` is an existing Tailwind utility class used by the tab bar for horizontal scroll

### Architecture Constraints

- **No new dependencies needed.** This story adds UI filtering logic only — no new npm packages.
- **`route.ts` is not touched.** Map Tab does not compute routes; filtering is a client-side visual filter on already-loaded pins.
- **`schema.ts` is not touched.** No new DB columns or tables.
- **Server/client boundary preserved.** `MapTab` remains a `"use client"` component. The day selector is pure client-side state. URL query params are read/written client-side.
- **`openExternalMaps`** at `src/lib/open-external-maps.ts` — unchanged, still reused in pin detail.
- **MapLibre GL JS** — when the day filter changes and markers are rebuilt, the existing effect cleanup (remove markers, re-add) handles the transition. The map itself persists across day changes — only the markers and fitBounds update.
- **`?tab=map` convention** — the existing URL query-param pattern. This story adds `?day=N` as a sub-param. Both coexist in the same URL.

### Files to CREATE

None — all changes are to existing files.

### Files to MODIFY

| File | Changes |
|------|---------|
| `src/components/packt/map-tab.tsx` | Add `days` and `unscheduledEvents` props; add `selectedDayNumber` state; add day selector UI (segmented control above map); add URL query param sync via `useSearchParams`; filter pins by selected day in a `useMemo`; wire filtered pins into existing map initialization effect |
| `src/components/packt/map-tab.test.tsx` | Add day selector rendering tests, day-scoped filtering tests, keyboard navigation tests, URL query param tests |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Pass `days` and `unscheduledEvents` to `<MapTab>` on line 230 |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.test.tsx` | Update MapTab spy assertion to verify new props |
| `tests/e2e/features/map-tab.feature` | Add day-selector scenarios |
| `tests/e2e/steps/map-tab.steps.ts` | Add step definitions for day selector |

### Files NOT to touch

- `src/components/packt/day-route-strip.tsx` — Day Route Strip, unaffected
- `src/components/packt/now-card.tsx` — Now Card scope, unaffected
- `src/components/packt/distance-time-pill.tsx` — Epic 2 scope, unaffected
- `src/components/packt/getting-around-section.tsx` — Epic 1 scope, unaffected
- `src/components/packt/place-row.tsx` — PlaceRow scope, unaffected
- `src/components/packt/place-row-action-bar.tsx` — Action bar scope, unaffected
- `src/db/schema.ts` — No schema changes
- `src/lib/route.ts` — No route computation changes
- `src/lib/utils.ts` — No utility changes needed
- `src/data/types.ts` — `LocatedItemPin` unchanged; no new types needed
- `src/app/(app)/trips/[tripId]/page-client.tsx` — Tab bar is unaffected; day selector lives inside MapTab

### Existing Patterns to Follow

**Tab bar visual language (from `page-client.tsx:201-222`):**
```tsx
<div className="flex items-center flex-1 gap-0 overflow-x-auto overflow-y-hidden scroll-thin">
  {TABS.map((tabItem) => (
    <button
      key={tabItem.id}
      className="shrink-0 inline-flex flex-row-reverse items-center gap-1 px-3.5 py-3 transition-colors relative"
      style={{
        fontSize: "calc(13px * var(--font-scale))",
        fontWeight: activeTab === tabItem.id ? 600 : 400,
        color: activeTab === tabItem.id ? "var(--fg)" : "var(--fg-3)",
        background: "none",
        border: "none",
        borderBottom: activeTab === tabItem.id ? "2px solid var(--accent-brand)" : "2px solid transparent",
        marginBottom: -1,
      }}
      onClick={() => handleTabChange(tabItem.id)}
    >
      {tabItem.label}
    </button>
  ))}
</div>
```

**Located Item filter pattern (from `map-tab.tsx:47`):**
```ts
const pins = useMemo(() => getLocatedItemPins(events, reservations), [events, reservations]);
```

**Empty state pattern (from `map-tab.tsx:93-98`):**
```tsx
<div data-testid="map-tab-empty" style={{ textAlign: "center", padding: "48px 24px" }}>
  <p style={{ color: "var(--fg-3)", fontSize: "calc(14px * var(--font-scale))">No located stops yet</p>
</div>
```

**useSearchParams pattern (from `page-client.tsx`):**
```ts
import { useSearchParams } from "next/navigation";
// searchParams.get("tab") for reading; window.history.pushState for writing
```

**Client-side URL update pattern (from `page-client.tsx:184`):**
```ts
const nextUrl = buildTripDetailTabHref(pathname, new URLSearchParams(window.location.search), nextTab);
window.history.pushState(null, "", nextUrl);
```

### Key Gotchas

1. **`TripEvent` has no `dayNumber` field.** `LocatedItemPin` also lacks `dayNumber`. To filter pins by day, you must match pin IDs against the event IDs in `days[dayNumber - 1].events`. Create a `useMemo` that builds a `Set<string>` of event IDs for the selected day, then filter `pins` by `dayPinIds.has(pin.id)`. For reservations: reservation pins have IDs like `"${reservation.id}-start"` and `"${reservation.id}-end"`. Reservations are not currently grouped by day in `DayItinerary` (only events are). Since reservations are not part of the day's events array, they should be shown in ALL day views (they represent fixed commitments that span days) or excluded from day filtering. The simplest correct behavior: reservation pins always appear regardless of day selection, since they represent travel/lodging that isn't day-scoped. This matches how reservations are displayed in the itinerary — they appear in a separate tab, not grouped by day.

2. **Reservation pin filtering decision.** Reservations don't belong to a specific day. When a day is selected, reservation pins should remain visible (they represent cross-cutting commitments like flights or hotel stays). Only event pins get filtered by day. This avoids the confusing scenario where selecting "Day 2" hides the hotel you're staying at.

3. **Map marker rebuild on day change.** The existing `useEffect` in `map-tab.tsx:53-91` handles cleanup and re-creation of markers when `pins` changes. Since `filteredPins` will be a new memoized array when `selectedDayNumber` changes, the effect will automatically clean up old markers and create new ones. The `fitBounds`/`jumpTo` logic will also re-run, centering on the filtered day's pins. No special handling needed — the existing effect's dependency on `[pins]` already covers this once you swap `pins` → `filteredPins`.

4. **Empty filtered state.** When a day is selected but has zero Located Items, the map should show the same "No located stops yet" empty state. The existing `pins.length === 0` check at `map-tab.tsx:93` covers this once you swap to `filteredPins`.

5. **`scroll-thin` is an existing utility class.** Already used at `page-client.tsx:201`. If Tailwind v4 doesn't recognize it as a built-in, check `globals.css` for a `@utility scroll-thin` definition. Use the same class for the day selector's scrollable container.

6. **`useSearchParams` must be inside `<Suspense>`.** In Next.js App Router, `useSearchParams()` requires a `<Suspense>` boundary above the component using it. `MapTab` is rendered by `TripDetailTabBody`, which is rendered by `page-client.tsx`. Check if there's already a Suspense boundary; if not, wrap the `MapTab` usage in `TripDetailTabBody` with `<Suspense fallback={null}>`. Alternatively, read the initial query param via `window.location.search` in a `useEffect` (client-only, no Suspense needed) and use `window.history.replaceState` for updates — this avoids the Suspense requirement entirely. Given that `MapTab` is already `"use client"` and does all URL manipulation via `window`, the `window.location.search` approach is simpler and avoids introducing `next/navigation` imports.

7. **Day label resolution.** `DayItinerary` has a `label` field (e.g. "Paris Day 1") and a `dayNumber` field. Use `day.label ?? \`Day ${day.dayNumber}\`` for segment labels, matching how the itinerary view labels days.

8. **`selectedDayNumber` initial value.** On mount, the state should be initialized from:
   - `dayFilter` prop if provided (for deep-linking from Day Route Strip in Story 5.3)
   - URL `?day=N` query param if present (for direct URL deep-linking)
   - `null` (Whole Trip) otherwise
   Precedence: URL param > prop > default. Use a `useEffect` or initialize in `useState` with a function that reads `window.location.search`.

9. **Existing test patterns.** `map-tab.test.tsx` mocks `maplibre-gl` entirely. Day selector tests will be pure React rendering tests (no map interaction needed). Use `fireEvent.click()` for segment selection and `fireEvent.keyDown()` for keyboard navigation. The mock setup from Story 5.1's tests can be reused as-is.

10. **`aria-selected` on segments.** Each segment button should have `role="tab"` and `aria-selected={selectedDayNumber === dayNumber}` (or `selectedDayNumber === null` for "Whole Trip"). The container should have `role="tablist"` and `aria-label="Map scope"`. This matches the mockup at `mockups/map-tab.html:105-112`.

### Testing Requirements

- **Unit tests** (Vitest): colocated `*.test.tsx` next to source
  - `src/components/packt/map-tab.test.tsx` — day selector rendering, day-scoped filtering, keyboard navigation, URL sync, backward-compatible behavior when `days` is not provided
  - `src/app/(app)/trips/[tripId]/trip-detail-tab-body.test.tsx` — verify `days` and `unscheduledEvents` are passed to MapTab
- **E2E tests** (playwright-bdd): extend `map-tab.feature` with day-selector scenarios
- Coverage threshold: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- Run targeted tests first, then `packt-build-validator` for full validation

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Epic 5, Story 5.2 (lines 489-508)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — Map Tab day selector (no architecture changes needed for this story)
- UX Design: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/DESIGN.md` — `map-tab-day-selector` component (line 86-91)
- UX Experience: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md` — Map Tab day selector interaction (line 100), keyboard model (line 101), scrollable behavior (line 126)
- UX Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/mockups/map-tab.html` — visual reference for day selector layout
- Previous stories: `_bmad-output/implementation-artifacts/5-1-show-whole-trip-map.md` (current baseline)
- Existing tab bar: `src/app/(app)/trips/[tripId]/page-client.tsx:197-223` — visual language to replicate
- Map Tab component: `src/components/packt/map-tab.tsx` — current implementation to extend
- Map helpers: `src/lib/map-helpers.ts` — pin extraction utilities
- Trip types: `src/data/types.ts` — `DayItinerary` (line 472), `LocatedItemPin` (line 76), `TripDetailTab` (line 106)

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Targeted Vitest: MapTab 21, map helpers 16, and tab-body 4 tests passed.
- Targeted Map Tab Playwright: 7 scenarios passed.
- Full coverage: 3,109 tests passed; 96.1% lines, 96.46% functions, 90.15% branches.
- Full affected Playwright: 182 scenarios passed.

### Completion Notes List

- Added accessible, horizontally scrollable Map scope selector with Whole Trip and per-day scopes.
- Filtered scheduled-event pins by selected day while retaining reservation pins and excluding unscheduled events from day scopes.
- Synced selected scope to the `day` query parameter with replace-state history updates.
- Passed itinerary day and unscheduled-event context into MapTab and added unit plus E2E coverage.

### File List

- src/components/packt/map-tab.tsx
- src/components/packt/map-tab.test.tsx
- src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx
- src/app/(app)/trips/[tripId]/trip-detail-tab-body.test.tsx
- tests/e2e/features/map-tab.feature
- tests/e2e/steps/map-tab.steps.ts
- _bmad-output/implementation-artifacts/5-2-filter-map-tab-by-day.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-07-17: Added Map Tab day filtering, deep links, accessibility support, and test coverage.
