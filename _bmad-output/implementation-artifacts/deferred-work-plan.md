# Plan: Close remaining deferred-work items

Status: draft
Created: 2026-08-03
Source: `_bmad-output/implementation-artifacts/deferred-work.md` (open items)

## Context

The Location-Aware Itinerary sprint (Epics 1–6) is at 15/16 stories done; only Story 6.3
(badge overflow guard) is still in `review`. `deferred-work.md` carries six open items logged
during Epics 1–6 code reviews. This plan addresses the five that are runtime-correctness or
test-hardening; the sixth (line-count refactor) is explicitly out of scope.

One item became materially more urgent since it was logged: the haversine mode-proxy (deferred
from Story 4.1) was harmless while `walkThresholdMeters` was never wired, but Story 6.1 made it
live (`day-card-body.tsx` → `getDayRouteSummary`/`getDayScheduleConflicts` → `route.ts`), so it
can now pick the wrong transit mode for a real user.

## Scope

### In scope

| # | Story | Source deferred item | Why necessary |
|---|-------|----------------------|---------------|
| A | Close the `createTrip` preference TOCTOU | 1-2 | Data correctness: new trip can persist stale global prefs |
| B | Resolve per-hop mode from actual route distance | 4-1 (haversine) | Now live via 6.1; wrong mode → wrong estimate/conflict flag |
| C | Parallelize day hops with in-process dedup | 4-1 (serial hops) | Perf/reliability on many-stop days; duplicate Directions calls |
| D | Stabilize DayCardBody route-summary effect + unify null-checks | 4-1 (effect deps, null-checks) | Wasted refetch on content-identical re-render; latent falsy-0 bug |
| E | Measured 44px interactive sizing for `PlaceRowActionBar` | 3-2 (jsdom assertions) | WCAG 2.5.8 guarantee rests on class substrings, not geometry |

### Out of scope (stays in `deferred-work.md`)

- **Line-count refactor** of `page-client.tsx` (~329 lines) and `trip-detail-tab-body.tsx`
  (~278 lines) against the ~250-line guideline. Architectural split with no functional gain;
  both files are deliberate dispatchers. Revisit as its own effort.

---

## Story A — Close the `createTrip` preference TOCTOU

**Problem.** `src/app/(app)/trips/actions.ts:222-231` selects the user (including
`transitMode`, `currency`) before the insert transaction opens at line 252; the insert at
lines 247-266 persists those snapshotted values. If the user updates their global preferences
between the select and the commit, the new trip silently uses stale values. Pre-existing for
`budgetCurrency`; `transitMode` (lines 248-249) introduced by this feature — fix both.

**Approach.**
- Move the preference source inside `db.transaction`: re-read `transitMode` + `currency` from
  the users table within the transaction callback, and resolve `budgetCurrency` +
  `transitMode` from the in-transaction read. Keep `requireUser()`, `headers()` /
  `detectPreferredCurrency` (not DB-dependent) where they are.
- Result: the values persisted are committed in the same snapshot as the insert — the TOCTOU
  window for these two columns closes.

**Tests** (`src/app/(app)/trips/actions.test.ts`, colocated):
- Update the existing `createTrip` seeding tests to exercise the in-transaction read (mocked
  `db.transaction` returns the fresh pref).
- Add a regression test: user pref row returned by the in-tx select differs from the
  pre-transaction value → trip is created with the in-tx value.
- Existing assertions on `transitMode` seeding (`input ?? user ?? "drive"`) must stay green.

**Files:** `src/app/(app)/trips/actions.ts`, `src/app/(app)/trips/actions.test.ts`.

**E2E impact:** `actions.ts` is a `SHARED_GLOB` → affected-E2E runs the **full** suite for this
story.

---

## Story B — Resolve per-hop mode from actual route distance

**Problem.** `src/lib/route.ts:180-184` (`getDayRouteSummary`) and `226-230`
(`getDayScheduleConflicts`) feed `resolveEffectiveMode` with haversine straight-line distance
(`getStraightLineDistanceMeters`, lines 142-152). When road distance diverges from
straight-line (winding roads, ferries, restricted access), a hop near the threshold gets the
wrong mode → wrong duration, wrong walk/drive decision, wrong Schedule Conflict classification.
Live since Story 6.1.

**Approach.** Two-phase per hop, keeping `resolveEffectiveMode` as the single decision point:
1. Fetch the route with the trip's default mode.
2. If `walkThresholdMeters` is set **and** the resolved mode from the *actual*
   `distanceMeters` differs from the fetched mode → refetch with `"walk"`.

