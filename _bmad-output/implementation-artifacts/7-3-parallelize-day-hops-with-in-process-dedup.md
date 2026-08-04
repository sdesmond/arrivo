---
baseline_commit: eebad0823d3f2661f1c437700a8f4eebf1735572
---

# Story 7.3: Parallelize Day Hops With In-Process Dedup

Status: review

## Story

As a traveler with a many-stop day,
I want route lookups for each hop to run concurrently without duplicate identical requests,
so that Day Route Strip and Schedule Conflict results arrive promptly without wasting Directions API calls.

## Acceptance Criteria

1. **Concurrent day-hop calculation**
   - Given a day with N located stops (N-1 hops), when `getDayRouteSummary` or `getDayScheduleConflicts` computes hop routes, all hops are started before any individual hop is awaited.
   - Per-hop unavailable results remain isolated: one unavailable hop must not prevent ready hops from contributing.
   - Summary aggregation and conflict output remain ordered by the sorted event positions, regardless of promise completion order.
2. **Existing unavailable contract**
   - Given no summary hop resolves ready, `getDayRouteSummary` still returns `{ status: "unavailable" }`.
   - Schedule-conflict calculation still returns no entry for an unavailable hop and returns `[]` when none qualify.
3. **Process-local in-flight deduplication**
   - Given concurrent same-process requests for a hop with the same origin, destination, and transit mode, the callers share one in-flight `RouteResult` promise and create one underlying Directions request.
   - Deduplication keys use the existing six-decimal `quantizeCoord` normalization for every coordinate plus the transit mode, so epsilon-different coordinates that map to the same persistent cache key also deduplicate.
   - The in-flight entry is removed when its request settles; retain the identity-safe cleanup guard so a newer request cannot delete another request's entry.
4. **No behavioral regression**
   - Preserve `resolveHopRoute`'s Story 7.2 two-phase default-mode/walk-refetch behavior, `resolveEffectiveMode` semantics, explicit coordinate null checks (including valid zero coordinates), position sorting, Freeform exclusion, 24-hour persistent cache behavior, 3-second failure fallback, `RouteResult` shapes, and the 600-second Schedule Conflict buffer.
   - Do not change server-action signatures or authorization/ownership validation, UI behavior, domain types, schema, provider profiles, or dependencies.

## Tasks / Subtasks

- [x] Expand `src/lib/route.test.ts` before production code. (AC: 1-4)
  - [x] Add a deferred-promise, three-stop route-summary test proving both hops start before either resolves; settle them out of order and assert the aggregate totals remain correct.
  - [x] Add summary failure-isolation coverage: one unavailable plus one ready hop aggregates the ready hop; all unavailable hops return `{ status: "unavailable" }`.
  - [x] Add an equivalent schedule-conflict concurrency test proving both hops start before settlement and conflicts remain event-index ordered when routes resolve out of order; preserve skip behavior for unavailable hops.
  - [x] Extend in-flight dedup coverage with two concurrent epsilon-different requests that quantize to the same origin/destination key; assert one underlying `fetch` and equivalent results.
  - [x] Keep and run existing Story 7.2 two-phase mode-resolution, cache-quantization, summary ordering, conflict-buffer, Freeform-exclusion, and unavailable-route tests.
- [x] Update `src/lib/route.ts` after expanded tests fail. (AC: 1-4)
  - [x] Keep the already 256-line module at or below the ~250-line guideline as part of this edit: consolidate the duplicated outer-hop iteration into one cohesive private, route-domain helper only if needed to do so. Keep cache/provider lookup and orchestration in this existing file; do not create a new module or broaden the change.
  - [x] Replace only the sequential outer hop loops in `getDayRouteSummary` and `getDayScheduleConflicts` with indexed concurrent work and settled-result processing. Do not parallelize or alter the ordered steps inside one `resolveHopRoute` call.
  - [x] Process settled results by original hop index so totals and `ScheduleConflict.eventIndex` semantics remain stable; treat rejected or unavailable work as the current skip path.
  - [x] Build the existing module-level in-flight-map key from `quantizeCoord(origin.lat/lng)` and `quantizeCoord(destination.lat/lng)` plus `transitMode`; retain shared-promise return and identity-safe `finally` cleanup.
  - [x] Keep the dedup map process-local. Do not add React `cache()`, cross-instance coordination, a schema cache, or a new abstraction.
