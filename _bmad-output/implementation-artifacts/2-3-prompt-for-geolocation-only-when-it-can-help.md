---
baseline_commit: 6fc96eb698506fdde29d587b8fdc2eeffe60777e
---

# Story 2.3: Prompt for geolocation only when it can help

Status: review

## Story

As a traveler whose next stop has a saved address,
I want a clear, non-intrusive way to enable location,
So that I can get directions without being nagged when there's nothing to navigate to.

## Acceptance Criteria

1. **Given** the Next Event has Coordinates and geolocation permission has not yet been requested
   **When** the Now Card renders
   **Then** a geo-hint pill occupies the same slot as the distance/time pill, with neutral `surface-2`/`fg-3` styling and label "Enable location for directions"

2. **Given** I tap the geo-hint pill in its not-yet-asked state
   **When** I tap it
   **Then** the native browser permission prompt is triggered — never shown automatically on page load

3. **Given** permission was previously denied
   **When** the Now Card renders
   **Then** the geo-hint pill shows a distinct label communicating the block instead of repeating the same call-to-action, and tapping it again re-attempts rather than silently no-op-ing

4. **Given** the Next Event has no Coordinates (Freeform)
   **When** the Now Card renders
   **Then** the geo-hint pill never appears for it

5. **And** across the geo-hint ↔ distance/time transition, the pill remains a single stable DOM node — only content/label updates, focus is never lost to a remount

## Tasks / Subtasks

- [x] Task 0: Split `NowCardEventRow` out of `now-card.tsx` (prerequisite for all other tasks)
  - [x] Subtask 0.1: Create `src/components/packt/now-card-event-row.tsx`:
    - Move `NowCardEventRowProps` interface and `NowCardEventRow` function (lines 37-223 of `now-card.tsx`) into the new file
    - Add `"use client"` at top
    - Carry over the imports this component needs: `Link`, `ChevronRight`, `LinkedEventBadge`, `RESERVATION_TYPE_META`, `formatAnchorDateTime`, `DistanceTimePill`, `TransitMode`, `RouteResult`, `TripEvent`, `cn`, `formatCurrentSummaryEventTime`, `formatSummaryEventTime`
    - Export `NowCardEventRowProps` and `NowCardEventRow`
  - [x] Subtask 0.2: Update `now-card.tsx`:
    - Remove the moved code (interface + function)
    - Add `import { NowCardEventRow } from "./now-card-event-row"`
    - Remove imports that are now only used by the extracted component (`Link`, `ChevronRight`, `LinkedEventBadge`, `RESERVATION_TYPE_META`, `formatAnchorDateTime`, `formatCurrentSummaryEventTime`, `formatSummaryEventTime`)
    - `now-card.tsx` should drop from ~414 lines to ~250 lines
  - [x] Subtask 0.3: Create `src/components/packt/now-card-event-row.test.tsx`:
    - Move existing `NowCardEventRow`-specific tests from `now-card.test.tsx` into the new test file (tests that render `NowCardEventRow` directly or test row-specific behavior)
    - If no tests render `NowCardEventRow` directly (all go through `NowCard`), create at minimum: renders linked event as button, renders non-linked event as Link + pill, passes transitMode to DistanceTimePill
  - [x] Subtask 0.4: Update `now-card.test.tsx`:
    - Remove any tests that were moved to `now-card-event-row.test.tsx`
    - Verify remaining tests still pass (they render `NowCard` which uses `NowCardEventRow` internally)
  - [x] Subtask 0.5: Run `npx vitest run src/components/packt/now-card.test.tsx` and `npx vitest run src/components/packt/now-card-event-row.test.tsx` — both must pass

- [x] Task 1: Add `GeoHintStatus` type to `src/data/types.ts` (AC: 1, 3)
  - [x] Subtask 1.1: Add a new `GeoHintStatus` type alongside the existing `RouteResult` union:
    ```ts
    export type GeoHintStatus =
      | { state: "prompt"; permissionState: "prompt" | "unknown" }
      | { state: "denied" };
    ```
    - `"prompt"` = permission has not yet been asked or the Permissions API is unavailable (safe default: show geo-hint)
    - `"denied"` = permission was explicitly denied (show distinct "blocked" label)
    - `permissionState` distinguishes `"prompt"` (browser will show a prompt on `getCurrentPosition`) from `"unknown"` (Permissions API unavailable — also triggers a prompt)
  - [x] Subtask 1.2: Update the hook's return type (see Task 2) to carry `geolocationStatus: GeoHintStatus | null` — `null` means no coordinates on the event (Freeform), so the NowCard renders no pill at all

