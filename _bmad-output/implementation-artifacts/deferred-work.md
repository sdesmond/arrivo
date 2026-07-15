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