- [x] Verify focused behavior, then project validation. (AC: 1-4)
  - [x] Run `npx vitest run src/lib/route.test.ts` before broad validation.
  - [x] Run `packt-build-validator` once after targeted tests pass. `src/lib/**` is shared runtime, so its affected-E2E stage exercises the full mapped suite; do not add duplicate E2E coverage for this domain-only change.

## Dev Notes

### Current code and required change

- `src/lib/route.ts` already owns all Directions and route-cache access. `getDayRouteSummary` and `getDayScheduleConflicts` currently filter and position-sort their event lists correctly, then await `resolveHopRoute` sequentially inside loops. Only those outer loops need concurrency.
- `resolveHopRoute` is Story 7.2's shared per-hop sequence: fetch trip-default mode, return unavailable unchanged, apply the strict straight-line lower-bound gate, resolve from the ready route's actual distance, and optionally refetch as walk. It must stay sequential within a hop; concurrently invoking each hop must not change its selection rules.
- `getRouteDistanceTime` already has a module-level `inFlightRouteRequests` map introduced before this story. Its raw-coordinate key is inconsistent with `lookupRouteDistanceTime`'s six-decimal cache normalization. Align the key with `quantizeCoord`; do not introduce a second dedup mechanism.
- `route.ts` is currently 256 lines. Keep this bounded while touching it by consolidating only duplicated day-hop orchestration within its existing route-domain boundary; do not turn the narrow change into a new provider/cache module or an unrelated rewrite.
- Use `Promise.allSettled` (or an equivalent explicit settled-result strategy) so a rejected per-hop operation has the same isolated unavailable outcome as today. Its result sequence must be processed by input index, not completion timing.
- `getDayScheduleConflicts` accepts `tripId` for its stable action contract; do not remove it. `src/app/(app)/trips/[tripId]/route-actions.ts` already authenticates, checks viewer access, verifies client-supplied events belong to the trip, and delegates unchanged.

### Architecture and reliability guardrails

- All route/distance reads stay in server-only `src/lib/route.ts`; no component or action may query `route_cache` or call Mapbox directly.
- Reuse current Mapbox Directions v5 integration. Route `distance` is meters and `duration` is seconds, matching `RouteResult`; no dependency or API migration belongs here.
- Continue resolving provider, timeout, database, and other route failures to `{ status: "unavailable" }`, never throwing from the route layer. UI must continue to degrade without blocking itinerary or direct External Maps access.
- Persistent `route_cache` remains the 24-hour cross-request cache. New/updated in-flight sharing is only process-local; cross-instance duplicate calls are an accepted serverless limitation.
- Preserve `MAPBOX_PROFILE`, request URL construction, `AbortSignal.timeout(3000)`, integer rounding, cache TTL/read/write behavior, and `quantizeCoord` precision.

### Scope boundaries

- Modify only `src/lib/route.ts` and `src/lib/route.test.ts`.
- No changes to `route-actions.ts`, client components, route-strip/conflict components, types, database schema/migrations, feature maps, E2E features/steps, packages, or configuration.
- No new domain helper/module: existing `resolveHopRoute`, `getRouteDistanceTime`, and `quantizeCoord` are the correct extension points.

### Testing requirements

- Required colocated test file: `src/lib/route.test.ts`. Begin there before changing `route.ts`.
- Use controllable deferred fetch promises to prove concurrency; call-count-only tests cannot establish that both hops began before the first completed.
- Fully settle all deferred promises inside each test and continue restoring globals in cleanup so module-level in-flight state cannot leak into later tests.
- Unit coverage owns this routing-domain behavior. No new user-facing flow exists, so no new E2E scenario is required; validation still runs shared-runtime affected E2E.

### Previous Story Intelligence

- Story 7.2 intentionally left the outer loops sequential for this story. It added `resolveHopRoute` so both consumers share the same two-phase actual-route-distance logic; preserve that shared helper rather than duplicating it in concurrent callbacks.
- Story 7.2's final validation passed. Its focused tests cover no-refetch and unavailable-walk outcomes; retain those tests while adding concurrency coverage.

### Git Intelligence

- `69e443e` introduced Story 7.2's two-phase resolver; `eebad08` added unavailable-walk-refetch coverage. Keep this change focused on parallelizing consumer loops and normalizing the already-existing in-flight key.
- `36d031d` introduced raw-coordinate in-flight dedup; `3adc1cf` later added six-decimal persistent-cache quantization. This story reconciles those established mechanisms rather than replacing either.

### Latest Technical Information

