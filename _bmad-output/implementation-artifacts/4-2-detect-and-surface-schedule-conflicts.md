---
baseline_commit: b4d793ba5a16c482b15126e0554056c912407acc
---

# Story 4.2: Detect and surface Schedule Conflicts

Status: done

## Story

As a traveler planning a tightly-timed day,
I want to be warned when travel time between stops doesn't fit my schedule,
so that I can catch unrealistic plans before I'm on the ground.

## Acceptance Criteria

1. **Given** two adjacent timed Located Items on the same day
   **When** `travel_time + 10 minutes > scheduled_gap`
   **Then** Packt flags a Schedule Conflict

2. **Given** a flagged conflict
   **When** the Itinerary Day View renders
   **Then** a day-level badge shows the conflict count (icon + word, never color alone), and is never shown at zero conflicts

3. **Given** a flagged conflict
   **When** the affected `PlaceRow` renders
   **Then** a row-level triangle-alert control appears after the Time chip as a second segment in its ButtonGroup; it is keyboard-focusable, exposes the accessible name "Schedule conflict", and shows an explanatory warning toast when activated

4. **Given** a Freeform Item (no Coordinates) adjacent to a Located Item
   **When** conflicts are evaluated
   **Then** it never triggers or displays a route-based conflict

5. **And** when an in-page edit (time, order, or transit-mode change) changes conflict status, the badge/icon appearance or disappearance is announced via `aria-live="polite"`; passive distance/time ticking elsewhere is never wrapped in a live region

## Tasks / Subtasks

- [x] Task 1: Add `ScheduleConflict` type and detection utility (AC: 1, 4)
  - [x] Subtask 1.1: Add `ScheduleConflict` interface to `src/data/types.ts`: `{ eventIndex: number; previousEventId: string; currentEventId: string; travelTimeSeconds: number; scheduledGapSeconds: number }`
  - [x] Subtask 1.2: Add `getDayScheduleConflicts(events: TripEvent[], tripId: string, tripTransitMode: TransitMode, walkThresholdMeters?: number | null): Promise<ScheduleConflict[]>` to `src/lib/route.ts` — iterates adjacent timed Located Items (those with both `startAt`/`endAt` set), fetches per-hop travel time via `getRouteDistanceTime`, computes `scheduledGap = (currentEvent.startAt - previousEvent.endAt)` in seconds, flags conflict when `travelTimeSeconds + 600 > scheduledGapSeconds`
  - [x] Subtask 1.3: Filter out Freeform Items (no `locationLat`/`locationLng`) from conflict evaluation — they never trigger a conflict (AC: 4). When a Freeform Item sits between two Located Items, skip it and evaluate travel time between the two Located Items that bound it, using their positions
  - [x] Subtask 1.4: Handle missing `startAt`/`endAt` — events without both times are excluded from conflict evaluation entirely
  - [x] Subtask 1.5: Handle route failures gracefully — when `getRouteDistanceTime` returns `"unavailable"` for a hop, that hop produces no conflict (unknown travel time cannot trigger a flag); the function still evaluates all other adjacent pairs
  - [x] Subtask 1.6: Add unit tests in `src/lib/route.test.ts` for `getDayScheduleConflicts` — cover: no events, 1 event, 2 adjacent timed Located Items with conflict, 2 adjacent timed Located Items without conflict, Freeform Item between Located Items (no conflict triggered), missing route data (no conflict), mixed available/unavailable hops, the 10-minute buffer boundary (travel_time + 600 == scheduled_gap → no conflict; travel_time + 601 == scheduled_gap → conflict)

