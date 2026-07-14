---
baseline_commit: b7918d7c7ed8f801b933171a31d70e1e1037aa0f
---

# Story 2.2: Open External Maps from the Distance/Time pill

Status: review

## Story

As a traveler viewing the Now Card,
I want to tap the distance/time pill,
So that I can navigate to my next stop in one tap.

## Acceptance Criteria

1. **Given** the pill is showing live distance/time
   **When** I tap it
   **Then** Packt opens External Maps with the Next Event's Address or Coordinates as the destination

2. **Given** the tap target
   **When** measured
   **Then** it meets the 44×44px minimum on both axes

3. **Given** directions/time could not be calculated but the Next Event has Coordinates
   **When** the pill renders
   **Then** it shows the "Couldn't get directions — try again." error text in place of the distance/time text, and remains tappable to open External Maps directly — the tap target and maps action are never removed just because the estimate failed

4. **And** the pill's accessible name is explicit and distinct from the adjacent event name, e.g. "Open directions to {event name}, 12 minutes"

## Tasks / Subtasks

- [x] Task 1: Create External Maps URL utility (AC: 1)
  - [x] Subtask 1.1: Create `src/lib/open-external-maps.ts` exporting `openExternalMaps(options: { address?: string; lat?: number; lng?: number; label?: string })`:
    - If `address` is provided: `https://www.google.com/maps/dir/?api=1&destination={encodedAddress}`
    - If no `address` but `lat`/`lng` present: `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`
    - If `label` provided: append `&destination_place_id=` is not possible without Place ID — instead use the `query` param: `https://www.google.com/maps/search/?api=1&query={encodedAddress_or_lat,lng}` — BUT `maps/dir` is better for navigation intent. Use `maps/dir` with address or coordinates, no label needed since the destination shows on the map.
    - Open via `window.open(url, "_blank", "noopener,noreferrer")` for security
    - If no address and no coordinates: do nothing (no maps to open)
    - Guard for SSR: check `typeof window !== "undefined"` before calling `window.open`
  - [x] Subtask 1.2: Create `src/lib/open-external-maps.test.ts`:
    - Test: opens Google Maps URL with encoded address when address is provided
    - Test: opens Google Maps URL with lat/lng when no address
    - Test: address takes precedence over lat/lng when both provided
    - Test: does nothing when neither address nor coordinates provided
    - Test: does nothing in SSR environment (window undefined)

