---
baseline_commit: a01ed7b6cf604e97f80af52f43da143d991d1cfe
---

# Story 7.2: Resolve Per-Hop Mode From Actual Route Distance

Status: review

## Story

As a traveler,
I want each itinerary hop to choose walk or my trip’s default transit mode from its actual route distance,
so that route estimates and schedule-conflict flags match realistic travel.

## Context

Story 6.1 made `walkThresholdMeters` live end-to-end. Both daily route summaries and schedule-conflict calculations still choose a mode from haversine distance, which can differ substantially from the provider’s routable road/path distance. This story replaces that proxy decision without changing the threshold setting, route action API, UI, cache contract, or existing mode resolver.

## Acceptance Criteria

1. **Actual route distance controls a near-threshold hop**
   - Given a hop’s straight-line distance is below `walkThresholdMeters`, when its default-mode route returns a distance that resolves to a different effective mode, then fetch the hop again using `"walk"` and use that second route’s distance and duration.
   - Apply this to both `getDayRouteSummary` and `getDayScheduleConflicts`.
2. **No unnecessary refetch**
   - Given a first route whose actual `distanceMeters` keeps the trip default mode, only one default-mode request occurs.
   - Given `straightLineDistance >= walkThresholdMeters`, only one default-mode request occurs; do not evaluate mode selection from the first route. Road/path distance cannot be shorter than its straight-line lower bound.
   - When the default mode is already `"walk"`, never issue a duplicate walk request.
3. **Unavailable first routes preserve existing behavior**
   - If the first route is unavailable, skip that hop exactly as today: summary aggregation continues with other hops and conflict detection returns no conflict for that hop.
   - Do not throw and do not attempt a walk refetch after an unavailable first route.
4. **Existing contracts remain intact**
   - `resolveEffectiveMode` remains unchanged, including its invalid-distance guards and direct tests.
   - Preserve route-result shapes, route-cache behavior, sorting, freeform-event exclusion, explicit coordinate null checks, sequential hop processing, the 600-second conflict buffer, and conflict ordering/index semantics.

## Tasks / Subtasks

- [x] Extend `src/lib/route.test.ts` before production code. (AC: 1–4)
  - [x] Cover route summary: first default-mode response below threshold triggers a walk refetch; assert call order, modes, and final aggregated route data.
  - [x] Cover schedule conflicts with equivalent two-phase behavior; classification must use the final walk route duration.
  - [x] Cover actual route distance at/over threshold: one default-mode fetch and no walk refetch.
  - [x] Cover the straight-line-at/over-threshold lower-bound gate: one default-mode fetch even if a mocked default route would otherwise appear walkable.
  - [x] Cover unavailable first routes for summary and conflicts: no crash, no walk request, existing skip/empty result behavior.
  - [x] Keep all `resolveEffectiveMode`, availability, ordering, cache-quantization, and 600-second boundary tests green.
- [x] Update `src/lib/route.ts` only after the test expansion. (AC: 1–4)
  - [x] Retain `getStraightLineDistanceMeters` only as the cheap lower-bound gate.
  - [x] For each eligible hop, fetch `getRouteDistanceTime(origin, destination, tripTransitMode)` first.
  - [x] On an unavailable first result, continue using today’s skip path.
  - [x] Only when a threshold exists and straight-line distance is strictly `<` that threshold, call `resolveEffectiveMode(firstRoute.distanceMeters, tripTransitMode, walkThresholdMeters)`.
  - [x] If that effective mode differs from `tripTransitMode`, fetch the same hop with it (only possible `"walk"` here); use the second result when available and otherwise preserve the existing per-hop skip behavior.
  - [x] Use the selected final route for totals and conflict classification; never use haversine distance or the first route’s duration after a successful walk refetch.
- [x] Verify focused behavior, then run project validation. (AC: 1–4)
  - [x] Run the colocated `route.test.ts` suite first.
  - [x] Run `packt-build-validator` once after implementation; `src/lib/**` is shared runtime, so its affected-E2E gate runs the full E2E suite.

## Dev Notes

### Current code and required change

- `src/lib/route.ts` currently selects a mode from haversine distance before one provider lookup in both `getDayRouteSummary` and `getDayScheduleConflicts`.
- Replace each decision with a two-phase lookup. The initial default-mode response provides authoritative `distanceMeters`; use that value only inside the guarded threshold branch to resolve the effective mode.
- Keep the existing sequential loops. Story 7.3 owns parallelization and in-process deduplication; do not combine it with this correctness change.
- `src/app/(app)/trips/[tripId]/route-actions.ts` already authenticates, authorizes, validates supplied events against stored trip events, and delegates to `route.ts`. Its API and tests do not change.
- Global threshold plumbing is already complete: server page → client page → tab body → itinerary/day card → route action. Do not add props, types, schema changes, migrations, or UI controls.

### Implementation guardrails

