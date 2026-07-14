---
baseline_commit: b4e8be2635626c826908611c92bf419e065d9ee1
---

# Story 2.1: Show live distance/time for the Next Event

Status: review

## Story

As a traveler on a trip day,
I want to see live distance and travel time to my next stop,
so that I know how far I am without digging through the itinerary.

## Acceptance Criteria

1. **Given** the Next Event has Coordinates and geolocation permission is granted
   **When** the Now Card renders
   **Then** it shows a `DistanceTimePill` in its distance/time state with live distance and time

2. **Given** distance/time is being calculated
   **When** the pill first renders
   **Then** it shows a neutral skeleton fill — never a stale, zero, or dashed value

3. **Given** the Now Card is visible and the tab has focus
   **When** 60 seconds elapse
   **Then** distance/time refreshes using a single `getCurrentPosition()` reading (not `watchPosition()`); refresh pauses when the tab is backgrounded

4. **Given** the Directions API call exceeds 3 seconds or fails for any reason
   **When** this happens
   **Then** `RouteResult` resolves to `{status: "unavailable"}`, the pill displays "Couldn't get directions — try again." instead of blank or omitted text, and the Now Card is never blocked from rendering

5. **Given** the Next Event has no Coordinates (Freeform)
   **When** the Now Card renders
   **Then** no pill, placeholder, or hint appears at all — the row looks exactly as it does today

6. **Given** the Next Event row's restructure
   **When** the pill is added
   **Then** the name/time area (existing `Link`) and the pill are genuine DOM siblings in their own tap zones — the pill is never nested inside the row's outer `Link`, and the existing link's accessible name/behavior is unchanged

7. **Given** any Event or Reservation title text
   **When** it is saved, viewed, or used in route computation
   **Then** Packt never derives Coordinates from that text automatically

8. **And** the distance/time lookup never blocks initial page render, and repeated requests for the same origin/destination/mode within 24 hours are served from `route_cache` instead of a new Directions API call

## Tasks / Subtasks

- [x] Task 1: Add `RouteResult` type to `src/data/types.ts` (AC: 1, 4, 6)
  - [x] Subtask 1.1: Add `RouteResult` discriminated union:
    ```ts
    export type RouteResult =
      | { status: "loading" }
      | { status: "ready"; distanceMeters: number; durationSeconds: number }
      | { status: "unavailable" };
    ```
  - [x] Subtask 1.2: Add tests for the type shape in `src/data/types.test.ts` (if it exists) or verify import compiles

- [x] Task 2: Extend `src/lib/route.ts` with Directions API call and cache (AC: 1, 2, 4, 8)
  - [x] Subtask 2.1: Add `getRouteDistanceTime(origin, destination, transitMode)` function that:
    - Checks `route_cache` for a matching entry with `fetchedAt` < 24 hours ago → return cached result
    - On cache miss: calls Mapbox Directions API server-side (`https://api.mapbox.com/directions/v5/mapbox/{mode}/{originLng},{originLat};{destinationLng},{destinationLat}?access_token={token}`)
    - Maps Mapbox profile name: `"walk"` → `"walking"`, `"drive"` → `"driving"`, `"transit"` → `"mapbox/transit"`
    - Implements 3-second timeout via `AbortSignal.timeout(3000)`
    - On success: writes to `route_cache`, returns `{ status: "ready", distanceMeters, durationSeconds }`
    - On any failure: returns `{ status: "unavailable" }`
    - Distance: `Math.round(routes[0].distance)` (Mapbox returns meters as float)
    - Duration: `Math.round(routes[0].duration)` (Mapbox returns seconds as float)
    - Token: `process.env.MAPBOX_ACCESS_TOKEN` — same env var the existing `searchLocations`/`searchAddressLocations` in `actions.ts` use
  - [x] Subtask 2.2: Export `GeoCoords` input type or accept `{ lat: number; lng: number }` params matching the existing `GeoCoords` from `@/data/types`
  - [x] Subtask 2.3: Write `src/lib/route.test.ts` tests:
    - Cache hit returns cached result without API call
    - Cache miss calls API and stores result
    - Cache expired (>24h) triggers fresh API call
    - API timeout returns `{ status: "unavailable" }`
    - API error returns `{ status: "unavailable" }`
    - Walk mode maps to "walking" profile
    - Distance/duration are rounded to integers
    - Mock `fetch` and `db` for all tests
  - [x] Subtask 2.4: Keep existing `resolveEffectiveMode` function unchanged — it is independently tested and consumed