- [x] Task 2: Add day-level Schedule Conflict badge to `DayCardBody` (AC: 2, 5)
  - [x] Subtask 2.1: Add `ScheduleConflict[]` state to `DayCardBody` (similar to `routeSummaryState` pattern) — extracted into `useScheduleConflicts` hook
  - [x] Subtask 2.2: Call `getDayScheduleConflicts` in a `useEffect` after route summary resolves, or independently when `locatedEvents.length >= 2 && tripId && tripTransitMode` are available — reuse the same early-return guard pattern as the route summary effect
  - [x] Subtask 2.3: Compute `conflictingEventIds: Set<string>` from the conflicts array (union of all `currentEventId` values) — this set is passed to `DayCardDnd` to flag individual rows
  - [x] Subtask 2.4: Render a day-level badge when `conflicts.length > 0`: a `<span>` with `warning-soft` background, `warning-ink` text, `rounded-full` styling, containing a `TriangleAlert` icon (aria-hidden, strokeWidth 1.5) + count text (e.g. "1 tight connection" or "2 tight connections"). Place it between the `DayRouteStrip` and `DayCardDnd`, inside an `aria-live="polite"` wrapper so badge appearance/disappearance is announced on in-page edits (AC: 5) — extracted into `ScheduleConflictBadge` component
  - [x] Subtask 2.5: Never render the badge when `conflicts.length === 0` — silence is the neutral signal
  - [x] Subtask 2.6: Match the `StatusBadge` visual pattern from `status-badge.tsx`: `px-2 py-0.5 rounded-full` with `var(--warning-soft)` bg and `var(--warning-ink)` fg, font-size `calc(12px * var(--font-scale))`, weight 600
  - [x] Subtask 2.7: Add unit tests in `day-card-body.test.tsx` — conflict badge renders when conflicts exist, badge hidden when zero conflicts, `aria-live="polite"` wrapper present on badge

- [x] Task 3: Thread conflict data through `DayCardDnd` to `PlaceRow` (AC: 3)
  - [x] Subtask 3.1: Add `conflictingEventIds?: Set<string>` prop to `DayCardDndProps` in `day-card-dnd.tsx`
  - [x] Subtask 3.2: Pass `hasScheduleConflict={conflictingEventIds?.has(entry.item.data.id) ?? false}` to each `PlaceRow` / `SortablePlaceRow` in the render loop (both the non-sortable linked-event path and the sortable path — but only for non-draft entries)
  - [x] Subtask 3.3: Do NOT pass conflict flag to draft PlaceRows or DragOverlay PlaceRows (drafts have no schedule, drag overlay is visual only)

- [x] Task 4: Add row-level triangle-alert icon to `PlaceRow` (AC: 3)
  - [x] Subtask 4.1: Add `hasScheduleConflict?: boolean` prop to `PlaceRowProps` in `place-row.tsx`
  - [x] Subtask 4.2: Pass `hasScheduleConflict` to `PlaceRowActionBar` as a new prop
  - [x] Subtask 4.3: In `PlaceRowActionBar`, render the triangle-alert control after the Time chip when `hasScheduleConflict` is true — `TriangleAlert` from lucide, `size={IconSize.actionChip}` (12px), `strokeWidth={1.5}`, within a second ButtonGroup segment labelled "Schedule conflict" that shows an explanatory warning toast when activated
  - [x] Subtask 4.4: The control renders inline within the action bar ButtonGroup immediately after the Time button, before any gap to the Location chip
  - [x] Subtask 4.5: Add unit tests in `place-row-action-bar.test.tsx` — conflict control renders when `hasScheduleConflict` is true, is absent when false, and exposes its accessible name
  - [x] Subtask 4.6: Add unit tests in `place-row.test.tsx` — `hasScheduleConflict` prop passes through to action bar

- [x] Task 5: Wire conflict data from `TripItineraryView` to `DayCardBody` (AC: 1, 2, 3)
  - [x] Subtask 5.1: Conflict detection is self-contained within `DayCardBody` — no additional prop threading from `TripItineraryView` or `TripDetailTabBody` is needed. `DayCardBody` already has `day.events`, `tripId`, `tripTransitMode`, and `walkThresholdMeters` — everything required for conflict detection
  - [x] Subtask 5.2: Verify `walkThresholdMeters` is available in the prop chain (currently not passed from `TripDetailTabBody` — see 4.1 review defer item). If unavailable, conflict detection uses raw `tripTransitMode` without the walk override. This is a pre-existing gap, not a regression from this story — confirmed: `trip-detail-tab-body.tsx` passes `tripId`/`tripTransitMode` to `TripItineraryView` but not `walkThresholdMeters`; gap unchanged by this story

