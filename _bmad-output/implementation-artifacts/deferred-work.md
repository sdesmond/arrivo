# Deferred Work

## Deferred from: code review of 1-1-set-global-transit-mode-preference-and-walk-distance-threshold (2026-07-13)

- `route_cache` composite primary key uses four raw float (`doublePrecision`) columns with no rounding/quantization [src/db/schema.ts:711-728] — logically-identical coordinates differing by float epsilon will miss the cache or create duplicate rows. Pre-existing to this story's spec-mandated schema; a quantization strategy belongs with Story 2.1's cache-write path.
- `resolveEffectiveMode` has no guard against NaN/negative `hopDistanceMeters` [src/lib/route.ts:6-9] — not actionable yet since no caller exists in this diff; Story 2.1 will supply real hop distances from the Directions API.

## Deferred from: code review of 1-2-seed-trip-transit-default-automatically (2026-07-13)

- TOCTOU: transitMode resolved from a snapshot taken before the insert transaction [src/app/(app)/trips/actions.ts:210-253] — if the user updates their global transit preference between the initial `select` and the transaction commit, the new trip silently uses the stale value. Same pattern already exists for `budgetCurrency` resolution in this function; not introduced uniquely by this change.

## Deferred from: code review of 3-2-resize-action-bar-chips-to-meet-interactive-sizing-minimum (2026-07-15)

- jsdom class-string assertions don't measure real rendered geometry [src/components/packt/place-row-action-bar.test.tsx] — all new 44px-minimum assertions check for the literal `h-11` substring in `className`, not computed layout. Pre-existing testing pattern already used throughout this test file (prior `toHaveStyle`/`toMatch` checks); not introduced by this diff.

## Deferred from: story planning of 4-1-show-day-route-strip-for-days-with-2-plus-located-items (2026-07-15)

- Dead code removal: `mini-map-rail.tsx` + `mini-map-rail.test.tsx` + `rail-panel.tsx` + `rail-panel.test.tsx` confirmed dead by epics.md addendum. `rail-panel.tsx` is in `SHARED_GLOBS` in `feature-map.mjs` line 217 — remove glob entry when deleting. Safe to remove all four files in a separate chore task.

## Deferred from: code review of 4-1-show-day-route-strip-for-days-with-2-plus-located-items (2026-07-15)

- `walkThresholdMeters` is threaded through every component layer but never supplied a real value [src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx] — it isn't even a field on the `Trip` type (only on `UserProfile`), and no file in the codebase currently reads `userProfile.walkThresholdMeters` into any route calculation. Not a regression from this story; `resolveEffectiveMode`'s walk-distance override is a permanent no-op until a future story threads the user's preference into the trip detail payload.
- `getDayRouteSummary` server action accepts client-supplied `events` without validating them against the trip's stored events [src/app/(app)/trips/[tripId]/route-actions.ts] — mirrors the exact pre-existing pattern in the sibling `getRouteDistanceTime` action in the same file; not introduced by this diff.
- `getDayRouteSummary` awaits hops sequentially with no cap or `AbortController` [src/lib/route.ts] — a day with many located items serializes N-1 round trips. Low real-world impact given typical day sizes and `route_cache` bounding repeat cost.
- New `getStraightLineDistanceMeters` haversine helper estimates hop distance before the real route is known, to pick a per-hop transit mode [src/lib/route.ts] — reasonable proxy, but can misassign mode when road distance diverges from straight-line distance. Currently moot since `walkThresholdMeters` is always undefined (see above); revisit once that's wired.
- Inconsistent null-check style in the same file — located-item filtering uses `!= null`, the strip's render gate uses plain truthy `&&` [src/components/packt/day-card-body.tsx]. Cosmetic; no functional difference given current prop types.
- The route-summary `useEffect`'s dependency array includes both the derived `routeSummaryKey` string and the `locatedEvents` array reference [src/components/packt/day-card-body.tsx:643] — a parent re-render producing a new but content-identical `day.events` reference re-fires the fetch even though nothing meaningful changed. No visible symptom, just a wasted background request.
