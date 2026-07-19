# Deferred Work

## Deferred from: code review of 1-1-set-global-transit-mode-preference-and-walk-distance-threshold (2026-07-13)

- ~~`route_cache` composite primary key uses four raw float (`doublePrecision`) columns with no rounding/quantization~~ — **RESOLVED 2026-07-18**: added `quantizeCoord` (6 decimal places) applied to origin/destination coordinates on both the cache lookup and insert in `lookupRouteDistanceTime` [src/lib/route.ts]. Tests in `src/lib/route.test.ts` cover the rounding and the insert-path quantization.
- ~~`resolveEffectiveMode` has no guard against NaN/negative `hopDistanceMeters`~~ — **RESOLVED 2026-07-18**: now requires `Number.isFinite(hopDistanceMeters) && hopDistanceMeters >= 0` before treating a hop as walkable [src/lib/route.ts]. Both real callers (`getDayRouteSummary`, `getDayScheduleConflicts` via the haversine helper) can't currently produce an invalid value, but the guard is now in place at the boundary. Tests added to `src/lib/route.test.ts`.

## Deferred from: code review of 1-2-seed-trip-transit-default-automatically (2026-07-13)

- TOCTOU: transitMode resolved from a snapshot taken before the insert transaction [src/app/(app)/trips/actions.ts:210-253] — if the user updates their global transit preference between the initial `select` and the transaction commit, the new trip silently uses the stale value. Same pattern already exists for `budgetCurrency` resolution in this function; not introduced uniquely by this change.

## Deferred from: code review of 3-2-resize-action-bar-chips-to-meet-interactive-sizing-minimum (2026-07-15)

- jsdom class-string assertions don't measure real rendered geometry [src/components/packt/place-row-action-bar.test.tsx] — all new 44px-minimum assertions check for the literal `h-11` substring in `className`, not computed layout. Pre-existing testing pattern already used throughout this test file (prior `toHaveStyle`/`toMatch` checks); not introduced by this diff.

## Deferred from: story planning of 4-1-show-day-route-strip-for-days-with-2-plus-located-items (2026-07-15)

- ~~Dead code removal: `mini-map-rail.tsx` + `mini-map-rail.test.tsx` + `rail-panel.tsx` + `rail-panel.test.tsx` confirmed dead~~ — **PARTIALLY RESOLVED 2026-07-18**: `rail-panel.tsx` is no longer dead — by the time this was picked up, `collaborators-rail.tsx`, `docs-rail.tsx`, and `packing-rail.tsx` all import `RailPanel` from it, so it and its test stay. Only `mini-map-rail.tsx` + `mini-map-rail.test.tsx` were actually unused (just re-exported from the `trip-rail.tsx` barrel, never imported elsewhere); both deleted, the re-export line removed from `trip-rail.tsx`, and the stale `mini-map-rail.tsx` glob entry removed from `tests/e2e/feature-map.mjs`.

## Deferred from: code review of 4-1-show-day-route-strip-for-days-with-2-plus-located-items (2026-07-15)