- [x] Task 2: Convert DistanceTimePill from display-only to interactive button (AC: 1, 2, 3, 4)
  - [x] Subtask 2.1: Update `DistanceTimePillProps` to include map-opening callback:
    ```ts
    export interface DistanceTimePillProps {
      eventName: string;
      routeResult: RouteResult;
      transitMode: TransitMode;
      onOpenMaps?: () => void;
    }
    ```
    - Using a callback prop (`onOpenMaps`) keeps `DistanceTimePill` decoupled from the maps URL logic — the parent (NowCard) constructs the callback, the pill just calls it
    - This is the established pattern: `distance-time-pill.tsx` is a pure presentational component (Story 2.1 Dev Notes, Gotcha #13), and adding `open-external-maps.ts` directly would couple it to window/URL logic
  - [x] Subtask 2.2: Change root element from `<div role="status">` to `<button>`:
    - The pill becomes a `<button>` element with `type="button"`
    - Keep `role="status"` only when `routeResult.status === "loading"` (loading state is genuinely status information, not interactive)
    - When `onOpenMaps` is provided: render a `<button>` with `onClick={onOpenMaps}` — no `role="status"` (it's interactive, not status)
    - When `onOpenMaps` is NOT provided (defensive fallback): render the current `<div role="status">` for backward compatibility
    - All existing visual classes (`PILL_LAYOUT_CLASSNAME`) remain unchanged — the button must look identical to the current pill
    - The button must still meet 44×44px minimum (already guaranteed by `h-11 min-w-11` in `PILL_LAYOUT_CLASSNAME`)
  - [x] Subtask 2.3: Update accessible names for the interactive states:
    - **Loading state** (no `onOpenMaps`): keep current `role="status"` with `aria-label="Getting directions to {eventName}"` — unchanged
    - **Ready state** (with `onOpenMaps`): `aria-label="Open directions to {eventName}, {durationMinutes} min {transitMode}"` — matches AC 4 exactly
    - **Unavailable state** (with `onOpenMaps`): `aria-label="Open maps for {eventName}"` — the unavailable state still opens maps, so the label reflects that
    - **Loading state** (defensive, with `onOpenMaps`): `aria-label="Getting directions to {eventName}"` — keep current
  - [x] Subtask 2.4: Add keyboard accessibility:
    - The `<button>` element is natively keyboard-focusable and activatable with Enter/Space — no extra work needed
    - Verify `focus-visible` ring matches existing button focus styles (check `globals.css` for focus-visible patterns)
  - [x] Subtask 2.5: Update `distance-time-pill.test.tsx`:
    - Add test: renders a `<button>` when `onOpenMaps` is provided
    - Add test: calls `onOpenMaps` when the button is clicked
    - Add test: accessible name is "Open directions to {eventName}, {time}" in ready state
    - Add test: accessible name is "Open maps for {eventName}" in unavailable state
    - Add test: button still meets 44×44px in all states
    - Add test: renders `<div role="status">` when `onOpenMaps` is NOT provided (backward compat)
    - Update existing "has an accessible name containing the event name in every state" test to verify new interactive labels

- [x] Task 3: Wire openExternalMaps into NowCard (AC: 1, 3)
  - [x] Subtask 3.1: In `now-card.tsx`, create the `onOpenMaps` callback for the Next Event row:
    ```ts
    const handleOpenMaps = useCallback(() => {
      if (!nextEventForRoute) return;
      openExternalMaps({
        address: nextEventForRoute.locationAddress,
        lat: nextEventForRoute.locationLat,
        lng: nextEventForRoute.locationLng,
        label: nextEventForRoute.locationName,
      });
    }, [nextEventForRoute]);
    ```
    - `nextEventForRoute` already filters to non-linked events with coordinates (line 242-243 of current `now-card.tsx`)
    - Import `openExternalMaps` from `@/lib/open-external-maps`
    - `useCallback` ensures stable reference — important since `NowCard` re-renders on timer ticks
  - [x] Subtask 3.2: Pass `onOpenMaps` to the `DistanceTimePill` inside `NowCardEventRow`:
    - Currently line 209: `<DistanceTimePill eventName={event.name} routeResult={routeResult} transitMode={effectiveTransitMode} />`
    - Add `onOpenMaps={onOpenMaps}` prop — this requires threading the callback through `NowCardEventRowProps`
    - Add `onOpenMaps?: () => void` to `NowCardEventRowProps`
    - Pass it through in the render at line 209
  - [x] Subtask 3.3: Update `now-card.test.tsx`:
    - Add test: clicking the DistanceTimePill in ready state opens External Maps (mock `window.open`)
    - Add test: clicking the DistanceTimePill in unavailable state opens External Maps (mock `window.open`)
    - Add test: DistanceTimePill has accessible name "Open directions to {eventName}, {time}" when route is ready
    - Add test: DistanceTimePill has accessible name "Open maps for {eventName}" when route is unavailable
    - Verify all existing tests still pass (the restructuring from Story 2.1 is preserved)

- [x] Task 4: Update E2E feature map and test coverage
  - [x] Subtask 4.1: Register `src/lib/open-external-maps.ts` in the `linked-events` entry of `tests/e2e/feature-map.mjs`
  - [x] Subtask 4.2: Run `scripts/feature-map.test.mjs` to verify contract
  - [x] Subtask 4.3: E2E coverage assessment — clicking the pill to open External Maps requires `window.open` mocking which is complex in Playwright; covered by unit/component tests instead

- [x] Task 5: Run targeted tests then full validation
  - [x] Subtask 5.1: Run `npx vitest run src/lib/open-external-maps.test.ts` — must pass
  - [x] Subtask 5.2: Run `npx vitest run src/components/packt/distance-time-pill.test.tsx` — must pass
  - [x] Subtask 5.3: Run `npx vitest run src/components/packt/now-card.test.tsx` — must pass (existing + new tests)
  - [x] Subtask 5.4: Run `packt-build-validator` — lint, TypeScript, coverage, build, affected E2E must pass

## Dev Notes

### Previous Story Intelligence

**Story 2.1 (done):** Created `DistanceTimePill` component (presentational, `role="status"`, display-only), `useRouteForEvent` hook, `route-actions.ts` server action, restructured Next Event row into DOM siblings (Link + pill), added `RouteResult` type to `src/data/types.ts`, extended `src/lib/route.ts` with `getRouteDistanceTime()`.

**Key learnings from Story 2.1:**
- `DistanceTimePill` is a **pure presentational component** — receives `routeResult` as a prop, renders appropriate state. All fetching logic lives in `use-route-for-event.ts` (Gotcha #13 in Story 2.1)
- Story 2.1's review explicitly noted "Make the Story 2.1 pill display-only until Story 2.2 adds external-map behavior" — this story IS that behavior
- `NowCardEventRow` at `now-card.tsx:47-213` has two branches: linked events (button) and non-linked events (Link + DistanceTimePill). Only the non-linked branch needs changes
- `nextEventForRoute` at `now-card.tsx:242-243` filters to non-linked events: `nextEvent && !nextEvent.linkedReservationId && !nextEvent.reservationType ? nextEvent : undefined`
- The pill is wrapped in `<div className="mt-2">` at `now-card.tsx:208` — this is the DOM sibling container
- `stopPropagation` on the parent `<div>` at `now-card.tsx:152` prevents clicks from bubbling to the card's navigate-on-click handler — the pill's click must also be stopped from reaching the card
- `trips-active-entry-panel.test.tsx` and `trips-desktop-layout.test.tsx` mock `use-route-for-event` locally — any change to `now-card.tsx`'s imports may require updating those mocks

### Architecture Constraints

- **`DistanceTimePill` stays a pure presentational component** — the `onOpenMaps` callback pattern keeps it decoupled from URL/window logic, matching Story 2.1's established pattern (architecture §Architectural Boundaries: "DistanceTimePill and the Address ButtonGroup segments are DOM siblings, never nested inside existing interactive elements")
- **External Maps opens via `window.open` with `noopener,noreferrer`** — security requirement (architecture §Authentication & Security)
- **The pill's 44×44px minimum** is already guaranteed by `PILL_LAYOUT_CLASSNAME` (`h-11 min-w-11`) — no sizing changes needed (UX-DR1, UX-DR13)
- **Accessible names must be explicit and distinct from the event name** — UX-DR13 requires "Open directions to {event name}, 12 minutes" / "Enable location for directions to {event name}" / "Couldn't get directions to {event name}" — the last two are from Story 2.1 and Story 2.3 respectively; this story's ready-state label is "Open directions to {event name}, {time}"
- **Google Maps URL format**: `https://www.google.com/maps/dir/?api=1&destination={encoded_address_or_lat,lng}` — this is the standard deep-link format that works on both mobile and desktop. On mobile it opens the native Maps app; on desktop it opens Google Maps in a new tab
- **Address vs Coordinates**: `TripEvent` has `locationAddress` (human-readable address string), `locationLat`/`locationLng` (numeric coordinates), and `locationName` (display name like "Louvre Museum"). For External Maps, prefer `locationAddress` when available (better map rendering), fall back to coordinates

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/lib/open-external-maps.ts` | Utility: constructs Google Maps URL and opens in new tab. Guarded for SSR. |
| `src/lib/open-external-maps.test.ts` | Unit tests for URL construction and window.open behavior |

### Files to MODIFY

| File | Changes |
|------|---------|
| `src/components/packt/distance-time-pill.tsx` | Add `onOpenMaps` prop; change root from `<div role="status">` to `<button>` when `onOpenMaps` provided; update accessible names for interactive states |
| `src/components/packt/distance-time-pill.test.tsx` | Add tests for button rendering, click handling, interactive accessible names, backward compat when no `onOpenMaps` |
| `src/components/packt/now-card.tsx` | Import `openExternalMaps`; create `handleOpenMaps` callback; thread `onOpenMaps` through `NowCardEventRowProps` to `DistanceTimePill` |
| `src/components/packt/now-card.test.tsx` | Add tests for click-to-open-maps, interactive accessible names; verify existing tests pass |
| `tests/e2e/feature-map.mjs` | Register `open-external-maps.ts` in `linked-events` entry |

### Files NOT to touch (explicit scope boundaries)

- `src/db/schema.ts` — no schema changes for this story
- `src/lib/route.ts` — route logic unchanged; this story is about what happens when the pill is tapped, not how route data is fetched
- `src/components/packt/use-route-for-event.ts` — hook unchanged
- `src/app/(app)/trips/[tripId]/route-actions.ts` — server action unchanged
- `src/components/packt/place-row-action-bar.tsx` — Epic 3 scope (Address ButtonGroup)
- `src/components/packt/place-row.tsx` — Epic 4 scope (Schedule Conflict icon)
- `src/components/packt/day-route-strip.tsx` — Epic 4 scope
- `src/components/packt/map-tab.tsx` — Epic 5 scope
- `mini-map-rail.tsx` — dead code removal is Epic 4 scope

### Existing Patterns to Follow

**External Maps URL pattern (no existing utility — this story creates it):**
- Google Maps deep-link: `https://www.google.com/maps/dir/?api=1&destination={encoded}`
- `encodeURIComponent()` for address strings
- Coordinates format: `{lat},{lng}` (no encoding needed for numbers)
- `window.open(url, "_blank", "noopener,noreferrer")` — standard for external navigation

**Button interactive element pattern (from `src/components/ui/`):**
- Existing buttons use `type="button"` explicitly
- Focus-visible ring: check existing button styles in `globals.css`
- The pill's visual style is defined entirely by `PILL_LAYOUT_CLASSNAME` and inline `style` — changing the element type from `<div>` to `<button>` preserves all visual styling

**Test mock pattern for `window.open` (`now-card.test.tsx`):**
```ts
const mockWindowOpen = vi.fn();
vi.stubGlobal("open", mockWindowOpen);
// or: vi.spyOn(window, "open").mockImplementation(mockWindowOpen);
```
- Clean up in `afterEach` with `vi.restoreAllMocks()`

### Key Gotchas

1. **The pill is display-only in Story 2.1 — this story makes it interactive.** Story 2.1's review explicitly deferred this: "Make the Story 2.1 pill display-only until Story 2.2 adds external-map behavior." The `onOpenMaps` callback is the mechanism for this activation.

2. **`<div role="status">` → `<button>` is a semantic change.** When `onOpenMaps` is provided, the pill must be a `<button>` (interactive). When `onOpenMaps` is NOT provided (defensive), keep `<div role="status">` for backward compatibility. The loading state should remain `role="status"` even with `onOpenMaps` since it's not yet interactive (still loading).

3. **`stopPropagation` on the parent `<div>` at `now-card.tsx:152` already prevents card navigation.** The pill's click handler is inside this div, so it won't trigger the card's `router.push`. Verify this in tests — the existing test "does not navigate to the trip detail page when the event row is clicked" (line 377) covers this pattern.

4. **Google Maps URL works on both mobile and desktop.** On mobile, `maps/dir` opens the native Maps app. On desktop, it opens Google Maps in a new tab. No platform detection needed.

5. **Address takes precedence over coordinates.** If both `locationAddress` and `locationLat`/`locationLng` are present, use the address for better map rendering (Google Maps resolves the address to a specific place with a pin). If only coordinates exist (no address), use coordinates directly.

6. **SSR guard is required.** `window.open` will crash during SSR. The `openExternalMaps` utility must check `typeof window !== "undefined"` before calling `window.open`. The component is `"use client"` so it only runs in the browser, but the utility file could theoretically be imported elsewhere — guard defensively.

7. **`useCallback` for `handleOpenMaps`.** The callback depends on `nextEventForRoute` which changes when the next event changes. Wrap in `useCallback` with `[nextEventForRoute]` dependency to avoid unnecessary re-renders of `DistanceTimePill`.

8. **Existing `now-card.test.tsx` tests must still pass.** The addition of `onOpenMaps` prop to `DistanceTimePill` is optional — existing tests that don't pass it will get the backward-compatible `<div role="status">` behavior. No existing test should break.

9. **Feature map registration.** `src/lib/open-external-maps.ts` is a new file. It must be registered in the `linked-events` entry of `tests/e2e/feature-map.mjs` (which already covers `now-card.tsx`, `distance-time-pill.tsx`, `route.ts`, etc.). Run `scripts/feature-map.test.mjs` to verify.

10. **Accessible name format for unavailable state.** UX-DR13 specifies "Couldn't get directions to {eventName}" as the label for the unavailable state — but this is the Story 2.1 label. For the interactive pill, the unavailable state should say "Open maps for {eventName}" since tapping it opens maps (AC 3). The "Couldn't get directions — try again." text remains as the visible error text inside the pill.

### Testing Requirements

- **Unit tests** (Vitest): colocated `*.test.ts` / `*.test.tsx` next to source
  - `src/lib/open-external-maps.test.ts` — new file for URL construction and window.open tests
  - `src/components/packt/distance-time-pill.test.tsx` — extend with button rendering, click handling, interactive accessible names
  - `src/components/packt/now-card.test.tsx` — extend with click-to-open-maps tests, verify existing tests pass
- **E2E tests** (playwright-bdd): no E2E scenario for External Maps opening (requires window.open mocking); covered by unit/component tests
- Coverage threshold: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- Run targeted tests first, then `packt-build-validator` for full validation

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Epic 2, Story 2.2 (lines 281-302)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — §Location & Mapping Infrastructure, §Authentication & Security, §Architectural Boundaries
- UX Design: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/DESIGN.md` — distance-time-pill component spec, External Maps behavior
- UX Experience: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md` — Component Patterns, Accessibility Floor (UX-DR13)
- Previous story: `_bmad-output/implementation-artifacts/2-1-show-live-distance-time-for-the-next-event.md`
- Project context: `_bmad-output/project-context.md` — Next.js, React, Tailwind, component patterns

## Dev Agent Record

### Implementation Plan

Followed red-green-refactor per task. Kept `DistanceTimePill` presentational: it receives an
optional `onOpenMaps` callback and never imports the maps/URL logic. `NowCard` owns the callback
(`handleOpenMaps`, memoized on `nextEventForRoute`) and constructs the destination via
`openExternalMaps`. Loading stays a `role="status"` region (not yet actionable); ready and
unavailable become `<button type="button">` only when `onOpenMaps` is supplied, otherwise they fall
back to the display-only `role="status"` markup for backward compatibility.

### Debug Log

- New interactive pill tests failed as expected before the component change (RED), then passed after
  converting the ready/unavailable states to `<button>` (GREEN).
- Two existing `now-card.test.tsx` assertions queried the ready pill by `role="status"`; updated them
  to `role="button"` with the new "Open directions to …" accessible name now that the Next Event pill
  is interactive.
- `trips-active-entry-panel.test.tsx` / `trips-desktop-layout.test.tsx` mock the route hook to
  `loading`, so the pill stays a status region there — no changes needed (24 tests still pass).

### Completion Notes

- AC 1: Tapping the pill opens Google Maps directions (`maps/dir/?api=1&destination=…`) in a new tab
  with `noopener,noreferrer`; address preferred over coordinates.
- AC 2: Tap target keeps `h-11 min-w-11` (44×44px) in every interactive state — asserted in tests.
- AC 3: Unavailable state still renders the "Couldn't get directions — try again." text and remains a
  tappable button that opens External Maps directly; the maps action is never removed on estimate
  failure.
- AC 4: Accessible name is explicit and distinct — "Open directions to {event}, {min} {mode}" (ready)
  and "Open maps for {event}" (unavailable).
- Targeted Vitest: `open-external-maps.test.ts` (7), `distance-time-pill.test.tsx` (15),
  `now-card.test.tsx` (42), dependent layout tests (24), `feature-map.test.mjs` (6) — all pass.
- No E2E scenario added (opening External Maps needs `window.open` mocking, impractical in Playwright);
  behavior is fully covered by unit/component tests.

### File List

- `src/lib/open-external-maps.ts` (new) — Google Maps deep-link builder, SSR-guarded.
- `src/lib/open-external-maps.test.ts` (new) — URL construction + `window.open` behavior tests.
- `src/components/packt/distance-time-pill.tsx` (modified) — added `onOpenMaps`; interactive button
  states with explicit accessible names.
- `src/components/packt/distance-time-pill.test.tsx` (modified) — interactive-state tests + backward
  compat.
- `src/components/packt/now-card.tsx` (modified) — `handleOpenMaps` callback threaded to the Next
  Event pill.
- `src/components/packt/now-card.test.tsx` (modified) — click-to-open-maps + interactive accessible
  name tests; updated two ready-pill assertions to `role="button"`.
- `tests/e2e/feature-map.mjs` (modified) — registered `open-external-maps.ts` under `linked-events`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — story status → review.

## Change Log

| Date       | Change                                                                              |
| ---------- | ----------------------------------------------------------------------------------- |
| 2026-07-14 | Implemented Story 2.2: interactive distance/time pill opens External Maps on tap.   |
