# Story 2.3: Creation Delight — Confetti & Staggered Day Animation

Status: done

## Story

As a traveler,
I want a brief celebration and animated reveal when I first land on a newly created trip,
so that the creation moment feels intentional and memorable.

## Acceptance Criteria

1. Given I have just created a new trip and the trip page has fully loaded, then a confetti animation plays for approximately 1 second, then stops and clears.
2. Given the confetti animation, then it fires only after the trip page content is visible — never over a loading spinner or skeleton state.
3. Given the new trip was created with dates, when the trip page first loads, then the day cards appear with a staggered entrance animation — each card fades/slides in sequentially with a brief offset — rather than all at once.
4. Given the staggered day animation, then it plays only on the initial load of the newly created trip; navigating away and back does not replay it.
5. Given I navigate to a trip I did not just create, then no confetti or staggered animation plays.

**FRs:** FR21, FR22

## Tasks / Subtasks

- [x] Install `canvas-confetti` and its TypeScript definitions (AC: 1, 2)
  - [x] `npm install canvas-confetti @types/canvas-confetti`
  - [x] Verify the package appears in `package.json` under `dependencies` and `devDependencies` (types)

- [x] Create `src/components/packt/trip-confetti.tsx` — a client component that fires confetti on mount (AC: 1, 2, 4, 5)
  - [x] `"use client"` as the very first line
  - [x] Define `TripConfettiProps { tripId: string }` interface before the function
  - [x] `useEffect` fires `confetti({ particleCount: 150, spread: 80, origin: { y: 0.55 } })` once on mount
  - [x] After firing, call `window.history.replaceState(null, "", `/trips/${tripId}`)` to strip `?new=1` from the address bar without triggering a Next.js re-render
  - [x] Dynamic-import `canvas-confetti` inside `useEffect` (`const confetti = (await import("canvas-confetti")).default`) — it is browser-only and must not execute during SSR
  - [x] Component renders `null` — no DOM elements, no layout impact
  - [x] Empty dependency array `[]` ensures the effect runs exactly once per mount

- [x] Create `src/components/packt/trip-confetti.test.tsx` (AC: 1, 2, 4, 5)
  - [x] Mock `canvas-confetti` module: `vi.mock("canvas-confetti", () => ({ default: vi.fn() }))`
  - [x] Mock `window.history.replaceState`
  - [x] Test: mounting `<TripConfetti tripId="abc" />` calls the confetti fn exactly once
  - [x] Test: after mount, `window.history.replaceState` is called with `/trips/abc`
  - [x] Test: renders `null` (no DOM elements in the container)

- [x] Thread `isNew` prop from `page.tsx` down to `TripItineraryView` (AC: 3, 4, 5)
  - [x] `src/app/(app)/trips/[tripId]/page.tsx` — pass `isNew={sp.new === "1"}` to `TripDetailClient` alongside the existing `initialExpandedDayNumber` prop
  - [x] `src/app/(app)/trips/[tripId]/page-client.tsx` — add `isNew?: boolean` to `TripDetailClientProps`; render `<TripConfetti tripId={trip.id} />` when `isNew === true`; pass `isNew` to `TripDetailTabBody`
  - [x] `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` — add `isNew?: boolean` to `TripDetailTabBodyProps`; forward it to `TripItineraryView`
  - [x] `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` — add `isNew?: boolean` to `TripItineraryViewProps`; apply stagger wrapper when `isNew && days.length > 0` (see stagger spec below)

- [x] Split `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` before adding stagger (pre-condition for next step)
  - [x] Extract the Unscheduled Events collapsible block (lines ~155–225: the `<div>` that renders `groupedUnscheduledEntries`) into `src/app/(app)/trips/[tripId]/unscheduled-events-section.tsx`
  - [x] New component props: `{ unscheduledEvents: TripEvent[]; dateFormat?: string; tripDocs?: Document[]; onUpdateEvent: (event: TripEvent) => void; onDeleteEvent: (id: string) => void; }` — plus local state for `unscheduledOpen`
  - [x] `trip-itinerary-view.tsx` imports and renders `<UnscheduledEventsSection .../>` where the inline block was; file drops from ~287 to ~215 lines after extraction