Bound that skips the threshold branch cheaply: road distance ≥ haversine distance, so when
`straightLine >= walkThresholdMeters`, the actual distance also ≥ threshold — no refetch
possible; only evaluate the branch when `straightLine < walkThresholdMeters`. The haversine
survives as a pre-check/bound only; it no longer decides the mode.

**Tests** (`src/lib/route.test.ts`, colocated):
- Hop under threshold: first call with trip default mode, then a second call with `"walk"`
  (assert both fetch calls and their modes).
- Hop over threshold: single call with the default mode, no walk refetch.
- `straightLine >= threshold`: no threshold branch evaluated at all.
- Unavailable first route: falls through as today (no crash, per-hop skip).
- Existing `resolveEffectiveMode` tests unchanged (function untouched).

**Files:** `src/lib/route.ts`, `src/lib/route.test.ts`.

**E2E impact:** `src/lib/**` is a `SHARED_GLOB` → **full** suite.

---

## Story C — Parallelize day hops with in-process dedup

**Problem.** `getDayRouteSummary` (lines 175-190) and `getDayScheduleConflicts` (221-246) await
each hop sequentially — N−1 serialized Directions round trips on a many-stop day. Separately,
Day Route Strip + Schedule Conflict on the same page can issue the *same* hop lookup
concurrently, producing duplicate Directions calls.

**Approach.**
- Replace the sequential loops with per-hop promise creation + `Promise.allSettled`, mapping
  results back by index so per-hop `unavailable` failures keep today's `continue` semantics and
  `hopCount === 0 → { status: "unavailable" }` is preserved. Conflict array order stays
  event-ordered (index-mapped).
- Add a module-level in-flight map in `route.ts` keyed by quantized
  `(origin.lat/lng, destination.lat/lng, transitMode)` → `Promise<RouteResult>`.
  `getRouteDistanceTime` returns the shared in-flight promise when present and deletes it on
  settle. React `cache()` is **not** viable here: each server-action invocation is its own
  request scope, so it would not dedupe across `getDayRouteSummary` and
  `getDayScheduleConflicts`. Process-local scope is acceptable (bounded in serverless; dev/E2E
  are single-process).
- Keep `quantizeCoord` (6-1) as the map key normalizer so cache-hit logic and dedup keys agree.

**Tests** (`src/lib/route.test.ts`):
- Concurrency: two-hop day with deferred mocked promises → both hops started before either
  resolves.
- Per-hop failure isolation: one hop unavailable, other ready → day result aggregates the ready
  hop; `hopCount === 0` → `unavailable`.
- Dedup: two concurrent `getRouteDistanceTime` calls for the same quantized hop share one
  underlying fetch (spy on the Directions call count).
- Existing summary/conflict tests stay green (same results, order preserved).

**Files:** `src/lib/route.ts`, `src/lib/route.test.ts`.

**E2E impact:** `src/lib/**` is a `SHARED_GLOB` → **full** suite.

---

## Story D — Stabilize DayCardBody route-summary effect + unify null-checks

**Problem.** `src/components/packt/day-card-body.tsx:169` — the effect's dependency array
includes both `locatedEvents` (array reference) and `routeSummaryKey`. A parent re-render
producing a new-but-content-identical `day.events` array re-fires the fetch for no benefit.
Separately, located-event filtering uses `!= null` (line 80) while `route.ts` uses explicit
null checks and the render gate uses truthiness — a latent bug class: `locationLat: 0` /
`locationLng: 0` (valid coordinates at the prime meridian/equator) are falsy under a truthy
gate.

**Approach.**
- **Split step (required — `day-card-body.tsx` is 285 lines, already over the ~250 guideline and
  being modified):** extract the route-summary fetching + state into a colocated
  `src/components/packt/use-day-route-summary.ts` hook (mirrors the existing
  `use-schedule-conflicts.ts` / `use-day-draft.ts` pattern), shrinking `day-card-body.tsx` and
  making the effect logic directly testable. The hook owns the stable key, the fetch, and the
  loading/ready/unavailable state; `day-card-body.tsx` renders from it.
- Compute the stable content key directly from `day.events` (`tripId|mode|threshold|id:lat:lng:position`),
  and memoize `locatedEvents` on that key. The effect depends on the stable key — never the raw
  array ref — so content-identical updates don't refetch while real coordinate/position changes do.