- [x] Task 6: Add E2E coverage for schedule conflicts (AC: 1, 2, 3)
  - [x] Subtask 6.1: Add `schedule-conflict` entry to `FEATURE_MAP` in `tests/e2e/feature-map.mjs` with glob `src/components/packt/day-card-body.tsx` (conflict detection/computation lives here) — also covers `use-schedule-conflicts.ts` and `schedule-conflict-badge.tsx`, extracted during implementation (see Dev Agent Record)
  - [x] Subtask 6.2: Create `tests/e2e/features/schedule-conflict.feature` with `@feat:schedule-conflict` tag — scenarios:
    - Day with 2 timed Located Items where travel time exceeds gap → conflict badge visible + row icon visible
    - Day with 2 timed Located Items where travel time fits gap → no conflict badge, no row icon
    - Day with a Freeform Item between Located Items → Freeform row has no conflict icon
  - [x] Subtask 6.3: Create `tests/e2e/steps/schedule-conflict.steps.ts` with step definitions using the existing Object Mother pattern — create trips with timed located events and tight schedules; seeds deterministic `route_cache` rows via `withE2EDb` so conflict outcomes never depend on a live Mapbox lookup

- [x] Task 7: Run targeted tests (AC: 1-5)
  - [x] Subtask 7.1: `npx vitest run src/lib/route.test.ts` — schedule conflict detection tests pass
  - [x] Subtask 7.2: `npx vitest run src/components/packt/day-card-body.test.tsx` — badge integration tests pass, no regressions
  - [x] Subtask 7.3: `npx vitest run src/components/packt/place-row-action-bar.test.tsx` — conflict icon tests pass
  - [x] Subtask 7.4: `npx vitest run src/components/packt/place-row.test.tsx` — prop passthrough tests pass, no regressions
  - [x] Subtask 7.5: `npx vitest run src/components/packt/day-card-dnd.test.tsx` — no regressions; also ran full Vitest suite (3059 tests, 204 files, all pass) and the affected Playwright E2E suite (all 3 new schedule-conflict scenarios pass; one pre-existing unrelated packing-tab flake confirmed by isolated re-run)

- [x] Task 8: Run `packt-build-validator` (AC: 1-5)
  - [x] Subtask 8.1: lint, TypeScript, coverage, build, affected E2E
  - [x] Subtask 8.2: Fix any issues flagged — none needed, all five checks passed on first run
  - [x] Subtask 8.3: Re-run until PASS — LINT PASS, TSC PASS, COVERAGE PASS (3059 tests; lines 96.29%, functions 96.45%, branches 90.32%), E2E PASS (175 scenarios — full suite ran because `src/data/types.ts` is a SHARED_GLOB), BUILD PASS

## Dev Notes

### Previous Story Intelligence

**Story 4.1 (done):** Added `DayRouteStrip` component, `getDayRouteSummary` function, `route_cache` multi-hop aggregation, and server action `getDayRouteSummary`. Key files created/modified: `day-route-strip.tsx`, `day-card-body.tsx`, `route.ts`, `route-actions.ts`, `types.ts` (`DayRouteSummary` type added).

**Key learnings from Story 4.1:**
- `DayRouteStrip` sits between the day header and `DayCardDnd` in `DayCardBody` — the schedule conflict badge should sit in the same region
- `DayCardBody` is the correct compute location for derived day-level state (route summaries, and now schedule conflicts)
- `walkThresholdMeters` is threaded through component layers but not supplied from `TripDetailTabBody` — a pre-existing gap, not a regression
- `getDayRouteSummary` iterates adjacent located events in position order — the schedule conflict detection follows a similar iteration pattern but with different comparison logic
- `DayCardDnd` does not receive `tripId`/`tripTransitMode`/`walkThresholdMeters` — conflict data must be pre-computed in `DayCardBody` and passed as a simple `Set<string>`
- `formatDistance` was extracted to `src/lib/utils.ts` during 4.1 review — reuse it if needed
- Unhandled promise rejection pattern: always add `.catch()` falling back to a safe default on async fetches in `useEffect`

**Review findings from 4.1 that affect this story:**
- `getDayRouteSummary` server action accepts client-supplied events without validating against the trip's stored events — this story's `getDayScheduleConflicts` follows the same pre-existing pattern (deferred)
- Sequential hop fetching in `getDayRouteSummary` with no cap — `getDayScheduleConflicts` will have the same characteristic for the same reason (low real-world impact given typical day sizes)

### Architecture Constraints