- [x] Implement stagger animation in `TripItineraryView` (AC: 3, 4, 5)
  - [x] When `isNew` is `true` and `days.length > 0`, wrap each `DayCard` render in a `<div>` with Tailwind classes `animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards duration-300` and inline `style={{ animationDelay: `${index * 80}ms` }}`
  - [x] When `isNew` is `false` or `undefined`, render `DayCard` without any wrapper (preserve existing behavior exactly)
  - [x] The stagger offset of `80ms` per card gives a natural cascade feel without exceeding ~600ms total for a 7-day trip
  - [x] Do not apply stagger to the Unscheduled Events section — only to the scheduled day cards

- [x] Update `src/app/(app)/trips/[tripId]/trip-itinerary-view.test.tsx` (AC: 3, 4, 5)
  - [x] Add test: when `isNew={true}` and days are present, each day wrapper has class `animate-in`
  - [x] Add test: when `isNew={false}`, day wrappers do not have `animate-in`
  - [x] Add test: when `isNew={true}` but `days.length === 0`, no stagger wrapper is rendered (empty state renders normally)
  - [x] Existing tests must continue to pass — no regressions to add/remove-day, unscheduled events section, or dialog behavior

- [x] Update `src/app/(app)/trips/[tripId]/page-client.test.tsx` (AC: 1, 2)
  - [x] Mock `@/components/packt/trip-confetti` (renders null)
  - [x] Add test: when `isNew={true}`, `TripConfetti` is rendered
  - [x] Add test: when `isNew={false}` or absent, `TripConfetti` is not rendered

- [x] Add E2E coverage to `tests/e2e/features/create-trip.feature` and `tests/e2e/steps/create-trip.steps.ts` (AC: all)
  - [x] Add scenario: creating a trip with dates results in day cards that have the stagger animation class on first load
  - [x] No confetti canvas assertions needed in E2E — canvas-confetti manages its own canvas lifecycle; asserting its DOM presence is brittle and unreliable. The stagger animation test is the durable behavioral assertion here.
  - [x] The confetti AC is covered by unit tests only (see trip-confetti.test.tsx tasks above)

## Dev Notes

### What Already Exists

| Surface | Current state | This story changes |
| --- | --- | --- |
| `src/app/(app)/trips/[tripId]/page.tsx` | Already reads `searchParams.new === "1"` and passes `initialExpandedDayNumber={sp.new === "1" ? 1 : undefined}` to `TripDetailClient` | Add `isNew={sp.new === "1"}` as a separate prop alongside the existing one |
| `src/app/(app)/trips/actions.ts:178` | `redirect(`/trips/${tripId}?new=1`)` already appended by trip creation | No change — this is the source of the `?new=1` signal |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Has `TripDetailClientProps` with `initialExpandedDayNumber?` | Add `isNew?: boolean`; render `<TripConfetti>` here; pass `isNew` down |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Has `TripDetailTabBodyProps`; passes `initialExpandedDayNumber` to `TripItineraryView` | Add `isNew?: boolean`; forward to `TripItineraryView` |
| `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` | 287 lines; maps `days` directly to `<DayCard>` elements with no wrapper | **First** extract unscheduled-events block to `UnscheduledEventsSection`; **then** add stagger wrapper div when `isNew && days.length > 0` |
| `src/app/(app)/trips/[tripId]/unscheduled-events-section.tsx` | Does not exist | NEW — extracted from `trip-itinerary-view.tsx`; owns `unscheduledOpen` state and renders the collapsible grouped-events block |
| `tw-animate-css` | Already imported in `src/app/globals.css` line 2; provides `animate-in`, `fade-in`, `slide-in-from-bottom-*`, `fill-mode-backwards`, `duration-*` utilities | Use these existing utilities — no new CSS needed |

### Confetti Component Spec