- ~~`walkThresholdMeters` is threaded through every component layer but never supplied a real value~~ — **RESOLVED 2026-07-19** by story 6-1-wire-walk-threshold-meters-end-to-end: root cause was `getUserById()` never selecting `transitMode`/`walkThresholdMeters` from the DB [src/lib/queries.ts]; fixed there, then threaded `walkThresholdMeters` through `page.tsx` → `page-client.tsx` → `trip-detail-tab-body.tsx` → the already-correct `TripItineraryView` chain.
- `getDayRouteSummary` server action accepts client-supplied `events` without validating them against the trip's stored events [src/app/(app)/trips/[tripId]/route-actions.ts] — mirrors the exact pre-existing pattern in the sibling `getRouteDistanceTime` action in the same file; not introduced by this diff.
- `getDayRouteSummary` awaits hops sequentially with no cap or `AbortController` [src/lib/route.ts] — a day with many located items serializes N-1 round trips. Low real-world impact given typical day sizes and `route_cache` bounding repeat cost.
- New `getStraightLineDistanceMeters` haversine helper estimates hop distance before the real route is known, to pick a per-hop transit mode [src/lib/route.ts] — reasonable proxy, but can misassign mode when road distance diverges from straight-line distance. Currently moot since `walkThresholdMeters` is always undefined (see above); revisit once that's wired.
- Inconsistent null-check style in the same file — located-item filtering uses `!= null`, the strip's render gate uses plain truthy `&&` [src/components/packt/day-card-body.tsx]. Cosmetic; no functional difference given current prop types.
- The route-summary `useEffect`'s dependency array includes both the derived `routeSummaryKey` string and the `locatedEvents` array reference [src/components/packt/day-card-body.tsx:643] — a parent re-render producing a new but content-identical `day.events` reference re-fires the fetch even though nothing meaningful changed. No visible symptom, just a wasted background request.
## Deferred from: code review of 4-2-detect-and-surface-schedule-conflicts (2026-07-16)

- Validate client-supplied event coordinates against the stored trip before resolving route data. `getDayScheduleConflicts` continues the existing route-summary server-action pattern: it validates trip access but not that supplied events belong to that trip.

## Deferred from: code review of spec-4-2-conflict-badge-in-route-strip (2026-07-16)

- ~~`useFocusScroll`'s effects are keyed only on the `focus` URL param string~~ — **RESOLVED 2026-07-16**, not deferred: `highlightedFocusId`/`dismissedFocusId` now reset (via the adjust-state-during-render pattern) whenever `focusId` changes, even to a previously-seen value. Fixed at the shared-hook level [src/lib/use-focus-scroll.ts], so every consumer benefits (`expense-table.tsx`, `mobile-active-tab.tsx`, `now-card-event-row.tsx`, and the new day-level Schedule Conflict button), not just this story's click path. `day-card-body.tsx`'s `handleConflictClick` additionally clears-then-resets the `focus` param on a same-target repeat click so the URL itself transitions (required for the hook's effects to re-run at all). Regression test added at `src/lib/use-focus-scroll.test.ts`.
- Schedule Conflict badge has no overflow guard for very long counts on narrow viewports [src/components/packt/schedule-conflict-badge.tsx] — a `maxWidth`+`truncate` guard was tried and reverted after live testing showed it clipped the ordinary "2 tight connections today" case (natural width ~187px, capped at 180px). A correct fix needs real viewport-width testing (not a guessed pixel budget) to find a threshold that only kicks in for genuinely pathological counts; deferred rather than re-guessing.
- ~~Mobile-width (≤390px) visual verification of the `page-client.tsx` `min-h-full`→`h-full` layout fix was not completed~~ — **RESOLVED 2026-07-18**: verified via Playwright at 375×812 across all 7 trip-detail tabs (Reservations, Itinerary, Budget, Map, Documents, Packing, Notes). No clipping, and `document.documentElement.scrollHeight` matches `window.innerHeight` with exactly one `overflow-y-auto` container in the DOM — confirms the single-scroll-container fix holds at mobile width. No regression found, no code change needed.

## Deferred from: story planning of 6-1-wire-walk-threshold-meters-end-to-end (2026-07-19)

- `page-client.tsx` (329 lines) and `trip-detail-tab-body.tsx` (278 lines) already exceed the project's ~250-line component guideline, entirely pre-existing this story — this story's plumbing change added one prop declaration + one JSX attribute to each, not new bulk. Splitting either is a real architectural change (`trip-detail-tab-body.tsx`'s size comes from being a deliberate 7-tab dispatcher; `page-client.tsx`'s from a large orchestration prop-list to that dispatcher) unrelated to this story's narrow plumbing purpose; tracked here as future work, not addressed in this story.
