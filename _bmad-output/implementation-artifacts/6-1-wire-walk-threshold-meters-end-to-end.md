# Story 6.1: Wire walkThresholdMeters end-to-end into route/mode selection

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a traveler who set a walk-distance threshold in my profile,
I want that threshold to actually influence which transit mode is used for nearby hops,
so that the preference I configured has a real effect on Day Route Strip, Schedule Conflict, and Map Tab route calculations — and keeps showing correctly on the profile page itself.

## Acceptance Criteria

1. **Given** a user with `walkThresholdMeters` set on their profile, **when** any route/mode calculation runs for their trips (Day Route Strip, Schedule Conflict), **then** `resolveEffectiveMode` receives the user's real `walkThresholdMeters` value instead of `undefined`.
2. **Given** `trip-detail-tab-body.tsx` renders `TripItineraryView`, **when** the page loads, **then** the current user's `walkThresholdMeters` is fetched and threaded through as a prop, not silently dropped.
3. **Given** a hop distance below the configured threshold, **when** mode is resolved, **then** the hop uses `"walk"` regardless of the trip's default transit mode — matching the already-tested `resolveEffectiveMode` behavior in `route.test.ts`.
4. **Given** the profile page's Getting Around section, **when** the page is loaded or reloaded (not just immediately after an in-session edit), **then** the transit-mode segment and walk-threshold `Select` reflect the value actually saved in the database — not a reset-to-default.
5. **And** no existing route/mode or profile test regresses — `walkThresholdMeters` was previously always `undefined` in every server-fetched fixture; fixtures must now cover both `null`/`undefined` (no threshold) and a real numeric threshold.

## Tasks / Subtasks