```tsx
"use client";

import { useEffect } from "react";

interface TripConfettiProps {
  tripId: string;
}

export function TripConfetti({ tripId }: TripConfettiProps): null {
  useEffect(() => {
    let cancelled = false;
    async function fire() {
      const confetti = (await import("canvas-confetti")).default;
      if (cancelled) return;
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.55 } });
      window.history.replaceState(null, "", `/trips/${tripId}`);
    }
    void fire();
    return () => { cancelled = true; };
  }, [tripId]);
  return null;
}
```

The `cancelled` guard prevents confetti from firing if the component unmounts before the dynamic import resolves (e.g. fast navigation away). `tripId` is in the dependency array so the effect re-fires if the component receives a new tripId (theoretically unreachable in practice, but correct).

### Why `window.history.replaceState` instead of `router.replace`

`useRouter().replace()` in Next.js App Router triggers a soft navigation, which re-runs the Server Component and causes a second data fetch. `window.history.replaceState` changes the address bar URL without any React/Next.js involvement — the page keeps its current state, canvas-confetti continues its independent animation, and there is no flash or layout shift. This is the correct tool when the intent is URL cosmetics only.

### Stagger Animation: How `tw-animate-css` Works Here

`tw-animate-css` (already imported at `globals.css:2`) provides the following composable utilities:
- `animate-in` — triggers the `enter` keyframe animation
- `fade-in` — sets `--tw-enter-opacity: 0` so the animation starts from opacity 0
- `slide-in-from-bottom-4` — sets `--tw-enter-translate-y` to 1rem so the card slides up from below
- `fill-mode-backwards` — ensures the card is invisible *before* its delay elapses (critical for stagger)
- `duration-300` — 300ms animation duration

Per-card delay is applied via inline `style={{ animationDelay: `${index * 80}ms` }}`.

Example render for day card at index 2:
```tsx
<div
  className="animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards duration-300"
  style={{ animationDelay: "160ms" }}
>
  <DayCard ... />
</div>
```

**Do not** use arbitrary Tailwind values like `delay-[160ms]` — use inline style per project convention.

### `isNew` Prop Threading: What Changes at Each Layer

**`page.tsx`** — add `isNew` to the JSX only:
```tsx
<TripDetailClient
  detail={detail}
  nowISO={now.toISOString()}
  dateFormat={dateFormat}
  initialExpandedDayNumber={sp.new === "1" ? 1 : undefined}
  isNew={sp.new === "1"}   // ← add this
/>
```

**`page-client.tsx`** — add `isNew?: boolean` to `TripDetailClientProps`; add it to the destructure; pass to `TripDetailTabBody`; and conditionally render `TripConfetti`:
```tsx
{isNew && <TripConfetti tripId={trip.id} />}
```
Place this somewhere in the JSX tree that doesn't affect layout (e.g. after the closing `</TripEditSheet>` tag or before the return's root div close).

**`trip-detail-tab-body.tsx`** — add `isNew?: boolean` to `TripDetailTabBodyProps`, destructure it, and pass to `TripItineraryView`.

**`trip-itinerary-view.tsx`** — add `isNew?: boolean` to `TripItineraryViewProps`, destructure it. Change the `days.map` render:
```tsx
{days.map((day, index) => (
  isNew ? (
    <div
      key={day.dayNumber}
      className="animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards duration-300"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <DayCard ... />
    </div>
  ) : (
    <DayCard key={day.dayNumber} ... />
  )
))}
```

### What Must Be Preserved (Do Not Break)

- `initialExpandedDayNumber` behavior in `page.tsx`, `TripDetailClient`, `TripDetailTabBody`, and `TripItineraryView` — unchanged
- Unscheduled Events section rendering — no stagger, no interaction with `isNew`
- Add Day / Remove Last Day controls — unchanged
- Removal confirmation dialog behavior — unchanged
- All existing tests in `trip-itinerary-view.test.tsx`, `page-client.test.tsx` — must continue to pass

### Architecture Guardrails