- [x] Task 3: Create `DistanceTimePill` component (AC: 1, 2, 4, 5, 6, 7)
  - [x] Subtask 3.1: Create `src/components/packt/distance-time-pill.tsx` with `"use client"` at top
  - [x] Subtask 3.2: Define `DistanceTimePillProps`:
    ```ts
    interface DistanceTimePillProps {
      eventName: string;
      routeResult: RouteResult;
      coordinates?: GeoCoords;
      onClick?: () => void;
    }
    ```
  - [x] Subtask 3.3: Implement three visual states:
    - **Loading** (`status: "loading"`): neutral `surface-2`/`fg-3` skeleton fill, `lucide:navigation` icon, no text
    - **Ready** (`status: "ready"`): `accent-soft` bg, `accent-ink` text, `lucide:navigation` icon, text like "12 min walk" or "3.2 km drive" — format distance using the trip's `distanceUnit` (pass as prop or infer from context)
    - **Unavailable** (`status: "unavailable"`): `accent-soft` bg, `accent-ink` text, error text "Couldn't get directions — try again." — still tappable, still opens maps
  - [x] Subtask 3.4: Size the pill to 44×44px minimum on both axes — use `h-11 min-w-11` or equivalent
  - [x] Subtask 3.5: Use `rounded-full` shape, `lucide:navigation` icon with `strokeWidth={1.5}`
  - [x] Subtask 3.6: Accessible name: "Open directions to {eventName}, {time}" when ready; "Enable location for directions to {eventName}" when geo-hint (Story 2.3); "Couldn't get directions to {eventName}" when unavailable
  - [x] Subtask 3.7: The pill is a standalone `<button>` element, not wrapped in a `Link`
  - [x] Subtask 3.8: Create `src/components/packt/distance-time-pill.test.tsx`:
    - Renders loading skeleton when status is "loading"
    - Renders distance/time text when status is "ready"
    - Renders error text when status is "unavailable"
    - Calls onClick when tapped
    - Has accessible name containing event name
    - Meets 44×44px minimum (assert on rendered dimensions)
    - Never renders stale/zero values during loading state

- [x] Task 4: Restructure Next Event row in `now-card.tsx` (AC: 1, 5, 6)
  - [x] Subtask 4.1: In `NowCardEventRow`, for the non-linked event branch (the `Link` element starting at line 143):
    - Remove the hardcoded distance placeholder at lines 196-197 (`<span style={{ margin: "0 6px", color: "var(--line)" }}>·</span>—<span style={{ margin: "0 6px", color: "var(--line)" }}>·</span>— km`)
    - Keep the `eventTimeLabel` on its own line
  - [x] Subtask 4.2: Wrap the existing `Link` and the new `DistanceTimePill` in a parent `<div>` that preserves the visual stacking (name/time above, pill below)
  - [x] Subtask 4.3: The `Link` and `DistanceTimePill` must be **genuine DOM siblings** — the pill is NOT nested inside the `Link`
  - [x] Subtask 4.4: Only show `DistanceTimePill` when `event.locationLng` and `event.locationLat` exist (Located Item); otherwise render nothing (AC: 5)
  - [x] Subtask 4.5: Pass `routeResult` from parent — the NowCard uses the `useRouteForEvent` hook (Task 5) to get the result and passes it to `NowCardEventRow`
  - [ ] Subtask 4.6: Remove `mini-map-rail.tsx` reference if it exists as dead code (confirmed safe to remove per epics.md) — **intentionally not done**: this story's own "Files NOT to touch" boundary explicitly lists `mini-map-rail.tsx` as Epic 4 scope; deferred to avoid contradicting the documented scope boundary