- [ ] **Task 1: Fix the root cause — `getUserById` never selects `transitMode`/`walkThresholdMeters`** (AC: #4)
  - This is the actual root bug, not just a trip-detail wiring gap. `src/lib/queries.ts:69-84`'s `getUserById()` explicit column `.select({...})` omits both `users.transitMode` and `users.walkThresholdMeters`. Every caller of `getUserById()` — the profile page (`src/app/(app)/profile/page.tsx:9`) **and** the trip-detail page (`src/app/(app)/trips/[tripId]/page.tsx:28`) — gets `undefined` for both fields today, regardless of what's actually saved in Postgres.
  - Concretely: `src/app/(app)/profile/preferences-section.tsx:54-55` seeds its `useState` from `user.transitMode ?? TransitMode.Drive` and `user.walkThresholdMeters ?? null`. Since `user` (server-fetched via `getUserById`) never has these fields populated, the Getting Around section silently resets to "Drive" / "Off" on every fresh page load — even right after the user saved a different value and the browser re-navigates to `/profile` post-`revalidatePath`.
  - [ ] Add `transitMode: users.transitMode,` and `walkThresholdMeters: users.walkThresholdMeters,` to the `.select({...})` block in `getUserById()` (`src/lib/queries.ts`).
  - [ ] `src/lib/queries.ts` is excluded from coverage (see project-context.md), so no colocated unit test is required for this function itself — but downstream consumers below must be covered.
- [ ] **Task 2: Thread `walkThresholdMeters` through the trip-detail page → client → tab-body chain** (AC: #1, #2, #3)
  - The receiving end already exists and is already tested — do not re-invent it. `TripItineraryView` (`src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx:35,131,204`) already accepts `walkThresholdMeters?: number | null` and forwards it to every `DayCard`; `DayCard` (`src/components/packt/day-card.tsx:14,73,125`) already forwards it to `DayCardBody`; `DayCardBody` already threads it into the `getDayRouteSummary`/`getDayScheduleConflicts` server-action calls via `route-actions.ts`. The gap is entirely upstream of `TripItineraryView`.
  - [ ] `src/app/(app)/trips/[tripId]/page.tsx`: the `profile` object fetched at line 28 (`getUserById(session.id!)`) will now carry `walkThresholdMeters` once Task 1 lands. Pass `walkThresholdMeters={profile?.walkThresholdMeters}` (and, while touching this, consider whether `tripTransitMode` already flows from `detail.trip.transitMode` — verify current handling, it's a trip-level field on `TripDetailPayload`, not a profile one; do not conflate the two) as a new prop on `<TripDetailClient>`.
  - [ ] `src/app/(app)/trips/[tripId]/page-client.tsx`: add `walkThresholdMeters?: number | null` to `TripDetailClientProps` (mirror the existing `warningThreshold`/`dangerThreshold` prop pattern at lines 59-60), destructure it, and pass it through to `<TripDetailTabBody walkThresholdMeters={walkThresholdMeters} ... />` (insert alongside the other trip/profile-derived props around line 240).
  - [ ] `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`: add `walkThresholdMeters?: number | null` to `TripDetailTabBodyProps` (it currently has no such field — see the interface starting at line 28), destructure it, and pass it to `<TripItineraryView walkThresholdMeters={walkThresholdMeters} ... />` (the existing `<TripItineraryView` call is at line ~173; it currently does not pass this prop at all).
- [ ] **Task 3: Acknowledge pre-existing oversized files touched by Task 2 — do not split them here** (scope guardrail, not an AC)
  - `page-client.tsx` (329 lines) and `trip-detail-tab-body.tsx` (278 lines) already exceed the project's ~250-line component guideline, entirely pre-existing this story — Task 2 adds one prop declaration + one JSX attribute to each, not new bulk. Splitting either is a real architectural change (e.g., `trip-detail-tab-body.tsx`'s size comes from being a deliberate 7-tab dispatcher; `page-client.tsx`'s from a large orchestration prop-list to that dispatcher) unrelated to this story's narrow plumbing purpose, and forcing it here would balloon the risk of what should be a small, safe fix.
  - [ ] Add one entry to `_bmad-output/implementation-artifacts/deferred-work.md` under a new "Deferred from: story planning of 6-1-wire-walk-threshold-meters-end-to-end" heading, noting both files' pre-existing size and that a split is tracked as future work, not blocking this story.
  - [ ] Do not perform the split as part of this story.
- [ ] **Task 4: Revisit the haversine mode-misassignment risk now that it's live** (AC: #1, #3)
  - `getStraightLineDistanceMeters` in `src/lib/route.ts` estimates hop distance via haversine before the real route is known, to pick a per-hop transit mode. This was flagged in the Epic 4.1 review as "reasonable proxy, but can misassign mode when road distance diverges from straight-line distance" — previously moot since the threshold was always `undefined`. It is no longer moot once this story ships.
  - [ ] Decide and document in Dev Notes / Completion Notes whether the existing haversine proxy is accepted as-is (straight-line distance is a reasonable lower bound for "is this close enough to walk," and a slight over-eagerness to suggest "walk" for a hop that's actually longer by road is a low-severity UX nit, not a correctness bug) or whether a bound/adjustment is warranted. Do not silently ignore this — a one- or two-sentence rationale in the story's Completion Notes is the deliverable here, not necessarily a code change.
- [ ] **Task 5: E2E — profile preference persistence** (AC: #4)
  - `tests/e2e/features/profile.feature` has zero coverage today for the global transit-mode/walk-threshold preference surviving a reload — the exact bug this story fixes (Task 1). It already has the right template to copy: the "Font size preference persists across reload" scenario (and `tests/e2e/steps/profile.steps.ts:60-63,95-97` for the `reload`/`persist` step pattern; also see "Update preferences" using `"the currency preference should persist after reload"`).
  - [ ] Add a new scenario to `profile.feature`, e.g. "Getting Around preference persists across reload": navigate to the section that hosts the transit-mode segmented control + walk-threshold `Select` (per UX-DR9, this reuses the Getting Around segmented control + a preset-distance `Select` on the profile page), change both away from their defaults, save, reload, and assert both still show the saved values (not reset to "Drive"/"Off").
  - [ ] Add matching step definitions to `tests/e2e/steps/profile.steps.ts` following the existing currency/font-size pattern in the same file.
  - [ ] No `feature-map.mjs` changes needed — `src/app/(app)/profile/**` is already a full `FEATURE_MAP` entry (`@feat:profile`, line ~117), and `src/app/(app)/trips/[tripId]/page.tsx`/`page-client.tsx`/`trip-detail-tab-body.tsx` are already in `SHARED_GLOBS` (lines ~228-229 and the `trip-detail-tab*` glob), so this story's file changes already trigger full E2E — verified, do not re-register.
- [ ] **Task 6: Tests** (AC: #1-#5)
  - [ ] `src/lib/queries.test.ts` does not exist and is not required (queries.ts is coverage-excluded) — skip.
  - [ ] `src/app/(app)/trips/[tripId]/page.test.tsx`: extend to assert `walkThresholdMeters` is read from the fetched profile and passed to `TripDetailClient` (follow the existing pattern used for `warningThreshold`/`dangerThreshold` assertions in this same file).
  - [ ] `src/app/(app)/trips/[tripId]/page-client.test.tsx`: extend to assert `walkThresholdMeters` is forwarded to `TripDetailTabBody` (mirror existing prop-forwarding assertions in this file).
  - [ ] `src/app/(app)/trips/[tripId]/trip-detail-tab-body.test.tsx`: extend to assert `walkThresholdMeters` is forwarded to `TripItineraryView`. Note: `trip-itinerary-view.test.tsx` already has this exact test pattern one layer down ("forwards tripId, tripTransitMode, and walkThresholdMeters to every day card" at line 309, and the "leaves ... unset ... when not provided" counterpart at line 325) — mirror that test's structure here.
  - [ ] `src/app/(app)/profile/preferences-section.test.tsx`: add/extend a test asserting the section correctly displays a non-default `transitMode`/`walkThresholdMeters` when passed on the `user` prop (i.e., that the previously-always-undefined field now has a real rendering path). Check whether existing tests already pass a `user` fixture with these fields set to a non-default value and only asserted the write path — if so, add the missing read/render assertion rather than duplicating fixture setup.
  - [ ] `src/lib/route.test.ts`: no changes expected — `resolveEffectiveMode` and its callers are already fully covered for both threshold-set and threshold-unset cases; this story is pure plumbing upstream of `route.ts`, not a `route.ts` behavior change.

## Dev Notes

- **This is a plumbing story, not a new-feature story.** Every function that needs to *consume* `walkThresholdMeters` already exists, is already correct, and is already tested (`resolveEffectiveMode` in `route.ts`, `getDayRouteSummary`/`getDayScheduleConflicts`, `DayCardBody`, `DayCard`, `TripItineraryView`). Do not modify `route.ts`'s calculation logic. The entire fix is: (1) one query selects two more columns, (2) three components forward one more prop each, in a chain that already has an identical prop (`tripTransitMode`) threaded the same way as a template to copy.
- **Root cause is one level higher than the original deferred-work note assumed.** The Epic 4.1 code review (2026-07-15) framed this as "`walkThresholdMeters` threaded through every component layer but never supplied a real value... no file in the codebase currently reads `userProfile.walkThresholdMeters` into any route calculation" and pointed at `trip-detail-tab-body.tsx`. That's accurate but incomplete — the actual root is that `getUserById()` in `src/lib/queries.ts` never selects the column in the first place, which means the **profile page's own Getting Around section is also silently broken** on every fresh load (Task 1, AC #4). Fix the query first; the trip-detail threading (Task 2) is downstream of that and cannot show correct data until Task 1 lands.
- **Mirror the existing `tripTransitMode` threading pattern exactly.** `tripTransitMode` is already threaded through this exact same chain (`page.tsx` → `page-client.tsx` → `trip-detail-tab-body.tsx` → `trip-itinerary-view.tsx`) from `detail.trip.transitMode` (a trip-level field, not a profile one). `walkThresholdMeters` is a **profile-level** field (`profile?.walkThresholdMeters`, not `trip.walkThresholdMeters` — there is no such trip field). Don't confuse the two data sources when wiring the new prop.
- **`route.ts` coverage is currently 100% lines/95.34% branches** (per the latest `packt-build-validator` coverage run) — the two uncovered branch lines are 54 and 192, unrelated to this story. Do not let a well-intentioned "add more route.ts tests" instinct create unnecessary duplicate coverage; this story's test surface is entirely in the prop-threading layer (page/page-client/tab-body/preferences-section), not in `route.ts` itself.
- **`getUserById` return type is `UserProfile`** (`src/data/types.ts`), which already declares `transitMode?: TransitMode | null` and `walkThresholdMeters?: number | null` as optional fields — no type changes needed, purely a missing `.select()` column.

### Project Structure Notes

- No new files. All changes are edits to existing files already in the exact chain this story touches:
  - `src/lib/queries.ts` (MODIFY — add 2 columns to one `.select()`)
  - `src/app/(app)/trips/[tripId]/page.tsx` (MODIFY — pass one new prop)
  - `src/app/(app)/trips/[tripId]/page-client.tsx` (MODIFY — accept + forward one new prop)
  - `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` (MODIFY — accept + forward one new prop)
  - Matching `.test.tsx`/`.test.ts` files for each of the above (colocated, per project convention — never a separate `__tests__/` dir)
- No conflicts with unified project structure — this story stays entirely within already-established file locations and prop-threading conventions.

### References

- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — original finding from the Epic 4.1 code review (2026-07-15), and the Epic 6 "Source" note in epics.md pointing back to it.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 6: Route Reliability & Data Integrity] — Story 6.1 acceptance criteria (this file's ACs are copied verbatim from there).
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements] — "Per-hop resolution: `effectiveMode = (user.walkThresholdMeters is set AND hopDistance < walkThresholdMeters) ? "walk" : trip.transitMode`" — the original architecture intent this story finally satisfies end-to-end.
- [Source: src/lib/route.ts] — `resolveEffectiveMode`, `getDayRouteSummary`, `getDayScheduleConflicts` (consumer functions, already correct, do not modify).
- [Source: src/lib/queries.ts:68-107] — `getUserById()`, the function requiring the column-select fix.
- [Source: src/app/(app)/trips/[tripId]/page.tsx] — trip-detail Server Component, fetches `profile` but currently drops `walkThresholdMeters`.
- [Source: src/app/(app)/trips/[tripId]/page-client.tsx] — `TripDetailClientProps`/`TripDetailClient`, needs the new prop added and forwarded.
- [Source: src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx] — `TripDetailTabBodyProps`/`TripDetailTabBody`, needs the new prop added and forwarded.
- [Source: src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx:35,131,204] — the receiving end, already correct, already tested; do not modify.
- [Source: src/app/(app)/profile/preferences-section.tsx:54-55] — where the profile-page symptom of the root-cause bug is visible.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