- **Shared route module:** `src/lib/route.ts` owns ALL route calculations. The schedule conflict detection function belongs here too since it depends on per-hop route data (`getRouteDistanceTime`). No component queries `route_cache` or calls the Directions API directly.
- **Per-hop resolution:** Each hop resolves transit mode via `resolveEffectiveMode(hopDistanceMeters, tripTransitMode, walkThresholdMeters)` from Epic 1 — never read `tripTransitMode` directly in UI.
- **Conflict detection formula:** `travel_time + 10 minutes (600 seconds) > scheduled_gap`. Fixed 10-minute buffer, uniform across transit modes. Per the architecture doc's Schedule Conflict Threshold Model — strict mode was rejected as too noisy.
- **`RouteResult` discriminated union:** Per-hop route lookups return `{status:"loading"} | {status:"ready", distanceMeters, durationSeconds} | {status:"unavailable"}`. When `"unavailable"`, that hop produces no conflict (unknown travel time cannot trigger a flag).
- **Accessibility pattern for row icon:** Mirrors `TabStatusIcon` from `tab-status-icon.tsx` — icon is `aria-hidden`, visually-hidden `<span className="sr-only">` carries the text. Icon after the Time chip in the action bar.
- **Accessibility pattern for day badge:** Same `warning-soft`/`warning-ink` pairing as `StatusBadge` from `status-badge.tsx`. Icon is `aria-hidden`; the count text itself is the visible and accessible name (no extra sr-only span needed). Badge wrapped in `aria-live="polite"` for in-page edit announcements.
- **Color tokens:** `var(--warning)` for the row icon color, `var(--warning-soft)` for badge background, `var(--warning-ink)` for badge text. These already exist in `globals.css` (added during budget feature). Do NOT invent new semantic colors.
- **Microcopy voice:** Plain, factual register. "1 tight connection today" not "Uh oh, your schedule looks tight!". Silence is the correct treatment when zero conflicts exist.

### Files to CREATE

| File | Purpose |
|------|---------|
| `tests/e2e/features/schedule-conflict.feature` | E2E scenarios for schedule conflict visibility |
| `tests/e2e/steps/schedule-conflict.steps.ts` | E2E step definitions |

### Files to MODIFY

| File | Changes |
|------|---------|
| `src/data/types.ts` | Add `ScheduleConflict` interface |
| `src/lib/route.ts` | Add `getDayScheduleConflicts()` function — per-hop travel time fetch + 10-minute buffer comparison |
| `src/lib/route.test.ts` | Add tests for `getDayScheduleConflicts` |
| `src/components/packt/day-card-body.tsx` | Compute `ScheduleConflict[]` from events + route data, render day-level badge with `aria-live="polite"`, pass `conflictingEventIds` to `DayCardDnd`. **Size note:** already 265 lines (over 250 limit); if additions push past ~295, extract badge into a sibling component or hook |
| `src/components/packt/day-card-body.test.tsx` | Add tests for conflict badge rendering and conflict data computation |
| `src/components/packt/day-card-dnd.tsx` | Accept `conflictingEventIds` prop, pass `hasScheduleConflict` to each PlaceRow |
| `src/components/packt/day-card-dnd.test.tsx` | Add tests for conflict flag passthrough |
| `src/components/packt/place-row.tsx` | Accept `hasScheduleConflict` prop, pass to `PlaceRowActionBar` |
| `src/components/packt/place-row.test.tsx` | Add test for conflict prop passthrough |
| `src/components/packt/place-row-action-bar.tsx` | Accept `hasScheduleConflict` prop, render `TriangleAlert` icon + sr-only span after Time chip |
| `src/components/packt/place-row-action-bar.test.tsx` | Add tests for conflict icon rendering |
| `tests/e2e/feature-map.mjs` | Add `schedule-conflict` entry to `FEATURE_MAP` |

### Files NOT to touch

- `src/components/packt/day-route-strip.tsx` — unchanged, sibling component
- `src/components/packt/now-card.tsx` — Now Card scope, unaffected
- `src/components/packt/distance-time-pill.tsx` — Epic 2 scope, unaffected
- `src/components/packt/getting-around-section.tsx` — Epic 1 scope, unaffected
- `src/components/packt/map-tab.tsx` — Epic 5 scope, not yet built
- `src/components/packt/status-badge.tsx` — budget feature component, reuse its pattern but do not modify
- `src/components/packt/tab-status-icon.tsx` — budget feature component, reuse its pattern but do not modify
- `src/app/(app)/trips/[tripId]/route-actions.ts` — no new server actions needed for this story
- `src/db/schema.ts` — no schema changes
- `src/components/ui/**` — no new UI primitives needed

### Existing Patterns to Follow

