# Deferred Work

## Deferred from: code review of 1-1-set-global-transit-mode-preference-and-walk-distance-threshold (2026-07-13)

- `route_cache` composite primary key uses four raw float (`doublePrecision`) columns with no rounding/quantization [src/db/schema.ts:711-728] — logically-identical coordinates differing by float epsilon will miss the cache or create duplicate rows. Pre-existing to this story's spec-mandated schema; a quantization strategy belongs with Story 2.1's cache-write path.
- `resolveEffectiveMode` has no guard against NaN/negative `hopDistanceMeters` [src/lib/route.ts:6-9] — not actionable yet since no caller exists in this diff; Story 2.1 will supply real hop distances from the Directions API.