- Unify located-item null checks to the explicit `!== null && !== undefined` convention used in
  `route.ts`, in `day-card-body.tsx` and any truthy render gate (strip gate at line 232).

**Tests** (`src/components/packt/day-card-body.test.tsx`, existing 580-line file — extend, don't
split; hook branches are exercised through the component render):
- Re-render with content-identical `day.events` → `getDayRouteSummary` not called again (spy on
  the server action import, count calls).
- A coordinate or position change → refetch fires.
- `locationLat`/`locationLng` of `0` treated as located (regression for the falsy-gate bug).

**Files:** `src/components/packt/use-day-route-summary.ts` [NEW] + colocated test if it has
standalone logic not covered via `day-card-body.test.tsx`; `day-card-body.tsx`,
`day-card-body.test.tsx`; `day-route-strip.tsx` **and `day-route-strip.test.tsx`** only if its
render gate has truthy checks (then both source and test change together).

**E2E impact:** `day-card-body.tsx` maps to `@feat:day-route-strip`, `@feat:map-tab`,
`@feat:schedule-conflict` — those features, not full.

---

## Story E — Measured 44px interactive sizing for `PlaceRowActionBar`

**Problem.** `src/components/packt/place-row-action-bar.test.tsx:70,76,344-345` assert the
literal `h-11`/`size-11` substrings in `className`. jsdom cannot compute layout, so the WCAG
2.5.8 / project 44×44px guarantee is not actually verified. Story 6.3 established the
real-browser measurement standard for exactly this kind of sizing claim.

**Approach.**
- Add a Playwright E2E scenario asserting real rendered geometry via `getBoundingClientRect`
  for every action-bar chip (Time, Cost, Docs, Attach) and both filled-Address `ButtonGroup`
  segments: `height >= 44 && width >= 44` at a 375px viewport.
- Home: `tests/e2e/features/day-planning.feature` (already covers `place-row*.tsx` via its
  `@feat:day-planning` map entry — **no feature-map change needed**). Use scenario-owned
  fixture creation (a trip day with a located event carrying a time, expense, and doc) per the
  project's Object-Mother / scenario-fixture rule.
- Keep the existing jsdom class-string tests as cheap regression guards, but rename/annotate
  them as contract guards (they assert the `h-11`/`size-11` *class contract*, not geometry) so
  they're not mistaken for measured verification.

**Tests:** `tests/e2e/features/day-planning.feature` + matching step definitions
(`tests/e2e/steps/`). Assert `>= 44` (minimum), not exact pixels, to avoid font/rendering
flakiness.

**E2E impact:** `@feat:day-planning`.

---

## Sequencing & bundling

1. **A** — smallest, independent, correctness.
2. **B** then **C** — both edit `route.ts`; do sequentially, ideally in one PR each to keep
   reviewable, but land B before C so the two-phase mode logic isn't interleaved with
   parallelization.
3. **D** — independent of route.ts behavior (client-side effect).
4. **E** — independent, E2E-only, can land any time.

Each story is a separate branch + PR. `route.ts`-touching stories (B, C) and `actions.ts` (A)
trigger the full E2E suite via affected-E2E — the validator's final gate will run it; do not
skip it.

## Test strategy summary

- Every story ships colocated unit/component test edits in the same change (project rule).
- E2E: A/B/C run full (shared globs); D runs its three mapped features; E runs day-planning.
- Coverage thresholds (95% lines/functions, 90% branches) enforced as backstops; `route.ts`
  already has strong coverage — B/C must keep it, adding the new branches.

## Risks & open questions

- **B refetch cost:** the walk-refetch doubles Directions calls only when the threshold branch
  applies; bounded by `route_cache` (24h TTL). The rejected alternative — documenting the
  straight-line divergence as an accepted risk — is no longer viable now the threshold is live.
- **C dedup scope:** in-flight map is process-local. In a serverless deployment, cross-instance
  duplicates remain possible; acceptable and bounded. Note it in the story's dev notes.
- **D stale closure:** removing `locatedEvents` from the effect deps risks stale reads if the
  fetch arguments aren't all derived from the stable key — the "content change refetches" test
  guards this.
- **E flakiness:** geometry assertions can vary with font rendering; assert `>= 44` minimums
  only.

## Follow-up after this plan

1. Convert stories A–E into `epics.md` Epic 7 (or separate) story files via `bmad-create-story`
   when dev is to begin — this document is the planning input, not the story files.
2. Strike through the resolved items in `deferred-work.md` as each lands (same pattern as the
   existing `~~RESOLVED~~` entries).