**Schedule conflict detection algorithm:**
```ts
// Pseudocode for getDayScheduleConflicts
async function getDayScheduleConflicts(
  events: TripEvent[],
  tripId: string,
  tripTransitMode: TransitMode,
  walkThresholdMeters?: number | null
): Promise<ScheduleConflict[]> {
  // 1. Filter to Located Items with both startAt and endAt set
  const timedLocatedEvents = events
    .filter(e => e.locationLat != null && e.locationLng != null && e.startAt && e.endAt)
    .sort((a, b) => a.position - b.position);

  // 2. For each adjacent pair, compute travel time and scheduled gap
  const conflicts: ScheduleConflict[] = [];
  for (let index = 1; index < timedLocatedEvents.length; index++) {
    const previousEvent = timedLocatedEvents[index - 1];
    const currentEvent = timedLocatedEvents[index];
    const routeResult = await getRouteDistanceTime(
      { lat: previousEvent.locationLat!, lng: previousEvent.locationLng! },
      { lat: currentEvent.locationLat!, lng: currentEvent.locationLng! },
      resolveEffectiveMode(/* hop distance */, tripTransitMode, walkThresholdMeters)
    );
    if (routeResult.status !== "ready") continue; // unknown travel time → no conflict

    const scheduledGapSeconds = (new Date(currentEvent.startAt!).getTime() - new Date(previousEvent.endAt!).getTime()) / 1000;
    const BUFFER_SECONDS = 600; // 10 minutes
    if (routeResult.durationSeconds + BUFFER_SECONDS > scheduledGapSeconds) {
      conflicts.push({
        eventIndex: index,
        previousEventId: previousEvent.id,
        currentEventId: currentEvent.id,
        travelTimeSeconds: routeResult.durationSeconds,
        scheduledGapSeconds,
      });
    }
  }
  return conflicts;
}
```

**Row icon pattern (after Time chip in action bar):**
```tsx
{hasScheduleConflict && (
  <>
    <TriangleAlert
      size={IconSize.actionChip}
      strokeWidth={1.5}
      aria-hidden="true"
      style={{ color: "var(--warning)", flexShrink: 0 }}
    />
    <span className="sr-only">Schedule conflict</span>
  </>
)}
```

**Day badge pattern (in DayCardBody, between DayRouteStrip and DayCardDnd):**
```tsx
{conflicts.length > 0 && (
  <div aria-live="polite">
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
      style={{
        background: "var(--warning-soft)",
        color: "var(--warning-ink)",
        fontSize: "calc(12px * var(--font-scale))",
        fontWeight: 600,
      }}
    >
      <TriangleAlert size={12} strokeWidth={1.5} aria-hidden="true" />
      {conflicts.length === 1 ? "1 tight connection today" : `${conflicts.length} tight connections today`}
    </span>
  </div>
)}
```

### Key Gotchas

1. **Conflict detection depends on per-hop route data, not the DayRouteSummary aggregate.** The aggregate sums all hops; conflicts need individual hop durations. `getDayScheduleConflicts` calls `getRouteDistanceTime` per adjacent pair directly (through the cache), not through `getDayRouteSummary`.

2. **Scheduled gap is `currentEvent.startAt - previousEvent.endAt`, not `currentEvent.startAt - previousEvent.startAt`.** The gap is the time between when you finish one event and when the next one starts. If the previous event has no `endAt`, skip the pair.

3. **Freeform Items sit between Located Items silently.** If the ordered events are: Located A, Freeform B, Located C — the conflict check should compare A→C travel time against A.endAt to C.startAt gap. The Freeform Item is excluded from conflict evaluation but does NOT block the comparison between the Located Items that bound it. To implement this: filter to timed Located Items only, then iterate consecutive pairs from that filtered list.

4. **The 10-minute buffer is in seconds: 600.** The formula is `travelTimeSeconds + 600 > scheduledGapSeconds`. At the boundary: travel=300s, gap=900s → 300+600=900, not >900, no conflict. travel=301s, gap=900s → 301+600=901, >900, conflict.

5. **`aria-live="polite"` wraps the badge container, not the individual icon/text.** The wrapper div should always be in the DOM (empty when zero conflicts), so screen readers detect the change. Alternatively, the badge itself can be conditionally rendered inside a persistent `aria-live="polite"` container — either approach works as long as the live region exists when the badge appears/disappears.

6. **Conflict detection is async (calls `getRouteDistanceTime` per hop).** Follow the same `useEffect` + state pattern as the route summary in `DayCardBody`. Add `.catch()` to avoid unhandled rejections (lesson from 4.1 review).