- [x] Task 2: Modify `use-route-for-event.ts` to detect geolocation permission state (AC: 1, 3, 4)
  - [x] Subtask 2.1: Add a `geolocationStatus` state to the hook using `navigator.permissions.query({ name: "geolocation" })`:
    - On mount (or when `eventId`/coordinates change), query permission state
    - If `navigator.permissions` is unavailable (older browsers), default to `{ state: "prompt", permissionState: "unknown" }`
    - Store the `PermissionStatus` object and attach a `change` event listener to react to permission changes without re-mounting
    - Clean up the listener on unmount or when the event changes
  - [x] Subtask 2.2: Change the hook's return type from `RouteResult | null` to a named object. Export:
    ```ts
    export interface UseRouteForEventResult {
      routeResult: RouteResult | null;
      geolocationStatus: GeoHintStatus | null;  // null = no coordinates (Freeform)
    }
    ```
    The `geolocationStatus` field progresses through three stages:
    1. Initially `null` (before the async `navigator.permissions.query()` resolves) — the component renders a neutral loading skeleton in the pill slot
    2. After permission query resolves with coordinates: `{state:"prompt",...}` or `{state:"denied"}` — geo-hint shown
    3. After permission query resolves without coordinates: `null` — no pill rendered
    4. When permission is `"granted"`: `null` and normal route fetch begins — distance/time pill shown
    - Return `{ routeResult: null, geolocationStatus: null }` when the event has no coordinates (Freeform) — AC 4
    - Return `{ routeResult: null, geolocationStatus: { state: "prompt", permissionState: ... } }` when coordinates exist but permission is `"prompt"` or `"unknown"` — the hook should NOT call `getCurrentPosition` in this case; it should return early with the geo-hint status
    - Return `{ routeResult: loading, geolocationStatus: null }` when coordinates exist and permission is `"granted"` — normal flow begins
    - Return `{ routeResult: null, geolocationStatus: { state: "denied" } }` when permission is `"denied"` — show the distinct "blocked" label
  - [x] Subtask 2.3: Refactor the existing `useEffect` to respect the geolocation permission state:
    - Skip the `getCurrentPosition` call when permission is `"prompt"` or `"denied"` — return geo-hint status instead
    - When permission transitions from `"prompt"` → `"granted"` (user accepted via a previous geo-hint tap), begin the normal route fetch flow
    - When permission transitions from `"granted"` → `"prompt"` (user revoked via browser settings), switch back to geo-hint
  - [x] Subtask 2.4: Update `use-route-for-event.test.ts`:
    - Mock `navigator.permissions.query` to return `{ state: "prompt" }` — verify hook returns `geolocationStatus: { state: "prompt" }` and does NOT call `getCurrentPosition`
    - Mock `navigator.permissions.query` to return `{ state: "granted" }` — verify hook proceeds with normal route fetch
    - Mock `navigator.permissions.query` to return `{ state: "denied" }` — verify hook returns `geolocationStatus: { state: "denied" }` and does NOT call `getCurrentPosition`
    - Mock `navigator.permissions` as undefined — verify hook defaults to `geolocationStatus: { state: "prompt", permissionState: "unknown" }`
    - Mock permission transition from `"prompt"` → `"granted"` — verify hook begins route fetch after transition
    - Verify existing tests pass (the hook's behavior for granted-geolocation cases is unchanged)

- [x] Task 3: Update `DistanceTimePill` to render the geo-hint state (AC: 1, 2, 3, 5)
  - [x] Subtask 3.1: Extend `DistanceTimePillProps` to accept the new geo-hint information:
    ```ts
    export interface DistanceTimePillProps {
      eventName: string;
      routeResult: RouteResult;
      transitMode: TransitMode;
      onOpenMaps?: () => void;
      geolocationHint?: GeoHintStatus | null;
      onRequestGeolocation?: () => void;
    }
    ```
    - `geolocationHint` — when non-null and `routeResult` is `null`, the pill renders in geo-hint mode
    - `onRequestGeolocation` — callback invoked when the user taps the geo-hint pill (the NowCard owns this, calling `navigator.geolocation.getCurrentPosition` to trigger the browser prompt)
    - Both props are optional for backward compatibility (existing callers don't pass them)
  - [x] Subtask 3.2: Add the geo-hint rendering branch BEFORE the existing loading/unavailable/ready branches:
    - When `routeResult` is `null` and `geolocationHint` is non-null:
      - Render a `<button type="button">` (same pattern as the interactive states from Story 2.2)
      - Style: `{ background: "var(--surface-2)", color: "var(--fg-3)" }` — neutral fill, NOT accent (DESIGN.md `geo-hint-pill` spec)
      - Same `PILL_LAYOUT_CLASSNAME` (44×44px minimum, guaranteed by `h-11 min-w-11`)
      - Icon: `Navigation` from lucide-react, `size={16} strokeWidth={1.5}` (same as other states)
      - Label text:
        - `geolocationHint.state === "prompt"`: "Enable location for directions" (UX-DR3, EXPERIENCE.md State Patterns)
        - `geolocationHint.state === "denied"`: "Location blocked — enable it in your browser settings" (EXPERIENCE.md State Patterns)
      - `aria-label`:
        - Prompt state: `"Enable location for directions to ${eventName}"`
        - Denied state: `"Location blocked for ${eventName} — enable in browser settings"`
      - `onClick`: calls `onRequestGeolocation` if provided; otherwise does nothing (defensive)
    - The loading state (`routeResult.status === "loading"`) remains a `<div role="status">` — it is NOT affected by this task
  - [x] Subtask 3.3: Verify DOM node stability (AC 5 — UX-DR13 focus continuity):
    - The geo-hint button and the distance/time button share the same parent `<div className="mt-2">` in `now-card.tsx:208`
    - The pill component itself must be the same component instance across the geo-hint ↔ distance/time transition — React keys must NOT be used to force remounts
    - When permission transitions from `"prompt"` → `"granted"`, the `routeResult` changes from `null` to `{status:"loading"}` then `{status:"ready"}` — the DistanceTimePill component stays mounted, only its rendered content changes
    - Focus is preserved because React updates the DOM node in-place rather than destroying and recreating it
  - [x] Subtask 3.4: Update `distance-time-pill.test.tsx`:
    - Add test: renders a `<button>` with `surface-2`/`fg-3` styling when `geolocationHint` is `{state:"prompt"}` and `routeResult` is `null`
    - Add test: label is "Enable location for directions" in prompt state
    - Add test: accessible name is "Enable location for directions to {eventName}" in prompt state
    - Add test: renders a `<button>` with `surface-2`/`fg-3` styling when `geolocationHint` is `{state:"denied"}` and `routeResult` is `null`
    - Add test: label is "Location blocked — enable it in your browser settings" in denied state
    - Add test: accessible name includes the event name in denied state
    - Add test: calls `onRequestGeolocation` when the geo-hint pill is clicked
    - Add test: maintains 44×44px footprint in geo-hint states
    - Add test: does NOT render geo-hint when `routeResult` is non-null (even if `geolocationHint` is provided) — distance/time takes priority
    - Add test: renders nothing (no pill) when `routeResult` is `null` and `geolocationHint` is `null` (Freeform event)
    - Add test: renders nothing when `routeResult` is `null` and `geolocationHint` is not provided (backward compat)

- [x] Task 4: Wire geo-hint logic into `now-card.tsx` (AC: 1, 2, 3, 4, 5)
  - [x] Subtask 4.1: Update `NowCard` to use the new `UseRouteForEventResult` return type:
    - Currently: `const routeResult = useRouteForEvent(nextEventForRoute, tripId, effectiveTransitMode);`
    - Change to: `const { routeResult, geolocationStatus } = useRouteForEvent(nextEventForRoute, tripId, effectiveTransitMode);`
    - `nextEventForRoute` is already filtered to non-linked events with coordinates (`now-card.tsx:242-243`) — when it is `undefined`, `geolocationStatus` will be `null` (Freeform)
  - [x] Subtask 4.2: Create a `handleRequestGeolocation` callback in `NowCard`:
    ```ts
    const handleRequestGeolocation = useCallback(() => {
      if (typeof navigator === "undefined" || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        () => {
          // Permission granted — the hook's permission listener will detect
          // the transition and begin route fetching automatically.
        },
        () => {
          // Permission denied or error — the hook's permission listener
          // will detect the transition to "denied" and update the pill label.
        },
        { timeout: 3000 }
      );
    }, []);
    ```
    - The callback is stable (no dependencies) since it only calls browser APIs
    - `useCallback` is important because `NowCard` re-renders on timer ticks (60s refresh)
    - The `getCurrentPosition` call here is what triggers the browser permission prompt — it is NOT called automatically on page load (AC 2)
    - After the permission state changes, the hook's `PermissionStatus` listener detects the transition and updates `geolocationStatus` → `routeResult` accordingly — no manual state management needed in NowCard
  - [x] Subtask 4.3: Thread `geolocationStatus` and `handleRequestGeolocation` to the `DistanceTimePill`:
    - Add `geolocationHint?: GeoHintStatus | null` and `onRequestGeolocation?: () => void` to `NowCardEventRowProps`
    - Pass `geolocationHint={geolocationStatus}` and `onRequestGeolocation={handleRequestGeolocation}` to the `DistanceTimePill` at `now-card.tsx:209`
    - Only pass these props to the Next Event row (non-linked branch) — linked event rows and the "Now" row are unaffected
  - [x] Subtask 4.4: Update `now-card.test.tsx`:
    - Mock `navigator.permissions.query` to return `{ state: "prompt", addEventListener: vi.fn(), removeEventListener: vi.fn() }` — verify the geo-hint pill renders when the Next Event has coordinates
    - Mock `navigator.geolocation.getCurrentPosition` — verify tapping the geo-hint pill calls `getCurrentPosition` (triggering the browser prompt)
    - Mock `navigator.permissions.query` to return `{ state: "granted" }` — verify the distance/time pill renders instead of the geo-hint
    - Mock `navigator.permissions.query` to return `{ state: "denied" }` — verify the "blocked" label renders
    - Verify existing tests still pass (the geo-hint props are optional, backward compatible)

- [x] Task 5: Update E2E feature map and test coverage
  - [x] Subtask 5.1: `distance-time-pill.tsx` and `use-route-for-event.ts` are already registered in `tests/e2e/feature-map.mjs` under the `linked-events` entry — the new `now-card-event-row.tsx` extracted in Task 0 was registered under the same entry
  - [x] Subtask 5.2: E2E coverage assessment — the geo-hint pill requires mocking `navigator.permissions` and `navigator.geolocation.getCurrentPosition` which is impractical in Playwright; covered by unit/component tests instead
  - [x] Subtask 5.3: Run `scripts/feature-map.test.mjs` to verify contract

- [x] Task 6: Run targeted tests then full validation
  - [x] Subtask 6.1: Run `npx vitest run src/components/packt/use-route-for-event.test.ts` — must pass
  - [x] Subtask 6.2: Run `npx vitest run src/components/packt/distance-time-pill.test.tsx` — must pass
  - [x] Subtask 6.3: Run `npx vitest run src/components/packt/now-card.test.tsx` — must pass (existing + new tests)
  - [x] Subtask 6.4: Run `packt-build-validator` — lint, TypeScript, coverage, build, affected E2E must pass

## Dev Notes

### Previous Story Intelligence

**Story 2.1 (done):** Created `DistanceTimePill` component (presentational, `role="status"`, display-only), `useRouteForEvent` hook, `route-actions.ts` server action, restructured Next Event row into DOM siblings (Link + pill), added `RouteResult` type to `src/data/types.ts`, extended `src/lib/route.ts` with `getRouteDistanceTime()`.

**Story 2.2 (done):** Added `onOpenMaps` callback prop to `DistanceTimePill`; converted ready/unavailable states from `<div role="status">` to `<button type="button">` when `onOpenMaps` provided; created `src/lib/open-external-maps.ts` utility; wired `handleOpenMaps` callback through `NowCardEventRowProps` to `DistanceTimePill`.

**Key learnings from Stories 2.1 and 2.2:**
- `DistanceTimePill` is a **pure presentational component** — all data-fetching logic lives in `use-route-for-event.ts` (Story 2.1 Gotcha #13). The geo-hint permission detection also belongs in the hook, not the component.
- The pill has three visual states today: loading (`role="status"`, neutral skeleton), ready (`button`, accent fill), unavailable (`button`, accent fill + error text). Story 2.3 adds a fourth: geo-hint (`button`, neutral `surface-2`/`fg-3` fill).
- `NowCardEventRow` at `now-card.tsx:47-213` has two branches: linked events (button) and non-linked events (Link + DistanceTimePill). Only the non-linked branch needs changes.
- `nextEventForRoute` at `now-card.tsx:242-243` filters to non-linked events: `nextEvent && !nextEvent.linkedReservationId && !nextEvent.reservationType ? nextEvent : undefined`
- The pill is wrapped in `<div className="mt-2">` at `now-card.tsx:208` — this is the DOM sibling container. The geo-hint pill occupies this exact same slot.
- `stopPropagation` on the parent `<div>` at `now-card.tsx:152` prevents clicks from bubbling to the card's navigate-on-click handler — the geo-hint pill's click is inside this div, so no additional `stopPropagation` needed.
- `trips-active-entry-panel.test.tsx` and `trips-desktop-layout.test.tsx` mock `use-route-for-event` locally — any change to the hook's return type may require updating those mocks. The return type changes from `RouteResult | null` to `UseRouteForEventResult` (an object with `routeResult` and `geolocationStatus` fields). These mocks must be updated to return `{ routeResult: ..., geolocationStatus: null }`.

### Architecture Constraints

- **Geolocation detection is client-only** — `navigator.permissions.query({name: "geolocation"})` and `navigator.geolocation.getCurrentPosition()` are browser APIs. The hook is already `"use client"`, so this is safe.
- **Permission prompt is user-initiated** — AC 2 requires that the browser permission prompt is NEVER shown automatically on page load. The `getCurrentPosition` call that triggers the prompt must only happen when the user taps the geo-hint pill (`onRequestGeolocation` callback).
- **Single stable DOM node (AC 5)** — UX-DR13's focus-continuity rule: the geo-hint pill and the distance/time pill are the same React component instance. When permission transitions from `"prompt"` → `"granted"`, the `routeResult` changes from `null` to `{status:"loading"}` — React updates the DOM in-place, preserving focus. No React `key` prop should be used that would force a remount.
- **44×44px minimum** — already guaranteed by `PILL_LAYOUT_CLASSNAME` (`h-11 min-w-11`). The geo-hint button reuses this same class.
- **Neutral styling (not accent)** — the geo-hint pill uses `surface-2`/`fg-3` fill per DESIGN.md `geo-hint-pill` spec, not the `accent-soft`/`accent-ink` used by the distance/time pill. This visual distinction signals "invitation" vs. "active state."
- **Permissions API fallback** — `navigator.permissions` is not available in all browsers (e.g., older Safari). When unavailable, default to `{state: "prompt"}` — this shows the geo-hint, and tapping it will trigger a `getCurrentPosition` call which itself will show the browser's permission prompt. This is the correct degraded behavior.
- **`RouteResult` stays unchanged** — the geo-hint is NOT a new `RouteResult` status. It is a separate concern (permission state) carried by `geolocationStatus` in the hook's return object. `RouteResult` continues to represent route data only: `loading`, `ready`, `unavailable`. This keeps the route data model clean for other consumers (Day Route Strip, Schedule Conflict, Map Tab).

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/components/packt/now-card-event-row.tsx` | Extracted `NowCardEventRow` component (split from `now-card.tsx`) |
| `src/components/packt/now-card-event-row.test.tsx` | Unit tests for the extracted row component |

### Files to MODIFY

| File | Changes |
|------|---------|
| `src/data/types.ts` | Add `GeoHintStatus` type (new export, no changes to `RouteResult`) |
| `src/components/packt/use-route-for-event.ts` | Add geolocation permission detection; change return type to `UseRouteForEventResult` object; skip `getCurrentPosition` when permission is `"prompt"` or `"denied"` |
| `src/components/packt/use-route-for-event.test.ts` | Add tests for geolocation permission states (`prompt`, `granted`, `denied`, Permissions API unavailable, permission transitions); update existing tests to access `result.current.routeResult` |
| `src/components/packt/distance-time-pill.tsx` | Add `geolocationHint` and `onRequestGeolocation` props; add geo-hint rendering branch before existing branches |
| `src/components/packt/distance-time-pill.test.tsx` | Add tests for geo-hint rendering, click handling, accessible names, DOM stability, backward compat |
| `src/components/packt/now-card.tsx` | Remove `NowCardEventRow` (extracted to own file); destructure new hook return type; create `handleRequestGeolocation` callback; thread `geolocationStatus` and callback to row component |
| `src/components/packt/now-card.test.tsx` | Update mock of `use-route-for-event` to return `{ routeResult: ..., geolocationStatus: null }`; move row-specific tests to `now-card-event-row.test.tsx`; add tests for geo-hint pill rendering, permission prompt triggering |
| `src/components/packt/now-card-event-row.tsx` | Add `geolocationHint` and `onRequestGeolocation` props to `NowCardEventRowProps`; thread them to `DistanceTimePill` |
| `src/components/packt/trips-active-entry-panel.test.tsx` | Update mock of `use-route-for-event` to return `{ routeResult: {status:"loading"}, geolocationStatus: null }` |
| `src/components/packt/trips-desktop-layout.test.tsx` | Update mock of `use-route-for-event` to return `{ routeResult: {status:"loading"}, geolocationStatus: null }` |

### Files NOT to touch (explicit scope boundaries)

- `src/db/schema.ts` — no schema changes for this story
- `src/lib/route.ts` — route logic unchanged; this story is about permission detection, not route fetching
- `src/app/(app)/trips/[tripId]/route-actions.ts` — server action unchanged
- `src/lib/open-external-maps.ts` — maps utility unchanged
- `src/components/packt/place-row-action-bar.tsx` — Epic 3 scope (Address ButtonGroup)
- `src/components/packt/place-row.tsx` — Epic 4 scope (Schedule Conflict icon)
- `src/components/packt/day-route-strip.tsx` — Epic 4 scope
- `src/components/packt/map-tab.tsx` — Epic 5 scope

### Existing Patterns to Follow

**Hook return type pattern (from `use-route-for-event.ts`):**
- The hook currently returns `RouteResult | null` — changing to an object type is a breaking change for callers. All callers must be updated in the same change.
- Three callers exist: `now-card.tsx` (the primary), `trips-active-entry-panel.test.tsx` (mock), `trips-desktop-layout.test.tsx` (mock). All three must be updated.

**Permissions API pattern:**
```ts
async function getGeolocationPermission(): Promise<GeoHintStatus> {
  if (typeof navigator === "undefined" || !navigator.permissions) {
    return { state: "prompt", permissionState: "unknown" };
  }
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state === "granted") return null; // no geo-hint needed
    if (status.state === "denied") return { state: "denied" };
    return { state: "prompt", permissionState: "prompt" };
  } catch {
    return { state: "prompt", permissionState: "unknown" };
  }
}
```

**Test mock pattern for `navigator.permissions` (`use-route-for-event.test.ts`):**
```ts
const mockPermissionStatus = {
  state: "prompt" as PermissionState,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};
vi.stubGlobal("navigator", {
  ...navigator,
  permissions: { query: vi.fn().mockResolvedValue(mockPermissionStatus) },
  geolocation: { getCurrentPosition: vi.fn() },
});
```

**Test mock pattern for `navigator.geolocation` (`now-card.test.tsx`):**
```ts
vi.stubGlobal("navigator", {
  ...navigator,
  geolocation: {
    getCurrentPosition: vi.fn((success) => success({ coords: { latitude: 48.8566, longitude: 2.3522 } })),
  },
});
```

### Key Gotchas

0. **`now-card.tsx` is 414 lines — split first.** `NowCardEventRow` (lines 37-223) is a self-contained component with its own props interface. Extract it to `now-card-event-row.tsx` before adding geo-hint logic. This brings `now-card.tsx` under 250 lines and gives the row component its own test file. The split is a pure refactor — no behavior change, no new props yet.

1. **The hook's return type is changing.** `useRouteForEvent` currently returns `RouteResult | null`. After this story it returns `UseRouteForEventResult` (an object). Every caller must be updated. There are exactly three callers: `now-card.tsx`, and two test files that mock the hook. Miss one and the build breaks.

2. **Geolocation detection must NOT call `getCurrentPosition` on mount.** AC 2 requires the browser prompt is never shown automatically. The `getCurrentPosition` call that triggers the prompt only happens in `handleRequestGeolocation` (user-initiated). The hook's permission detection uses `navigator.permissions.query()`, which is passive — it reads the state without triggering a prompt.

3. **The geo-hint pill is NOT a `RouteResult` status.** It is a separate concern (`geolocationStatus`) in the hook's return object. This keeps `RouteResult` clean for downstream consumers (Day Route Strip, Schedule Conflict, Map Tab) who don't need to know about permission state. Do NOT add `"geo-hint"` to the `RouteResult` union.

4. **`trips-active-entry-panel.test.tsx` and `trips-desktop-layout.test.tsx` mock the hook.** They currently mock `use-route-for-event` to return a `RouteResult`. After the return type changes to an object, these mocks must be updated to return `{ routeResult: ..., geolocationStatus: null }`. If not updated, the tests will fail because they'll try to destructure the new object type from what is still a flat value.

5. **The geo-hint button must NOT trigger External Maps.** The geo-hint pill's tap action is `onRequestGeolocation` (request permission), NOT `onOpenMaps` (open maps). These are mutually exclusive: the geo-hint is shown when there is no location permission, so there is no route data to navigate with. The pill should not offer to open maps until permission is granted and route data is available.

6. **Permission state transitions must be reactive.** If the user accepts the permission prompt (via the geo-hint pill tap), the `PermissionStatus` listener detects `"prompt"` → `"granted"` and the hook automatically begins route fetching. No manual state reset is needed in NowCard. This is the power of using `navigator.permissions.query()` with a change listener.

7. **Focus continuity across the transition (AC 5).** When permission transitions from `"prompt"` → `"granted"`, the `DistanceTimePill` component stays mounted. The `routeResult` changes from `null` → `{status:"loading"}` → `{status:"ready"}`. React updates the DOM node in-place. No React `key` prop should be used on the pill that would force a remount and lose focus.

8. **The denied label must be distinct from the prompt label.** UX-DR3 and EXPERIENCE.md State Patterns specify different text for the two states:
   - Prompt: "Enable location for directions"
   - Denied: "Location blocked — enable it in your browser settings"
   Using the same text for both is a UX violation.

9. **`onRequestGeolocation` callback stability.** The callback has no dependencies (it only calls browser APIs), so it should be wrapped in `useCallback(() => { ... }, [])` with an empty dependency array. This prevents unnecessary re-renders of `DistanceTimePill` on NowCard's 60s timer tick.

10. **`geolocationStatus: null` means no coordinates (Freeform).** When the Next Event is Freeform (no coordinates), the hook returns `{ routeResult: null, geolocationStatus: null }`. The NowCard should NOT render any pill at all in this case — the row looks exactly as it does today. This is AC 4's guardrail.

### Testing Requirements

- **Unit tests** (Vitest): colocated `*.test.ts` / `*.test.tsx` next to source
  - `src/components/packt/use-route-for-event.test.ts` — extend with geolocation permission state tests
  - `src/components/packt/distance-time-pill.test.tsx` — extend with geo-hint rendering, click handling, accessible names, backward compat
  - `src/components/packt/now-card.test.tsx` — extend with geo-hint pill rendering, permission prompt triggering, granted/denied states
- **E2E tests** (playwright-bdd): no E2E scenario for geo-hint pill (requires mocking `navigator.permissions` and `navigator.geolocation` which is impractical in Playwright); covered by unit/component tests
- Coverage threshold: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- Run targeted tests first, then `packt-build-validator` for full validation

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Epic 2, Story 2.3 (lines 303-327)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — §Location & Mapping Infrastructure, §Frontend Architecture, §Architectural Boundaries
- UX Design: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/DESIGN.md` — `geo-hint-pill` component spec (lines 23-31), `distance-time-pill` spec (lines 14-22)
- UX Experience: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md` — Component Patterns (geo-hint pill row, lines 54-55), State Patterns (lines 72-74), Accessibility Floor (lines 110-112), Interaction Primitives (lines 96-97)
- Previous stories: `_bmad-output/implementation-artifacts/2-1-show-live-distance-time-for-the-next-event.md`, `_bmad-output/implementation-artifacts/2-2-open-external-maps-from-the-distance-time-pill.md`
- Project context: `_bmad-output/project-context.md` — Next.js, React, Tailwind, component patterns

## Dev Agent Record

### Implementation Plan

Implemented in task order per the story:

1. Split `NowCardEventRow` out of `now-card.tsx` into `now-card-event-row.tsx` (pure refactor, no behavior change) so the geo-hint wiring in Task 4 had a smaller, focused component to change.
2. Added the `GeoHintStatus` union type to `src/data/types.ts`, kept separate from `RouteResult` per the architecture constraint (permission state is a distinct concern from route data).
3. Rewrote `useRouteForEvent` to detect geolocation permission via `navigator.permissions.query({name:"geolocation"})`, gating the existing `getCurrentPosition`-driven route-fetch effect behind `permission === "granted"`. The "Permissions API unavailable" case is derived synchronously during render (`permissionsApiAvailable`) rather than via a synchronous `setState` inside the effect, to satisfy the `react-hooks/set-state-in-effect` lint rule while keeping the async `.query()` result flow through state + a `change` listener.
4. Added the geo-hint rendering branch to `DistanceTimePill` (before the loading/unavailable/ready branches), widening `routeResult` to `RouteResult | null` since the geo-hint state is signaled by a null route result plus a non-null `geolocationHint`.
5. Wired `geolocationStatus`/`handleRequestGeolocation` from `NowCard` through `NowCardEventRow` to `DistanceTimePill`, only for the Next Event row. Narrowed the pre-existing "unavailable + Open Maps fallback" logic so it only applies when permission is granted but the live fetch itself fails (not when permission is merely un-granted, which now shows the geo-hint instead).
6. Registered the new `now-card-event-row.tsx` file under the existing `linked-events` E2E feature-map entry; no new E2E scenario added since mocking `navigator.permissions`/`navigator.geolocation` is impractical in Playwright — covered by unit/component tests instead (per Dev Notes).

### Debug Log

- `packt-build-validator`'s ESLint worker initially failed on `react-hooks/set-state-in-effect` for two synchronous `setGeoPermission(...)` calls inside the permission-detection effect (the `!hasCoordinates` early-return branch, and the "Permissions API unavailable" branch). Fixed by deriving `permissionsApiAvailable` and `effectiveGeoPermission` synchronously in the render body instead of via effect-triggered state, and dropping the now-redundant `setGeoPermission(null)` reset (already unreachable in the derived output once `!hasCoordinates` short-circuits the return).
- The first `packt-build-validator` run showed 4 unrelated E2E failures (`packing-tab`, `reservations`, `save-trip-as-template`, `spending`) via `page.goto` timeouts ~24 minutes into a 30-minute run, plus a corrupted `.next-e2e/dev/types/routes.d.ts` that broke `tsc`. Both were caused by running lint/tsc/coverage/build/E2E as five concurrent heavy processes on one machine. Deleted the stale generated `.next-e2e/dev/types/routes.d.ts` (gitignored build cache) to unblock `tsc`, then re-ran the affected E2E suite in isolation: all 170 scenarios passed in 3.1 minutes, confirming the failures were resource contention, not a regression.

### Completion Notes

- All 6 tasks and their subtasks complete. AC 1–5 satisfied: geo-hint pill occupies the distance/time pill's slot with neutral `surface-2`/`fg-3` styling and "Enable location for directions" label when permission hasn't been requested (AC1); tapping it calls `navigator.geolocation.getCurrentPosition` only on tap, never on page load (AC2); denied permission shows a distinct "Location blocked — enable it in your browser settings" label and re-attempts on tap rather than no-op (AC3); Freeform events (no coordinates) never render the geo-hint (AC4); the geo-hint and distance/time states render from the same `DistanceTimePill` instance with no React `key` forcing a remount, preserving focus across the transition (AC5).
- `packt-build-validator`: LINT PASS, TSC PASS, COVERAGE PASS (2978 tests, lines 96.16%, functions 96.36%, branches 90.13%), E2E PASS (170/170, confirmed via isolated re-run), BUILD PASS.

### File List

- `src/components/packt/now-card-event-row.tsx` (new)
- `src/components/packt/now-card-event-row.test.tsx` (new)
- `src/data/types.ts` (modified — added `GeoHintStatus`)
- `src/components/packt/use-route-for-event.ts` (modified — permission detection, new `UseRouteForEventResult` return type)
- `src/components/packt/use-route-for-event.test.ts` (modified — rewritten for new contract + geolocation permission tests)
- `src/components/packt/distance-time-pill.tsx` (modified — geo-hint rendering branch, `geolocationHint`/`onRequestGeolocation` props)
- `src/components/packt/distance-time-pill.test.tsx` (modified — geo-hint test coverage)
- `src/components/packt/now-card.tsx` (modified — extracted row component, new hook destructuring, `handleRequestGeolocation`)
- `src/components/packt/now-card.test.tsx` (modified — updated mock shape, new geo-hint pill tests)
- `src/components/packt/trips-active-entry-panel.test.tsx` (modified — updated `use-route-for-event` mock shape)
- `src/components/packt/trips-desktop-layout.test.tsx` (modified — updated `use-route-for-event` mock shape)
- `tests/e2e/feature-map.mjs` (modified — registered `now-card-event-row.tsx` under `linked-events`)

## Change Log

| Date | Change |
|------|--------|
| 2026-07-14 | Story created — ready for dev |
| 2026-07-14 | Implementation complete — all 6 tasks done, packt-build-validator PASS, status moved to review |
