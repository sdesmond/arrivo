---
baseline_commit: b7f197e1025908bebedfafec2a26fd20f78c1266
---

# Story 5.3: Deep-link from Day Route Strip to Map Tab

Status: done

## Story

As a traveler viewing a Day Route Strip,
I want tapping its thumbnail to open the Map Tab scoped to that day,
so that I can go straight from a day's plan to seeing it geographically.

## Acceptance Criteria

1. **Given** a Day Route Strip thumbnail
   **When** I tap it
   **Then** the Map Tab opens pre-scoped to that day (day selector reflects the matching day)

2. **Given** I'm viewing a day-scoped Map Tab reached this way
   **When** I want to see everything
   **Then** the day selector still allows returning to whole-trip scope

3. **And** the Day Route Strip thumbnail (non-clickable/hidden as of Epic 4 Story 4.1) becomes a live tap target now that Map Tab exists

## Tasks / Subtasks

- [x] Task 1: Extract `useDayDraft` hook from `DayCardBody` (refactor — no behavior change)
  - [x] Subtask 1.1: Create `src/components/packt/use-day-draft.ts` with the `useDayDraft` hook
  - [x] Subtask 1.2: Move the following from `day-card-body.tsx` into the hook:
    - `draft` and `openGapKey` state
    - `pendingCommitBaselineRef` ref
    - `openGap`, `activateDraft`, `commitDraft` functions
    - `makeGapProps` function
    - The `pendingCommitBaselineRef` effect (lines 153–162) that clears draft when props catch up
  - [x] Subtask 1.3: Hook signature: `useDayDraft({ dayNumber, timelineItems, propTimelineItemCount, onAddEvent, onAddNote, onAddChecklist, onOpenPackingListPicker })` returning `{ draft, openGapKey, openGap, activateDraft, commitDraft, cancelDraft, makeGapProps }`
  - [x] Subtask 1.4: Update `day-card-body.tsx` to import and call `useDayDraft`, removing the extracted logic
  - [x] Subtask 1.5: Create `src/components/packt/use-day-draft.test.ts` — test hook: open gap, activate draft, commit draft (note/checklist/event paths), cancel draft, makeGapProps returns correct props

- [x] Task 2: Wire `onThumbnailClick` callback from `DayRouteStrip` to `DayCardBody` (AC: 1)
  - [x] Subtask 2.1: Add an optional `onThumbnailClick?: () => void` prop to `DayRouteStripProps` in `src/components/packt/day-route-strip.tsx`
  - [x] Subtask 2.2: When `onThumbnailClick` is provided, make the thumbnail a `<button>` element (with `aria-label` and the existing 44×44px sizing) instead of a `<div role="img">`
  - [x] Subtask 2.3: When `onThumbnailClick` is provided but data is still loading, keep the thumbnail as a non-interactive skeleton (no click handler while loading)
  - [x] Subtask 2.4: In `src/components/packt/day-card-body.tsx`, pass `onThumbnailClick` to `DayRouteStrip` — the handler calls a new `onOpenMapTab?: (dayNumber: number) => void` prop on `DayCardBody`

- [x] Task 3: Thread `onOpenMapTab` from `TripItineraryView` to `DayCardBody` (AC: 1)
  - [x] Subtask 3.1: Add `onOpenMapTab?: (dayNumber: number) => void` to `DayCardBodyProps` in `src/components/packt/day-card-body.tsx` (accept it from parent)
  - [x] Subtask 3.2: Add `onOpenMapTab?: (dayNumber: number) => void` to `TripItineraryViewProps` in `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`
  - [x] Subtask 3.3: Thread `onOpenMapTab` from `TripItineraryView` down to each `DayCardBody` invocation

- [x] Task 4: Thread `onOpenMapTab` from `TripDetailTabBody` to `TripItineraryView` (AC: 1)
  - [x] Subtask 4.1: In `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`, add `onOpenMapTab` to `TripDetailTabBodyProps`
  - [x] Subtask 4.2: When `onOpenMapTab` is called with a `dayNumber`, switch `activeTab` to `"map"` and set `dayFilter` on `MapTab` to the received day number — this requires lifting the active tab state or using the existing tab-switch mechanism (`window.history` + `?tab=map&day=N`)
  - [x] Subtask 4.3: Pass `onOpenMapTab` to `TripItineraryView`