7. **The conflict icon goes AFTER the Time chip, BEFORE the Location chip.** It is a visual indicator, not a separate interactive chip. Do not wrap it in a button.

8. **"Schedule conflict" text is sr-only, not visible.** The icon alone is the visible indicator on the row. The day badge shows visible count text + icon. These are different accessibility treatments per DESIGN.md.

9. **Do not wrap passive distance/time ticking in `aria-live`.** Only the conflict badge appearance/disappearance gets `aria-live="polite"`. The `DayRouteStrip` distance/time updates and `DistanceTimePill` ticking must NOT be wrapped in any live region (per Accessibility Floor).

10. **Reuse `getRouteDistanceTime` — it already handles cache + fallback.** Do not call the Mapbox Directions API directly. The route module handles caching, timeouts, and `RouteResult` resolution.

11. **`DayCardBody` is already 265 lines — above the 250-line JSX limit.** The conflict badge + detection logic adds ~30 lines. If the total pushes past ~295 lines, extract the conflict badge into a small `ScheduleConflictBadge` component in the same file (or a sibling), or lift the conflict computation + badge render into a dedicated hook. The dev should make this call at implementation time — the badge itself is small (5 lines JSX), but the state/effects add bulk.

### Testing Requirements

- **Unit tests** (Vitest): colocated `*.test.ts(x)` next to source
  - `src/lib/route.test.ts` — add tests for `getDayScheduleConflicts` (algorithm correctness)
  - `src/components/packt/day-card-body.test.tsx` — conflict badge rendering, `aria-live` presence, conflict data computation
  - `src/components/packt/place-row-action-bar.test.tsx` — conflict icon rendering, `aria-hidden`, sr-only text
  - `src/components/packt/place-row.test.tsx` — `hasScheduleConflict` prop passthrough
  - `src/components/packt/day-card-dnd.test.tsx` — `conflictingEventIds` prop handling
- **E2E tests** (playwright-bdd): `schedule-conflict.feature` for basic visibility scenarios
- Coverage threshold: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- Run targeted tests first, then `packt-build-validator` for full validation

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Epic 4, Story 4.2 (lines 415-439)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — Schedule Conflict Threshold Model (line 128-133), `route.ts` ownership split (line 207-209), New & Modified Files (line 219-224)
- UX Design: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/DESIGN.md` — `schedule-conflict-row-icon` (lines 45-50), `schedule-conflict-day-badge` (lines 51-57), Colors (lines 113-118), Components (lines 129-130), Do's/Don'ts (lines 138-150)
- UX Experience: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md` — Component Patterns (lines 58-59), State Patterns (lines 78-79), Accessibility Floor (lines 104-118), Key Flow 3 (lines 156-163)
- Previous story: `_bmad-output/implementation-artifacts/4-1-show-day-route-strip-for-days-with-2-plus-located-items.md`
- Route module: `src/lib/route.ts` — existing `getRouteDistanceTime`, `resolveEffectiveMode`, `getDayRouteSummary`
- TabStatusIcon pattern: `src/components/packt/tab-status-icon.tsx` — aria-hidden + sr-only pattern
- StatusBadge pattern: `src/components/packt/status-badge.tsx` — warning-soft/warning-ink visual pattern
- Project context: `_bmad-output/project-context.md` — styling conventions, testing standards, 44×44px rule, warning color tokens

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `npx vitest run src/lib/route.test.ts src/components/packt/day-card-body.test.tsx src/components/packt/place-row-action-bar.test.tsx src/components/packt/place-row.test.tsx src/components/packt/day-card-dnd.test.tsx`
- `npx vitest run src/components/packt/use-schedule-conflicts.test.ts src/components/packt/schedule-conflict-badge.test.tsx`
- `npx vitest run "src/app/(app)/trips/[tripId]/route-actions.test.ts"`
- `npx vitest run scripts/feature-map.test.mjs`
- `npm run test:e2e:affected` (full suite ran — `src/data/types.ts` is a SHARED_GLOB)
- `npm run lint`; `npx tsc --noEmit`; `npm run test:coverage`; `npm run test:e2e:affected`; `NEXT_DISTDIR=.next-validate npm run build`

### Completion Notes List