- `"use client"` must be the very first line of `trip-confetti.tsx`
- `canvas-confetti` must be dynamic-imported inside `useEffect` — it uses browser APIs and will crash during SSR if imported at module level
- No `new Date()` anywhere — not needed for this story
- No hardcoded colors — no style additions needed beyond the stagger delay
- Lucide icons: not introduced in this story
- All new types (none needed here) would go in `src/data/types.ts`
- `cn()` from `@/lib/utils` may be used in `trip-itinerary-view.tsx` if conditional class merging is preferred over the ternary pattern above

### Testing Guardrails

- Unit test files live next to source: `trip-confetti.test.tsx` in `src/components/packt/`
- Do NOT re-mock `next/navigation` — global mocks are already in `vitest.setup.mts`; `useRouter` mock is already available there
- The `vitest.setup.mts` global mock for `next/navigation` provides `useRouter` returning `{ push: vi.fn(), replace: vi.fn(), back: vi.fn(), ... }` — no per-file mock needed
- Mock `canvas-confetti` per-file since it is a new third-party module not already globally mocked
- Coverage threshold: `trip-confetti.tsx` is new domain code in `src/components/packt/**` — it counts toward the ≥95% lines/functions threshold
- E2E assertions for the stagger animation use `page.locator('[class*="animate-in"]')` or check the first day card wrapper has the expected class via `toHaveClass`

### E2E Scenario Spec

Add to `tests/e2e/features/create-trip.feature` (under the existing `@cleanup-created-trip` tag):

```gherkin
Scenario: Creating a trip with dates shows staggered day card animation
  When I open the New Trip dialog
  And I type "E2E Animated Trip" in the title field
  And I select dates "2026-09-01" to "2026-09-03"
  And I click the Create button
  Then I am on the trip detail page for "E2E Animated Trip"
  And the day cards have the stagger animation class
```

Add the trip name `"E2E Animated Trip"` to the `CREATED_TRIP_NAMES` constant in `create-trip.steps.ts` so the `After` cleanup hook removes it.

Add the step definition:
```ts
Then("the day cards have the stagger animation class", async ({ page }) => {
  // Wait for at least one animated day card wrapper to appear
  const animatedCard = page.locator('[class*="animate-in"]').first();
  await expect(animatedCard).toBeVisible({ timeout: 10_000 });
});
```

### Previous Story Intelligence

- Story 2.2 established that scope boundaries are firm: explicitly noted "Do not add Story 2.3 confetti or staggered-load animation work here." This story picks up exactly where 2.2 left off.
- Story 1.2 introduced the `?new=1` redirect in `actions.ts:178` and the `initialExpandedDayNumber` prop in `page.tsx`. The `isNew` prop added here is a parallel signal on the same URL parameter — it is additive and does not replace `initialExpandedDayNumber`.
- Story 2.1 and 2.2 followed the pattern of scoped route actions plus client component transitions. This story is entirely client-side (animation only) and does not introduce any server action or DB mutation.

### Git Intelligence

- Recent commits: `bee6d46 feat: preserve displaced events during trip date changes` and `9a8a96f feat: add and remove itinerary days` show that story-level work arrives in a single focused commit per story. Follow the same pattern — one commit for this story's changes.
- The branch name pattern used in this repo is descriptive kebab-case (e.g. `date-range-change-logic`). Suggested branch: `creation-delight-animations`.

### Latest Technical Information

- `canvas-confetti` v1.9.x: default export is a function `confetti(options)`. `options.particleCount`, `options.spread`, and `options.origin.y` are the primary knobs. The function is fire-and-forget; it manages its own `<canvas>` element and cleans it up after the animation completes. No manual cleanup needed.
- `@types/canvas-confetti` provides the TypeScript types and should be in `devDependencies`.
- `tw-animate-css` `fill-mode-backwards` sets `animation-fill-mode: backwards`, which means the element's initial state (before the animation delay elapses) is the `from` keyframe state — in this case, `opacity: 0` and translated down. Without this, cards would be visible at their final position for the delay period before the animation starts, breaking the stagger effect.
- Next.js App Router: `searchParams` is a `Promise<Record<string, string | string[] | undefined>>` that must be `await`ed — already handled correctly in `page.tsx:14`.

### Project Structure Notes