- [x] Task 5: Create `use-route-for-event.ts` hook for route fetching (AC: 1, 3, 4, 8)
  - [x] Subtask 5.1: Create `src/components/packt/use-route-for-event.ts` — custom hook that manages route fetching lifecycle:
    - Accepts `event: TripEvent` and `tripId: string`
    - On mount/update: if event has Coordinates and geolocation is available, call server action `getRouteDistanceTime` (from Task 2)
    - Returns `RouteResult` — starts as `{ status: "loading" }`, updates to `{ status: "ready", ... }` or `{ status: "unavailable" }`
    - If event has no Coordinates, returns `{ status: "unavailable" }` immediately (no fetch)
  - [x] Subtask 5.2: Implement 60-second refresh cadence inside the hook:
    - Use `setInterval` with 60s period
    - Pause when `document.hidden === true` (tab backgrounded) — listen to `visibilitychange` event
    - Resume when tab becomes visible again
    - Single `getCurrentPosition()` call per tick, not `watchPosition()`
    - Clean up interval and event listener on unmount
  - [x] Subtask 5.3: Do NOT block initial page render — route fetching is a non-blocking side effect via `useEffect`
  - [x] Subtask 5.4: Create `src/components/packt/use-route-for-event.test.ts`:
    - Test: returns loading state initially
    - Test: returns ready state after successful fetch
    - Test: returns unavailable on fetch error
    - Test: returns unavailable when event has no coordinates
    - Test: refreshes after 60 seconds
    - Test: pauses refresh when document is hidden
    - Test: cleans up interval on unmount
  - [x] Subtask 5.5: Create server action in a NEW file (not `actions.ts` which is already 745 lines):
    - Create `src/app/(app)/trips/[tripId]/route-actions.ts` with `"use server"` at top
    - Export `getRouteDistanceTime(tripId, origin, destination, transitMode)` — calls `requireUser()`, then `assertTripAccess(tripId, userId, "viewer")`, then `route.ts`'s `getRouteDistanceTime`
    - Create `src/app/(app)/trips/[tripId]/route-actions.test.ts` — test auth, validation, delegation to route.ts

- [x] Task 6: Update E2E feature map and test coverage
  - [x] Subtask 6.1: Register `src/components/packt/distance-time-pill.tsx` in the `linked-events` entry of `tests/e2e/feature-map.mjs` (since `now-card.tsx` is already covered there)
  - [x] Subtask 6.2: Verify `scripts/feature-map.test.mjs` contract test passes
  - [x] Subtask 6.3: Consider E2E scenario for Now Card distance/time display (geolocation mock needed — may be deferred if E2E mocking is complex) — deferred; covered instead by unit/component tests (hook + pill + now-card) per Testing Requirements

- [x] Task 7: Run targeted tests then full validation
  - [x] Subtask 7.1: Run `npx vitest run src/lib/route.test.ts` — must pass
  - [x] Subtask 7.2: Run `npx vitest run src/components/packt/distance-time-pill.test.tsx` — must pass
  - [x] Subtask 7.3: Run `npx vitest run src/components/packt/now-card.test.tsx` — must pass (existing tests must not break)
  - [x] Subtask 7.4: Run `npx vitest run src/lib/route.test.ts` — existing tests must still pass
  - [x] Subtask 7.5: Run `packt-build-validator` — lint, TypeScript, coverage, build, affected E2E must pass

## Dev Notes

### Previous Story Intelligence

**Story 1.1 (done):** Created `TransitMode` type, `route_cache` table in `src/db/schema.ts` (lines 112-129), `resolveEffectiveMode` in `src/lib/route.ts`, DB columns on `users` and `trips`, profile preferences UI. The `route_cache` table has columns: `origin_lat`, `origin_lng`, `destination_lat`, `destination_lng`, `transit_mode`, `distance_meters`, `duration_seconds`, `fetched_at` — with a composite primary key on `(origin_lat, origin_lng, destination_lat, destination_lng, transit_mode)`.

**Story 1.2 (done):** Wired `createTrip` to seed `trips.transitMode` via `input.transitMode ?? user.transitMode ?? TransitMode.Drive`.

**Story 1.3 (done):** Created `GettingAroundSection` component, `transit-actions.ts` server action, wired into trip edit sheet. Established the `ToggleGroup` pattern from `preferences-section.tsx`.