- Added `ScheduleConflict` type and `getDayScheduleConflicts()` detection utility in `route.ts` (10-minute buffer, Freeform Items excluded but not blocking their bounding hop, unavailable hops skipped, buffer-boundary tested).
- Architecture gap found during implementation: the story's "Files NOT to touch" list excluded `route-actions.ts`, but `getDayScheduleConflicts` needs DB access and `DayCardBody` (a client component) can't call it directly — the same reason `getDayRouteSummary` already has a server-action wrapper there. Confirmed with the user before proceeding; added a matching `getDayScheduleConflicts` wrapper to `route-actions.ts`.
- `DayCardBody` was already at the story's stated 265-line size limit, so the conflict state/effect and badge JSX were extracted into a new `useScheduleConflicts` hook and `ScheduleConflictBadge` component (sibling files) rather than inlined, keeping `day-card-body.tsx` at 278 lines. Both new files ship with their own colocated tests.
- Threaded `conflictingEventIds` through `DayCardDnd` to `PlaceRow`/`SortablePlaceRow` (non-draft, non-drag-overlay entries only) and added the row-level conflict indicator in `PlaceRowActionBar` after the Time chip.
- Row-level indicator design was revised live with the user after initial implementation, deviating from the story's original aria-hidden-icon-plus-sr-only-span spec (AC3): the Time chip and conflict indicator now render as a single two-segment `ButtonGroup` (matching the existing Address/Edit split-button pattern), both warning-colored — segment 1 is the existing Time button (opens the Time dialog), segment 2 is an icon-only, `aria-label`'d "Schedule conflict" button that shows a `toast.warning()` explaining the conflict instead of opening a dialog. This is now a real interactive/focusable control rather than a decorative aria-hidden icon.
- Verified the pre-existing `walkThresholdMeters` prop-chain gap (not passed from `TripDetailTabBody`) is unchanged by this story, per the story's own note.
- Added `schedule-conflict` E2E feature with 3 scenarios; seeded deterministic `route_cache` rows directly via `withE2EDb` in `Before` hooks so conflict outcomes never depend on a live Mapbox API call.
- Full validation passed: lint, TypeScript, coverage (3059 tests; lines 96.29%, functions 96.45%, branches 90.32%), full E2E (175 scenarios), and production build.

### File List

- _bmad-output/implementation-artifacts/4-2-detect-and-surface-schedule-conflicts.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/data/types.ts
- src/lib/route.ts
- src/lib/route.test.ts
- src/app/(app)/trips/[tripId]/route-actions.ts
- src/app/(app)/trips/[tripId]/route-actions.test.ts
- src/components/packt/day-card-body.tsx
- src/components/packt/day-card-body.test.tsx
- src/components/packt/use-schedule-conflicts.ts
- src/components/packt/use-schedule-conflicts.test.ts
- src/components/packt/schedule-conflict-badge.tsx
- src/components/packt/schedule-conflict-badge.test.tsx
- src/components/packt/day-card-dnd.tsx
- src/components/packt/day-card-dnd.test.tsx
- src/components/packt/place-row.tsx
- src/components/packt/place-row.test.tsx
- src/components/packt/place-row-action-bar.tsx
- src/components/packt/place-row-action-bar.test.tsx
- tests/e2e/feature-map.mjs
- tests/e2e/features/schedule-conflict.feature
- tests/e2e/steps/schedule-conflict.steps.ts

### Change Log

- 2026-07-15: Implemented schedule conflict detection with per-hop route lookups, day-level badge, row-level icon, and full test coverage (unit + E2E).
- 2026-07-15: Revised the row-level conflict indicator to a two-segment Time/Schedule-conflict `ButtonGroup` (matching the Address/Edit split-button pattern) per live user design feedback, with the conflict segment showing an explanatory `toast.warning()` on click.

### Review Findings

- [x] [Review][Decision] Amend AC 3 for the interactive conflict control — resolved: AC 3 and its implementation tasks now specify the ButtonGroup warning control. [src/components/packt/place-row-action-bar.tsx:60]
- [x] [Review][Patch] Keep conflict calculations aligned with optimistic drag order [src/components/packt/day-card-body.tsx:110]
- [x] [Review][Patch] Announce row-conflict changes when total count is unchanged [src/components/packt/schedule-conflict-badge.tsx:12]
- [x] [Review][Patch] Deduplicate concurrent per-hop route lookups on a cold cache [src/components/packt/day-card-body.tsx:139]
- [x] [Review][Defer] Validate server-action events against the stored trip [src/app/(app)/trips/[tripId]/route-actions.ts:40] — deferred, pre-existing