- Mapbox Directions API v5 uses `https://api.mapbox.com/directions/v5/{profile}/{coordinates}`. Its route `distance` is meters and `duration` is seconds; retain the project's existing conversion boundary. [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/)
- `Promise.allSettled` returns settled results in input order, which supports deterministic event-order processing even when individual hops finish out of order. [MDN Promise.allSettled](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)

### Project Structure Notes

- Domain routing logic: `src/lib/route.ts`.
- Colocated unit tests: `src/lib/route.test.ts`.
- Existing route server action boundary: `src/app/(app)/trips/[tripId]/route-actions.ts` (read and preserve; no edit).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7, Story 7.3]
- [Source: _bmad-output/implementation-artifacts/deferred-work-plan.md#Story C — Parallelize day hops with in-process dedup]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Deferred from code review of 4-1]
- [Source: _bmad-output/implementation-artifacts/7-2-resolve-per-hop-mode-from-actual-route-distance.md#Dev Notes and Completion Notes List]
- [Source: _bmad-output/planning-artifacts/architecture.md#Location & Mapping Infrastructure; #Architectural Boundaries]
- [Source: _bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/prd.md#4.4 Day Route Strip and Schedule Awareness; #Nonfunctional Requirements]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md#State Patterns]
- [Source: _bmad-output/project-context.md#Testing; #Database & ORM; #Server Actions]
- [Source: src/lib/route.ts#getRouteDistanceTime, resolveHopRoute, getDayRouteSummary, getDayScheduleConflicts]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Confirmed RED: new concurrency/dedup tests failed against pre-change `route.ts` (`fetchMock` called once instead of twice; hop1 never started until hop0 settled).
- Post-implementation run surfaced 2 unrelated pre-existing test failures caused by a latent coordinate collision in "evaluates every adjacent pair even when one hop's route is unavailable" (all three events defaulted to identical coordinates), which under real concurrency correctly deduped hop0/hop1 into one request, leaving an unconsumed `mockResolvedValueOnce` that cascaded a FIFO queue misalignment into two later tests. Fixed by giving that test's three events distinct coordinates; full suite green after (57/57).
- `npm run test:e2e:affected` hit the known Windows multi-tag `cmd.exe` pipe-splitting bug (see project memory) on the 3-tag affected scope; ran each `@feat:` tag individually instead (`day-route-strip` 3/3, `linked-events` 9/9, `schedule-conflict` 5/5 — 17/17 total) as equivalent coverage.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added `resolveDayHopRoutes`, a single private helper shared by `getDayRouteSummary` and `getDayScheduleConflicts`, that starts all hops via `Promise.allSettled` before any is awaited and maps unsettled/rejected entries to `{ status: "unavailable" }`; both consumers now process results by original hop index so totals and `ScheduleConflict.eventIndex` stay stable regardless of settle order. `resolveHopRoute`'s internal two-phase sequence is unchanged.
- Fixed `getRouteDistanceTime`'s in-flight dedup key to use `quantizeCoord` on all four coordinates (previously raw, inconsistent with the persistent cache's key), so epsilon-different coordinates now dedupe against a shared in-flight request the same way they already dedupe in the persistent cache.
- `route.ts` grew from 256 to 273 lines extracting the shared concurrency helper, above the ~250-line guideline; further reduction would require touching the pre-existing (and out-of-scope) duplicated located/timed-located filter-and-sort blocks in both consumers, which Dev Notes explicitly scoped this story away from. Flagging for a future consolidation pass rather than doing it here.
- `packt-build-validator`: lint/tsc/coverage/build all PASS; `test:e2e:affected`'s bundled multi-tag grep hit the known Windows infra bug, so the 3 affected `@feat:` tags were run individually (17/17 passed) as equivalent coverage — see Debug Log.

### File List

- `_bmad-output/implementation-artifacts/7-3-parallelize-day-hops-with-in-process-dedup.md` (modified)
- `src/lib/route.ts` (modified)
- `src/lib/route.test.ts` (modified)

## Change Log

- Replaced the sequential outer hop loops in `getDayRouteSummary` and `getDayScheduleConflicts` with a shared `resolveDayHopRoutes` helper that starts every hop concurrently via `Promise.allSettled` and aggregates by original index, so a many-stop day no longer serializes N-1 Directions lookups.
- Normalized `getRouteDistanceTime`'s in-flight dedup key onto `quantizeCoord`, matching the persistent cache's key so concurrent same-process requests for epsilon-different coordinates share one request instead of issuing duplicate Directions calls.