- [x] Task 5: Switch to map tab with day deep-link (AC: 1, 2)
  - [x] Subtask 5.1: The `onOpenMapTab` handler in `TripDetailTabBody` should update the URL to `?tab=map&day=N` (where N = day number) using the existing `window.history.pushState` pattern from `page-client.tsx` — this triggers the tab switch via the URL param convention already in place
  - [x] Subtask 5.2: Ensure `MapTab` picks up the `dayFilter` prop (already wired via the existing `dayFilter` prop interface, validated by Story 5.2's test coverage)

- [x] Task 6: Make Day Route Strip thumbnail interactive and accessible (AC: 3)
  - [x] Subtask 6.1: In `day-route-strip.tsx`, when `onThumbnailClick` is provided and data is resolved (not loading), wrap the thumbnail SVG container in a `<button>` element
  - [x] Subtask 6.2: Set `aria-label` on the button to match the existing `thumbnailLabel` text (e.g. "View day 1 route on map")
  - [x] Subtask 6.3: Set `className` to include `cursor-pointer` and maintain the existing `min-h-11 min-w-11` sizing
  - [x] Subtask 6.4: When `onThumbnailClick` is NOT provided (backward-compatible), keep the thumbnail as the existing `<div role="img">` — no behavioral change

- [x] Task 7: Unit tests for DayRouteStrip thumbnail interactivity (AC: 1, 3)
  - [x] Subtask 7.1: Add tests in `src/components/packt/day-route-strip.test.tsx`:
    - Thumbnail renders as a button when `onThumbnailClick` is provided and data is ready
    - Thumbnail renders as a non-interactive div when `onThumbnailClick` is not provided
    - Thumbnail does not become clickable while loading (even with `onThumbnailClick` provided)
    - `onThumbnailClick` fires when the thumbnail button is clicked

- [x] Task 8: Unit tests for cross-component wiring (AC: 1)
  - [x] Subtask 8.1: Add tests in `src/components/packt/day-card-body.test.tsx`:
    - `DayRouteStrip` receives `onThumbnailClick` when `onOpenMapTab` is provided to `DayCardBody`
    - `onOpenMapTab` is called with the correct `dayNumber` when `onThumbnailClick` fires
  - [x] Subtask 8.2: Add tests in `src/app/(app)/trips/[tripId]/trip-itinerary-view.test.tsx`:
    - `DayCardBody` receives `onOpenMapTab` when `TripItineraryView` receives it

- [x] Task 9: E2E tests (AC: 1, 2, 3)
  - [x] Subtask 9.1: Update `tests/e2e/features/map-tab.feature` — add scenario:
    - Tapping Day Route Strip thumbnail opens Map Tab scoped to that day
    - Whole Trip selector is still accessible after deep-link
  - [x] Subtask 9.2: Update `tests/e2e/steps/map-tab.steps.ts` — add step definitions for thumbnail tap and day scope verification

- [x] Task 10: Run targeted tests (AC: 1–3)
  - [x] Subtask 10.1: `npx vitest run src/components/packt/use-day-draft.test.ts` — all pass
  - [x] Subtask 10.2: `npx vitest run src/components/packt/day-route-strip.test.tsx` — all pass
  - [x] Subtask 10.3: `npx vitest run src/components/packt/day-card-body.test.tsx` — no regressions
  - [x] Subtask 10.4: `npx vitest run src/app/(app)/trips/[tripId]/trip-itinerary-view.test.tsx` — no regressions

- [x] Task 11: Run `packt-build-validator` (AC: 1–3)
  - [x] Subtask 11.1: lint, TypeScript, coverage, build, affected E2E
  - [x] Subtask 11.2: Fix any issues flagged
  - [x] Subtask 11.3: Re-run until PASS

### Review Findings

- [x] [Review][Patch] Keep Map scope synchronized with URL navigation [src/components/packt/map-tab.tsx:80] — fixed by subscribing to browser navigation and discarding local scope state when its URL parameter no longer matches.
- [x] [Review][Patch] Clear pin detail when filtered data no longer contains selected pin [src/components/packt/map-tab.tsx:105] — fixed by clearing invalid selection after refreshed pins remove it.

## Dev Notes

### Previous Story Intelligence

**Story 5.2 (done, current baseline):** Added Map Tab day filtering — day selector segmented control, `?day=N` query param sync, filtered pins by day, reservation pins always visible, keyboard navigation. Key files modified: `map-tab.tsx`, `trip-detail-tab-body.tsx`, `trip-detail-tab-body.test.tsx`. Created E2E coverage in `map-tab.feature`.

**Story 5.1 (done):** Created whole-trip Map Tab — MapLibre GL JS pin rendering, empty state, accessible detail panel, keyboard non-drag path. Created `map-tab.tsx`, `map-helpers.ts`.

**Key learnings from Epic 5 so far:**
- `MapTab` already has a `dayFilter` prop (from Story 5.1) that is read on mount to seed `selectedDayOverride` — this story activates it by passing it from the tab-switch mechanism
- `?tab=map` is the existing URL convention for the map tab; `?day=N` was added in Story 5.2 — the deep-link handler must update both params simultaneously
- `page-client.tsx` uses `window.history.pushState` for tab switching — the `onOpenMapTab` handler should follow this same pattern rather than introducing a different mechanism
- `DayRouteStrip` currently renders the thumbnail as a `<div role="img">` — this story makes it conditionally interactive (button) when a click handler is provided
- `day-card-body.tsx` already has `tripId` available — no need to thread additional identifiers

### Architecture Constraints

- **No new dependencies needed.** This story wires existing components together via callbacks — no new npm packages.
- **`route.ts` is not touched.** No route computation changes.
- **`schema.ts` is not touched.** No new DB columns or tables.
- **Server/client boundary preserved.** All changes are in client components. The tab-switch mechanism is URL-based (existing pattern), not a server action.
- **`openExternalMaps`** at `src/lib/open-external-maps.ts` — unchanged.
- **MapLibre GL JS** — the map persists across tab switches. When the user navigates from itinerary → map tab, the map re-mounts (it was unmounted while a different tab was active). The `dayFilter` prop seeds the day selector state on mount, so pins are immediately filtered.

### Files to MODIFY

| File | Changes |
|------|---------|
| `src/components/packt/use-day-draft.ts` | **NEW FILE** — extracted `useDayDraft` hook from `DayCardBody` |
| `src/components/packt/use-day-draft.test.ts` | **NEW FILE** — unit tests for the hook |
| `src/components/packt/day-card-body.tsx` | Remove `useDayDraft` logic (~80 lines), import hook; add `onOpenMapTab` prop; pass `onThumbnailClick` to `DayRouteStrip` |
| `src/components/packt/day-route-strip.tsx` | Add optional `onThumbnailClick` prop; conditionally render thumbnail as `<button>` when provided and data is resolved |
| `src/components/packt/day-route-strip.test.tsx` | Add thumbnail interactivity tests |
| `src/components/packt/day-card-body.test.tsx` | Add tests for thumbnail click → `onOpenMapTab` wiring |
| `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` | Add `onOpenMapTab` prop; thread to `DayCardBody` |
| `src/components/packt/trip-itinerary-view.test.tsx` | Add tests for `onOpenMapTab` threading |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Add `onOpenMapTab` prop; implement handler that switches to map tab via `?tab=map&day=N` URL update |
| `tests/e2e/features/map-tab.feature` | Add deep-link scenarios |
| `tests/e2e/steps/map-tab.steps.ts` | Add step definitions for thumbnail tap |

### Files NOT to touch

- `src/components/packt/map-tab.tsx` — MapTab already has the `dayFilter` prop and `?day=N` support from Story 5.2; no changes needed
- `src/components/packt/now-card.tsx` — Now Card scope, unaffected
- `src/components/packt/distance-time-pill.tsx` — Epic 2 scope, unaffected
- `src/components/packt/getting-around-section.tsx` — Epic 1 scope, unaffected
- `src/components/packt/place-row.tsx` — PlaceRow scope, unaffected
- `src/components/packt/place-row-action-bar.tsx` — Action bar scope, unaffected
- `src/db/schema.ts` — No schema changes
- `src/lib/route.ts` — No route computation changes
- `src/lib/utils.ts` — No utility changes needed
- `src/data/types.ts` — No new types needed
- `src/app/(app)/trips/[tripId]/page-client.tsx` — Tab bar is unaffected; the existing tab-switch mechanism via URL params handles the map tab switch

### Existing Patterns to Follow

**Tab switching pattern (from `page-client.tsx`):**
```tsx
// page-client.tsx already switches tabs via URL search params
// and re-renders the active tab content. The existing pattern:
// 1. User clicks a tab → pushState updates ?tab=<tabId>
// 2. Component reads activeTab from URL → renders the matching tab content
// For this story: the onOpenMapTab handler updates ?tab=map&day=N
```

**Day Route Strip thumbnail current rendering (`day-route-strip.tsx:52-67`):**
```tsx
<div
  aria-label={thumbnailLabel}
  className={cn("min-h-11 min-w-11 shrink-0 overflow-hidden", isLoading && "animate-pulse")}
  role="img"
  style={{ width: 44, height: 44, borderRadius: 8, background: "var(--surface-2)" }}
>
  {!isLoading && (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 44 44">
      {/* route line and pin circles */}
    </svg>
  )}
</div>
```

**MapTab dayFilter prop (`map-tab.tsx:19-21`):**
```tsx
/** Initial day number for deep-linking; read once on mount when the URL has no day parameter. */
dayFilter?: number | null;
```

**MapTab selectedDayNumber resolution (`map-tab.tsx:80-81`):**
```tsx
const selectedDayNumber =
  selectedDayOverride !== undefined ? selectedDayOverride : (parseDayNumber(dayParamFromUrl) ?? dayFilter ?? null);
```

**DayCardBody prop threading (`day-card-body.tsx:286-297`):**
```tsx
{locatedEvents.length >= 2 && tripId && tripTransitMode && (
  <DayRouteStrip
    summary={routeSummary}
    tripId={tripId}
    dayNumber={day.dayNumber}
    tripTransitMode={tripTransitMode}
    totalHopCount={locatedEvents.length - 1}
    conflictCount={conflicts.length}
    conflictingEventNames={conflictingEventNames}
    onConflictClick={handleConflictClick}
  />
)}
```

### Key Gotchas

1. **Thumbnail must be a `<button>`, not a `<div onClick>`.** Using a `<div onClick>` on an element with `role="img"` creates an ambiguous interaction pattern. Convert the entire thumbnail container to a `<button>` when interactive — this also gives native keyboard Enter/Space support for free.

2. **Don't make thumbnail clickable while loading.** The skeleton state (loading) should remain non-interactive. Only attach `onThumbnailClick` when `summary.status !== "loading"`.

3. **The `dayFilter` prop on MapTab is read once on mount.** Since `MapTab` is unmounted when a different tab is active and remounted when the map tab is selected, the `dayFilter` prop will be read fresh each time the user deep-links from a Day Route Strip. This is the correct behavior — no additional coordination needed.

4. **Tab switch must update both `?tab=map` and `?day=N` in the same URL update.** Do not use two separate `pushState` calls. The existing tab switch in `page-client.tsx` uses `buildTripDetailTabHref` — but that function only handles `?tab`. For this story, construct the URL directly: update `?tab=map` and set `?day=N` in a single `replaceState` call.

5. **Backward-compatibility: `onThumbnailClick` is optional.** When not provided (e.g., in tests or if the component is used elsewhere without a map tab), the thumbnail renders as the existing `<div role="img">` — no behavioral change.

6. **Day Route Strip is only rendered when `locatedEvents.length >= 2`.** The deep-link only exists for days with 2+ Located Items — this is correct per the AC (the strip doesn't exist for 0–1 located items).

7. **`dayCardBody` already receives `day.dayNumber`** — use it directly when constructing the `onThumbnailClick` handler. No need to derive it from other sources.

8. **The `onConflictClick` callback pattern** in `DayRouteStrip` provides the precedent for how callbacks work: `DayRouteStrip` receives an optional callback and conditionally wires it. Follow the same pattern for `onThumbnailClick`.

9. **E2E coverage** should verify the full flow: user sees Day Route Strip on itinerary tab → taps thumbnail → URL changes to `?tab=map&day=N` → Map Tab renders with the correct day selected → user can switch to "Whole Trip".

10. **No test needs to verify MapLibre map rendering.** The E2E test for the deep-link only needs to verify the Map Tab is active and the day selector reflects the deep-linked day — the map rendering is already covered by Story 5.1/5.2 tests.

11. **Pre-existing oversized files.** `day-card-body.tsx` (338 lines), `trip-detail-tab-body.tsx` (275 lines), and `trip-itinerary-view.tsx` (283 lines) all exceed the 250-line guideline. Task 1 extracts `useDayDraft` (~80 lines) from `day-card-body.tsx`, bringing it to ~260 lines. The remaining files receive only ~3–5 lines of prop threading each, so further splitting is not justified for this story.

### Testing Requirements

- **Unit tests** (Vitest): colocated `*.test.tsx` next to source
  - `src/components/packt/use-day-draft.test.ts` — hook behavior: open gap, activate draft, commit/cancel, makeGapProps
  - `src/components/packt/day-route-strip.test.tsx` — thumbnail interactivity (button vs div, loading guard, click handler)
  - `src/components/packt/day-card-body.test.tsx` — wiring `onThumbnailClick` → `onOpenMapTab`
  - `src/components/packt/trip-itinerary-view.test.tsx` — threading `onOpenMapTab` to `DayCardBody`
- **E2E tests** (playwright-bdd): extend `map-tab.feature` with deep-link scenarios
- Coverage threshold: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- Run targeted tests first, then `packt-build-validator` for full validation

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Epic 5, Story 5.3 (lines 519-535)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — Deep-link from Day Route Strip to Map Tab (FR-16), `map-tab.tsx` [MODIFY] entry
- UX Design: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/DESIGN.md` — Day Route Strip `thumbnail-min-target: 44px × 44px (clickable, deep-links to Map Tab)` (line 84)
- UX Experience: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md` — Day Route Strip thumbnail deep-link behavior (lines 82-83, 99), Key Flow 4 resolution step (line 170)
- Previous stories: `_bmad-output/implementation-artifacts/5-1-show-whole-trip-map.md`, `_bmad-output/implementation-artifacts/5-2-filter-map-tab-by-day.md`
- Day Route Strip component: `src/components/packt/day-route-strip.tsx` — current thumbnail rendering (lines 52-67)
- DayCardBody: `src/components/packt/day-card-body.tsx` — DayRouteStrip usage (lines 286-297)
- TripItineraryView: `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` — DayCardBody threading
- TripDetailTabBody: `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` — MapTab wiring (lines 230-238)
- MapTab: `src/components/packt/map-tab.tsx` — `dayFilter` prop (line 20), `selectedDayNumber` resolution (lines 80-81)
- page-client.tsx: `src/app/(app)/trips/[tripId]/page-client.tsx` — tab switch URL pattern
- Project context: `_bmad-output/project-context.md` — styling conventions, testing standards, 44×44px rule

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Full validator run: lint PASS, `tsc --noEmit` PASS, Vitest coverage PASS (3140 tests; lines 96.13%, functions 96.48%, branches 90.32%), Playwright affected E2E PASS (183/183, full suite triggered because `page-client.tsx`/`trip-detail-tab-body.tsx` are SHARED_GLOBS), production build PASS.
- One transient validator failure investigated and confirmed environmental: a mid-run source edit (restoring a dropped `eslint-disable-next-line` comment) triggered a dev-server hot-reload while an E2E worker was mid-flight, producing 2 unrelated failures (`day-planning` event time display, `packing-tab` drag reorder). A clean re-run with no concurrent edits passed 183/183.

### Completion Notes List

- Extracted `useDayDraft` from `DayCardBody` as a pure refactor (Task 1); added a `closeGap` accessor to the hook's return value beyond the story's literal signature — `DayCardBottomAdd`'s `closeGap` prop has no equivalent in the specified `{ draft, openGapKey, openGap, activateDraft, commitDraft, cancelDraft, makeGapProps }` shape, so it had to be added for the wiring to compile. All 14 hook unit tests pass; day-card-body.test.tsx (18 tests) and day-card.test.tsx (53 tests, +1 new) pass unchanged/extended, confirming behavior parity.
- `DayRouteStrip` thumbnail now renders as a `<button>` (with the existing `thumbnailLabel` as `aria-label`) when `onThumbnailClick` is provided and the summary isn't loading; otherwise it stays the original non-interactive `<div role="img">`.
- Discovered during implementation that the callback chain from `TripItineraryView` to `DayCardBody` actually passes through an intermediate `DayCard` component (not mentioned in the story's task list) — added `onOpenMapTab` threading there too (`day-card.tsx`), with a new DayCard test verifying the full click → callback path.
- The `onOpenMapTab` handler (`handleOpenMapTab`) is implemented in `page-client.tsx` (`TripDetailClient`), which owns `activeTab` state — not literally "in `TripDetailTabBody`" as Subtask 5.1's wording suggested, since `TripDetailTabBody` doesn't own tab state. It's threaded down through `TripDetailTabBody` → `TripItineraryView` → `DayCard` → `DayCardBody` → `DayRouteStrip`, following the existing pattern used by `onActivateReservationsCta`/`onLinkedEventTap`.
- Per Key Gotcha #4, the URL update uses a single `window.history.replaceState` call setting both `tab` and `day` params atomically (not `pushState`, and not two separate calls).
- `map-tab.tsx` was left untouched as directed — `MapTab` already reads `day` from `window.location.search` directly via `useSyncExternalStore`, so it picks up the deep-linked day on remount without needing a `dayFilter` prop threaded from `TripDetailTabBody`.
- Registered `use-day-draft.ts` and extended the `map-tab` entry in `tests/e2e/feature-map.mjs` (added `day-route-strip.tsx`, `day-card.tsx`, `day-card-body.tsx`, `trip-itinerary-view.tsx`) so future edits to those files re-run the new deep-link E2E scenario; `scripts/feature-map.test.mjs` consistency checks pass.
- Fixed a latent test-isolation bug surfaced while adding `page-client.test.tsx` coverage: earlier tests in that file `vi.spyOn` real `window.history` methods without ever restoring them, and `afterEach`'s `vi.clearAllMocks()` doesn't undo a custom `mockImplementation` — so a later test's `beforeEach` URL reset silently no-ops. Added defensive `mockRestore()` calls in the two new tests to keep the file's `window.history` mocking self-contained.

### File List

- `src/components/packt/use-day-draft.ts` (new)
- `src/components/packt/use-day-draft.test.ts` (new)
- `src/components/packt/day-card-body.tsx`
- `src/components/packt/day-route-strip.tsx`
- `src/components/packt/day-route-strip.test.tsx`
- `src/components/packt/day-card.tsx`
- `src/components/packt/day-card.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.test.tsx`
- `src/app/(app)/trips/[tripId]/page-client.tsx`
- `src/app/(app)/trips/[tripId]/page-client.test.tsx`
- `tests/e2e/features/map-tab.feature`
- `tests/e2e/steps/map-tab.steps.ts`
- `tests/e2e/feature-map.mjs`

## Change Log

- 2026-07-17: Implemented all 11 tasks — extracted `useDayDraft` hook, wired the Day Route Strip thumbnail as an interactive button, threaded `onOpenMapTab` through `DayCard`/`TripItineraryView`/`TripDetailTabBody` to a `page-client.tsx` handler that deep-links into the Map Tab via a single `?tab=map&day=N` URL update, added unit and E2E coverage, and passed the full `packt-build-validator` gate (lint, tsc, coverage, E2E, build all PASS). Status set to review.