- No `_bmad-output/architecture.md` or UX shard exists in this repo — project-context.md is the authoritative implementation reference.
- No schema changes, no new DB types, no server actions — this is a purely client-side presentation story.
- `src/app/**` is excluded from coverage thresholds but `src/components/packt/trip-confetti.tsx` is not — ensure the test file covers all branches.

### References

- `_bmad-output/epics.md` — Epic 2, Story 2.3, FR21, FR22, NFR5, UX-DR2, UX-DR3
- `_bmad-output/project-context.md` — component conventions, styling rules, testing pyramid
- `_bmad-output/implementation-artifacts/2-2-date-range-change-silent-extend-displaced-events.md` — scope boundary confirmation; previous story intelligence
- `src/app/(app)/trips/[tripId]/page.tsx` — existing `searchParams.new` handling and prop surface
- `src/app/(app)/trips/[tripId]/page-client.tsx` — current `TripDetailClientProps` and render tree
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` — prop threading layer
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` — current day card map; stagger target
- `src/components/packt/day-card.tsx` — existing DayCard API; no changes needed
- `src/app/globals.css:2` — confirms `@import "tw-animate-css"` is active
- `tests/e2e/features/create-trip.feature` — existing E2E extension point
- `tests/e2e/steps/create-trip.steps.ts` — existing step infrastructure (CREATED_TRIP_NAMES, After cleanup, clickDate helper)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Added `TripConfetti` with one-shot confetti, dynamic import, and `?new=1` URL cleanup after first render.
- Threaded `isNew` from the route entry through the trip detail client tree and preserved `initialExpandedDayNumber` behavior.
- Extracted `UnscheduledEventsSection` from `TripItineraryView` and added staggered day-card entrance wrappers only for newly created dated trips.
- Added unit coverage for confetti and stagger behavior, expanded `create-trip` E2E coverage, and tightened the Day 1 expansion locator.
- Validation passed with `npm run lint`, `npx tsc --noEmit`, `npm run test:coverage`, `npm run build`, and `npm run test:e2e`.
- Required `standards-check` commands were attempted, but `standards-check` is not installed in this environment.

### File List

- package.json
- package-lock.json
- playwright.config.ts
- src/app/(app)/trips/[tripId]/page.tsx
- src/app/(app)/trips/[tripId]/page-client.tsx
- src/app/(app)/trips/[tripId]/page-client.test.tsx
- src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx
- src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx
- src/app/(app)/trips/[tripId]/trip-itinerary-view.test.tsx
- src/app/(app)/trips/[tripId]/unscheduled-events-section.tsx
- src/components/packt/trip-confetti.tsx
- src/components/packt/trip-confetti.test.tsx
- tests/e2e/features/create-trip.feature
- tests/e2e/steps/create-trip.steps.ts
- _bmad-output/implementation-artifacts/2-3-creation-delight-confetti-staggered-day-animation.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Review Findings

- [x] [Review][Patch] TripConfetti — simplified try/catch for dynamic import, removed cancelled guard (race window negligible, canvas-confetti self-cleans) [`trip-confetti.tsx`]
- [x] [Review][Patch] Stagger animation gated to initial render day count — days added after mount no longer get stagger wrappers [`trip-itinerary-view.tsx`]
- [x] [Review][Patch] E2E selector narrowed to `[data-testid^="day-card-stagger"]` — no longer matches unrelated animate-in elements [`create-trip.steps.ts`]
- [x] [Review][Patch] Test DOM query replaced with `screen.queryByTestId` — no longer brittle to class renames [`trip-itinerary-view.test.tsx`]
- [x] [Review][Patch] Added `isNew={false}` explicit test to match server component contract [`page-client.test.tsx`]

### Change Log

- 2026-05-26: Story 2.3 created with full implementation context, confetti component spec, stagger animation spec, and E2E scenario spec.
- 2026-05-26: Implemented `TripConfetti`, threaded `isNew`, extracted `UnscheduledEventsSection`, and added staggered day-card animation coverage.
- 2026-05-26: Updated Playwright E2E config for the port-3001 auth redirect and tightened the Day 1 expansion locator after validation.