**Key learnings from Epic 1:**
- `src/lib/route.ts` is the single ownership point for route/distance logic — this story extends it, not replaces it
- `route_cache` table schema is already in place — just needs read/write logic
- `process.env.MAPBOX_ACCESS_TOKEN` is the token used everywhere (see `src/app/(app)/trips/actions.ts` lines 806-808, 868-870, 918-920)
- `db` from `@/db` is the singleton postgres client — use `db.select().from(routeCache)` pattern
- `sql` from `drizzle-orm` is used for raw SQL expressions in schema — for queries, use Drizzle's query builder
- `isTransitMode()` from `@/lib/db-mappers` validates transit mode values
- Auth pattern: `requireUser()` then `assertTripAccess(tripId, userId, "editor")` — 3-arg call
- `revalidatePath()` after mutations
- `useNow()` from `@/components/providers/mock-date-provider` for "now" in client components
- Test mocks for `next/link`, `next/navigation`, `lucide-react` are established in `now-card.test.tsx`

### Architecture Constraints

- **Directions API calls happen server-side only** — the Mapbox token is never exposed to the client (architecture §Authentication & Security, NFR-6)
- **`RouteResult` discriminated union** is the single shape for all route consumers: `{status:"loading"} | {status:"ready", distanceMeters, durationSeconds} | {status:"unavailable"}` (architecture §Format Patterns)
- **Distance/duration stored as plain integers** — not the numeric-string currency convention (architecture §Format Patterns)
- **Per-hop transit mode resolution** uses `resolveEffectiveMode()` from Story 1.1 — already in `route.ts`, call it to determine which Mapbox profile to use
- **Mapbox Directions API endpoint**: `https://api.mapbox.com/directions/v5/mapbox/{profile}/{lng1},{lat1};{lng2},{lat2}?access_token={token}`
  - Profiles: `walking`, `driving`, `mapbox/transit` (note: "transit" profile has "mapbox/" prefix)
  - Response: `routes[0].distance` (meters, float), `routes[0].duration` (seconds, float)
- **3-second timeout** on Directions API calls — `AbortSignal.timeout(3000)` — resolves to `{status: "unavailable"}` on timeout
- **Cache TTL: 24 hours** — check `fetchedAt` against current time before using cached entry
- **`route.ts` ownership split**: Story 1.1 created the file with `resolveEffectiveMode`; this story adds the Directions API call and cache logic to the same file — no new file needed
- **`now-card.tsx` is a Client Component** (`"use client"` at top) — route fetching must happen client-side, but the actual Directions API call must be proxied through a server action to keep the token server-side

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/components/packt/distance-time-pill.tsx` | Client component: DistanceTimePill with loading/ready/unavailable states |
| `src/components/packt/distance-time-pill.test.tsx` | Unit tests for the component |
| `src/components/packt/use-route-for-event.ts` | Custom hook: manages route fetching lifecycle, 60s refresh, visibility pause |
| `src/components/packt/use-route-for-event.test.ts` | Unit tests for the hook |
| `src/app/(app)/trips/[tripId]/route-actions.ts` | Server action: `getRouteDistanceTime` with auth + delegation to route.ts |
| `src/app/(app)/trips/[tripId]/route-actions.test.ts` | Unit tests for the server action |

### Files to MODIFY

| File | Changes |
|------|---------|
| `src/data/types.ts` | Add `RouteResult` type |
| `src/lib/route.ts` | Add `getRouteDistanceTime()` function with Directions API call, cache read/write, timeout handling |
| `src/lib/route.test.ts` | Add tests for `getRouteDistanceTime` — cache hit/miss, timeout, error, profile mapping |
| `src/components/packt/now-card.tsx` | Remove hardcoded distance placeholder (lines 196-197); restructure Next Event row into two sibling zones (Link + DistanceTimePill); wire `useRouteForEvent` hook into NowCardEventRow |
| `src/components/packt/now-card.test.tsx` | Update tests for restructured row; add DistanceTimePill rendering tests |
| `tests/e2e/feature-map.mjs` | Register `distance-time-pill.tsx` and `use-route-for-event.ts` in the `linked-events` entry |

### Files NOT to touch (explicit scope boundaries)

- `src/db/schema.ts` — `route_cache` table already exists from Story 1.1
- `src/lib/db-mappers.ts` — no new mappings needed for this story
- `src/components/packt/getting-around-section.tsx` — Epic 1 scope (done)
- `src/app/(app)/trips/[tripId]/transit-actions.ts` — Epic 1 scope (done)
- `src/components/packt/place-row-action-bar.tsx` — Epic 3 scope
- `src/components/packt/place-row.tsx` — Epic 4 scope
- `src/components/packt/day-route-strip.tsx` — Epic 4 scope
- `src/components/packt/map-tab.tsx` — Epic 5 scope
- `src/app/api/mapbox/static/route.ts` — existing static proxy, may be reused for Day Route Strip thumbnail in Epic 4, not this story
- `mini-map-rail.tsx` — dead code removal confirmed safe but is Epic 4 scope, not this story

### Existing Patterns to Follow

**Server action with auth** (`src/app/(app)/trips/actions.ts`):
```ts
"use server";
import { requireUser } from "@/lib/auth-helpers";
import { assertTripAccess } from "@/lib/auth-helpers";