- The strict threshold comparison is intentional: at the threshold, retain the trip default mode. Do not change `resolveEffectiveMode` or duplicate its logic.
- Haversine is a lower-bound optimization, not a transit-mode decision input. Its only permitted use here is proving that a route cannot be below the threshold when `straightLineDistance >= threshold`.
- Use `firstRoute.distanceMeters`, not duration, cache key data, or a new geometry calculation, to decide whether a refetch is needed.
- A failed/unavailable walk refetch follows existing per-hop unavailable behavior; do not silently fall back to the default-mode route because it no longer represents the resolved effective mode.
- Preserve explicit `null`/`undefined` coordinate checks so zero latitude/longitude remains valid.
- Do not modify `getRouteDistanceTime`, provider request profile construction, 24-hour cache access, cache quantization, route actions, UI components, domain types, or E2E files.

### Provider and library requirements

- Reuse the existing Mapbox Directions integration. No package upgrade or API migration belongs in this story.
- Mapbox Directions API v5 returns route `distance` in metres and `duration` in seconds; existing `RouteResult.distanceMeters`/`durationSeconds` conversion remains the boundary contract. The provider supports a walking profile, matching the existing `"walk"` transit mode. [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/)

### Testing requirements

- Required test file: `src/lib/route.test.ts`; no new test file.
- No new E2E scenario: this is routing-domain behavior covered at unit level, avoiding duplicated coverage. Final project validation still exercises full affected E2E because `src/lib/**` is mapped as shared runtime.
- Mock provider results so assertions prove both request modes and that aggregation/conflict duration comes from the final route, not merely that two calls occurred.

### Project Structure Notes

- Production change: `src/lib/route.ts`.
- Colocated test change: `src/lib/route.test.ts`.
- No new files. Keep exports and action signatures stable to avoid broad changes.

### Previous Story Intelligence

- Story 7.1 kept a narrow correction scoped to `createTrip` actions and colocated tests, while its final validation completed successfully. Maintain the same focused scope.
- Recent routing work established `resolveEffectiveMode` invalid-distance guards and quantized route-cache behavior. Preserve both rather than adding a parallel mode resolver or cache path.

### Git Intelligence

- Earlier commits introduced the route summary, copied its semantics to conflict detection, hardened mode resolution and cache quantization, then wired the threshold end-to-end. This story must update the two consumers together so summary and conflict decisions cannot diverge.
- Recent merge/revert commits only restore planning artifacts; they do not change runtime routing behavior.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7, Story 7.2]
- [Source: _bmad-output/implementation-artifacts/deferred-work-plan.md#Story B — Resolve per-hop mode from actual route distance]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Deferred from code review of 4-1]
- [Source: _bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/prd.md#4.3 FR-8; #4.4 FR-10 and FR-12]
- [Source: _bmad-output/planning-artifacts/architecture.md#Routing and testing sections]
- [Source: src/lib/route.ts#getStraightLineDistanceMeters, getDayRouteSummary, getDayScheduleConflicts]
- [Source: _bmad-output/implementation-artifacts/7-1-close-createtrip-preference-toctou.md#Completion Notes List]
- [Source: _bmad-output/project-context.md#Testing, Server Actions, and Technology Stack]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `npx vitest run src/lib/route.test.ts` — red phase: 4 tests failed against unmodified `route.ts` (exactly the two-phase-refetch cases); green phase after implementation: 49/49 passed.
- `npm run test:e2e:affected` failed with a Windows-only `cmd.exe`/`npx.cmd` bug that mangles the `|`-joined multi-tag `--grep` string (unrelated to this change — see `[[project_e2e_windows_multi_tag_grep_bug]]` memory). Verified equivalent coverage by running each affected tag individually: `@feat:day-route-strip` (3 passed), `@feat:linked-events` (9 passed), `@feat:schedule-conflict` (5 passed) — 17/17 passed, zero regressions.

### Completion Notes List

- Added `resolveHopRoute()` in `src/lib/route.ts`: fetches the default-mode route first, and only when a threshold exists and straight-line distance is strictly below it, resolves the effective mode from the first route's actual `distanceMeters` and refetches with `"walk"` if that mode differs. Both `getDayRouteSummary` and `getDayScheduleConflicts` now call this shared helper instead of resolving mode from haversine distance before a single fetch.
- `resolveEffectiveMode`, `getRouteDistanceTime`, route-cache behavior, and all existing consumer contracts are unchanged.
- Extended `src/lib/route.test.ts` with two new describe blocks (one per consumer) covering: walk refetch on a near-threshold hop with a resolved-different-mode first route, no refetch when the first route keeps the default mode, the straight-line at/over-threshold lower-bound gate, no duplicate walk request when the default mode is already walk, and unavailable-first-route skip behavior. All pre-existing tests remain green unmodified.
- Full `packt-build-validator` gate: lint PASS, tsc PASS, coverage PASS (lines 96.29%, functions 96.57%, branches 90.43%; `route.ts` itself 100/98.11/100/100), build PASS, E2E PASS (verified per-tag per the debug log note above).

### File List

- `src/lib/route.ts` (update)
- `src/lib/route.test.ts` (update)

## Change Log

- Replaced haversine-only mode selection with a two-phase resolver that uses the default-mode route's actual distance (only within the existing threshold guard) before optionally refetching with `"walk"`, applied identically to `getDayRouteSummary` and `getDayScheduleConflicts`.