// Pattern:
const sessionUser = await requireUser();
await assertTripAccess(tripId, sessionUser.id!, "viewer");
```

**Mapbox token access** (`src/app/(app)/trips/actions.ts`):
```ts
const token = process.env.MAPBOX_ACCESS_TOKEN;
if (!token) throw new Error("MAPBOX_ACCESS_TOKEN is not configured");
```

**Drizzle query pattern** (for reading `route_cache`):
```ts
import { db } from "@/db";
import { routeCache } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const cached = await db.select().from(routeCache)
  .where(and(
    eq(routeCache.originLat, origin.lat),
    eq(routeCache.originLng, origin.lng),
    eq(routeCache.destLat, destination.lat),
    eq(routeCache.destLng, destination.lng),
    eq(routeCache.transitMode, transitMode),
  ))
  .limit(1);
```

**Drizzle insert pattern** (for writing `route_cache`):
```ts
await db.insert(routeCache).values({
  originLat: origin.lat,
  originLng: origin.lng,
  destLat: destination.lat,
  destLng: destination.lng,
  transitMode,
  distanceMeters,
  durationSeconds,
});
```

**Now Card event row structure** (`now-card.tsx` lines 143-200):
- Non-linked events render as `<Link>` elements
- Current structure: label → event name → time + hardcoded distance placeholder
- This story removes the placeholder and adds `DistanceTimePill` as a sibling below the `Link`

**Test mock pattern for `next/link`** (`now-card.test.tsx` lines 15-31):
```tsx
vi.mock("next/link", () => ({
  default: ({ children, href, className, style }) => (
    <a href={href} className={className} style={style}>{children}</a>
  ),
}));
```

**`useNow()` pattern** — already used in `now-card.tsx` line 212, provides `Date` from `MockDateProvider`

### Key Gotchas

1. **`route.ts` already exists** — do NOT create a new file. Add `getRouteDistanceTime` to the existing file alongside `resolveEffectiveMode` (which stays unchanged).

2. **Server action required for Directions API** — the Mapbox token must stay server-side. Create a NEW file `src/app/(app)/trips/[tripId]/route-actions.ts` (not add to the existing `actions.ts` which is already 745 lines). The hook calls this server action, not `route.ts` directly.

3. **Transit mode mapping is not 1:1** — Mapbox profiles are `walking`, `driving`, `mapbox/transit`. The internal `TransitMode` values are `walk`, `drive`, `transit`. Map each: `"walk"` → `"walking"`, `"drive"` → `"driving"`, `"transit"` → `"mapbox/transit"`. Use `resolveEffectiveMode()` from Story 1.1 to determine which mode to use for each hop before mapping.

4. **The 60s refresh must pause when tab is hidden** — use `document.addEventListener("visibilitychange", ...)` or `document.hidden`. Do NOT use `watchPosition()` (battery drain, violates NFR-3).

5. **Distance formatting** — show distance in the user's preferred unit. Check `distanceUnit` from the trip or user profile. Format: "12 min walk" / "3.2 km drive" / "0.5 mi walk". Keep it plain and factual (UX-DR16).

6. **Freeform Items (no Coordinates)** — no pill at all. Check `event.locationLng` and `event.locationLat` — if either is missing, skip the pill entirely.

7. **DOM sibling requirement is critical** — the pill and the `Link` must be genuine siblings, not nested. This is an accessibility requirement (UX-DR2, UX-DR13). The pill's focus must be independent of the link's focus.

8. **RouteResult `status: "loading"` must show skeleton** — never show stale, zero, or placeholder values. The skeleton fill uses `surface-2`/`fg-3` colors, not `accent-soft`.

9. **Cache TTL is 24 hours** — check `Date.now() - fetchedAt.getTime() < 24 * 60 * 60 * 1000`. If expired, treat as cache miss.

10. **The 3-second timeout** must use `AbortSignal.timeout(3000)` on the `fetch` call. On timeout or any error, return `{ status: "unavailable" }` — never throw.

11. **Existing `now-card.test.tsx` tests must still pass** — the restructuring changes the DOM structure. Update tests that check for the hardcoded distance text (there are none currently — the placeholder "· — · — km" is not asserted in tests). But verify that all existing assertions about event names, labels, and links still pass.

12. **`feature-map.mjs` contract** — register `src/components/packt/distance-time-pill.tsx` in the `linked-events` entry (which already covers `now-card.tsx`). Run `scripts/feature-map.test.mjs` to verify.

13. **Geolocation permission is NOT requested by this story** — that's Story 2.3's scope. This story assumes geolocation is already available (granted in a previous session or by Story 2.3). If geolocation is not available, the pill should not render (that's the geo-hint pill from Story 2.3).

14. **`distance-time-pill.tsx` is a pure presentational component** — it receives `routeResult` as a prop and renders the appropriate state. All fetching logic lives in `use-route-for-event.ts`. This keeps the component testable without mocking server actions.

### Testing Requirements

- **Unit tests** (Vitest): colocated `*.test.ts` / `*.test.tsx` next to source
  - `src/lib/route.test.ts` — extend with `getRouteDistanceTime` tests (cache, API, timeout, error, profile mapping)
  - `src/components/packt/distance-time-pill.test.tsx` — new file for component rendering tests
  - `src/components/packt/now-card.test.tsx` — update for restructured row; add DistanceTimePill rendering tests
- **E2E tests** (playwright-bdd): consider extending `tests/e2e/features/linked-events.feature` if geolocation can be mocked in E2E; otherwise defer to manual validation
- Coverage threshold: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- Run targeted tests first, then `packt-build-validator` for full validation

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Epic 2, Story 2.1 (lines 243-280)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — §Location & Mapping Infrastructure, §Data Model, §Implementation Patterns
- UX Design: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/DESIGN.md` — distance-time-pill component spec
- UX Experience: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md` — Component Patterns, State Patterns, Accessibility Floor
- Project context: `_bmad-output/project-context.md` — Next.js, React, Tailwind, component patterns
- Previous story: `_bmad-output/implementation-artifacts/1-3-set-trip-transit-default-via-getting-around-section.md`

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Initial `packt-build-validator` run flagged 3 issues, all fixed in this pass:
  - `use-route-for-event.ts` TS2322: closures inside nested functions didn't narrow `locationLat`/`locationLng` past the effect's early-return guard — fixed by capturing a `destination` const right after the guard.
  - `react-hooks/set-state-in-effect` lint error on a synchronous `setState` call in the no-coordinates branch of the effect — fixed by removing that branch's `setState` entirely and instead deriving the hook's return value as `hasCoordinates ? routeResult : { status: "unavailable" }`.
  - Global branch coverage dropped to 89.92% (threshold 90%) after the new code's uncovered branches (missing-token / no-routes in `route.ts`, missing-geolocation in the hook, click-stopPropagation and non-default transitMode in `now-card.tsx`) — added targeted tests for each, coverage passed at 90.02%.
- `trips-active-entry-panel.test.tsx` and `trips-desktop-layout.test.tsx` broke because they transitively import `now-card.tsx` → `use-route-for-event.ts` → the new server action → `next-auth`/`db`, which isn't mockable in these test files' existing setup — fixed by mocking `./use-route-for-event` locally in both.
- Full `npm run test:e2e` crashed twice (webServer startup) with a Windows-specific Turbopack native panic (`0xc0000142`, DLL init failed spawning a CSS-compile process) — reproduced identically on a clean retry with no scenarios ever starting, confirming it wasn't caused by this story's code. Deferred to the user to investigate the Windows/Turbopack environment; a follow-up run reported all E2E scenarios passing (`test-results/.last-run.json`: `{"status":"passed","failedTests":[]}`).

### Completion Notes List

- Implemented `RouteResult` discriminated union, `getRouteDistanceTime()` in `route.ts` (24h `route_cache` read + upsert, Mapbox Directions call, 3s timeout, profile mapping), `DistanceTimePill` presentational component, `useRouteForEvent` hook (60s refresh, visibility-pause/resume, single `getCurrentPosition()` per tick), and the `route-actions.ts` server action gating the Directions call behind `requireUser()` + `assertTripAccess(..., "viewer")`.
- Restructured `NowCardEventRow`'s non-linked branch: removed the hardcoded `"· — · — km"` placeholder, wrapped the existing `Link` and the new `DistanceTimePill` as genuine DOM siblings inside a parent `<div>` (pill only renders when the event has both `locationLat` and `locationLng`), and moved the click-stopPropagation from the `Link` to the wrapper so both the link and the pill are shielded from the card's outer navigate-on-click handler.
- `DistanceTimePill`'s ready-state text uses `${durationMinutes} min ${transitMode}` (e.g. "12 min walk"), matching the literal wording used repeatedly in `EXPERIENCE.md`'s Flow 1 rather than the alternate distance-based example in the story's own Dev Notes — the UX spec was treated as authoritative since it's the referenced design source and its wording is the one used at every mention. `NowCardEventRow` resolves the mode via `trip.transitMode ?? TransitMode.Drive`, mirroring the existing `createTrip` fallback pattern from Story 1.2.
- `useRouteForEvent`'s signature adds a required `transitMode: TransitMode` parameter beyond the story's literal `(event, tripId)` shape in Subtask 5.1 — necessary since the server action requires a transit mode and per-hop `resolveEffectiveMode` override was explicitly parked (UX `EXPERIENCE.md`: "Per-Hop Override... post-MVP"), so the trip's configured mode is used as-is with no threshold-based per-hop resolution in this story.
- Subtask 4.6 (removing the `mini-map-rail.tsx` dead-code reference) was intentionally left undone: the story's own "Files NOT to touch" section explicitly scopes that removal to Epic 4, contradicting the subtask text. Flagging here rather than silently resolving the conflict either way.
- Subtask 6.3 (E2E scenario for Now Card distance/time display) was deferred per its own "may be deferred if E2E mocking is complex" allowance — geolocation mocking in Playwright would need new fixture support; coverage was instead provided via the `use-route-for-event`, `distance-time-pill`, and `now-card` unit/component test suites (26 new tests across those three files plus `route.ts`/`route-actions.ts`).
- All 5 `packt-build-validator` checks pass: lint, TypeScript, coverage (2907/2907 tests, branches 90.02%), production build, and full E2E (confirmed via `test-results/.last-run.json` after the user resolved an unrelated Windows Turbopack dev-server crash).

### File List

- `src/data/types.ts` (modified — added `RouteResult`)
- `src/data/types.test.ts` (modified — added `RouteResult` shape tests)
- `src/lib/route.ts` (modified — added `getRouteDistanceTime()`)
- `src/lib/route.test.ts` (modified — added `getRouteDistanceTime()` tests)
- `src/components/packt/distance-time-pill.tsx` (created)
- `src/components/packt/distance-time-pill.test.tsx` (created)
- `src/components/packt/use-route-for-event.ts` (created)
- `src/components/packt/use-route-for-event.test.ts` (created)
- `src/app/(app)/trips/[tripId]/route-actions.ts` (created)
- `src/app/(app)/trips/[tripId]/route-actions.test.ts` (created)
- `src/components/packt/now-card.tsx` (modified — restructured Next Event row, wired `useRouteForEvent`)
- `src/components/packt/now-card.test.tsx` (modified — mocked `use-route-for-event`, added pill/navigation tests)
- `src/components/packt/trips-active-entry-panel.test.tsx` (modified — mocked `use-route-for-event` to fix transitive import failure)
- `src/components/packt/trips-desktop-layout.test.tsx` (modified — mocked `use-route-for-event` to fix transitive import failure)
- `tests/e2e/feature-map.mjs` (modified — registered `distance-time-pill.tsx` and `use-route-for-event.ts` under `linked-events`)

## Change Log

- 2026-07-13/14: Implemented Story 2.1 end-to-end (RouteResult type, route cache + Directions API call, DistanceTimePill component, useRouteForEvent hook, route-actions server action, Next Event row restructure, feature-map registration). Fixed a set-state-in-effect lint violation, a TS narrowing error, and a global branch-coverage regression surfaced by `packt-build-validator`. Story moved to review after all 5 validator checks passed.
