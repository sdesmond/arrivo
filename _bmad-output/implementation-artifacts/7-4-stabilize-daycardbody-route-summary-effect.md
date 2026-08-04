---
baseline_commit: 55dcfe0
---

# Story 7.4: Stabilize DayCardBody Route-Summary Effect + Unify Null-Checks

Status: done

## Story

As a traveler viewing a day card,
I want the route-summary fetch to only re-run when the day’s actual content changes,
so that a parent re-render with a content-identical event list does not trigger a wasted refetch, and stops at 0°/0° coordinates remain located.

## Acceptance Criteria

1. **Stable route-summary fetch inputs**
   - Given `day-card-body.tsx` currently depends on both `locatedEvents` array identity and `routeSummaryKey`, when a parent supplies a new but content-identical `day.events` array, `getDayRouteSummary` is not called again.
   - Derive the primitive content key from `day.events` as `tripId|mode|threshold|id:lat:lng:position` for located events. The effect must depend on that stable key, never on raw `day.events` or a derived array reference.
   - Retain immediate `{ status: "loading" }` output whenever the displayed key differs from the last settled result.

2. **Meaningful route changes refetch**
   - Given a located event’s coordinates or its position in the day changes, when props update, the stable key changes and exactly one new route-summary request starts with current events, trip ID, transit mode, and threshold.
   - Keep the existing active-request cleanup: a late resolution or rejection from an outdated request must not update current route-summary state.

3. **Zero coordinates count as locations**
   - Given `locationLat: 0` or `locationLng: 0`, when located-event filtering and Day Route Strip gating run, the event counts as located.
   - Use explicit `!== null && !== undefined` checks for both latitude and longitude. Do not use truthiness or loose `!= null` checks in this path.
   - Preserve existing behavior: Day Route Strip only renders for two or more located events with `tripId` and `tripTransitMode`; freeform or missing-location events remain excluded without an empty-state or nudge.

4. **Colocated hook extraction**
   - Extract route-summary key construction, located-event selection, fetch, cancellation, and loading/ready/unavailable state into `src/components/packt/use-day-route-summary.ts`, following the client-hook style of `use-schedule-conflicts.ts` and `use-day-draft.ts`.
   - Keep `day-card-body.tsx` below the project’s ~250-line guideline while preserving its DnD, draft, optimistic ordering, conflict, focus, and Map-tab behavior.

## Tasks / Subtasks

- [x] Add route-summary hook tests before production edits. (AC: 1-3)
  - [x] Create `src/components/packt/use-day-route-summary.test.ts` beside the new hook; use `renderHook` and mocked `getDayRouteSummary` to cover the fewer-than-two/no-trip/no-mode guards, successful ready result, rejected request → unavailable, content-identical rerender → no extra request, coordinate and position changes → refetch, and late stale result ignored after key change or unmount.
  - [x] Use two zero-coordinate events in a hook test so `0` proves location presence rather than merely key construction.
- [x] Expand DayCardBody component tests before production edits. (AC: 1-3)
  - [x] Update `src/components/packt/day-card-body.test.tsx` to spy on the server action and prove a cloned content-identical `day.events` list does not issue a second call.
  - [x] Add coordinate-change and position-change rerender cases that each issue a new request with current event data.
  - [x] Add a two-event `0` latitude/longitude regression case that renders the Day Route Strip; do not assert only internal class names.
  - [x] Use deferred promises where needed; settle all promises and restore mocks so asynchronous state cannot leak into following tests.
- [x] Extract `useDayRouteSummary` after tests fail. (AC: 1-4)
  - [x] Add `"use client"` as the first line and export a typed hook API returning the current `DayRouteSummary` plus the stable located events used by the card.
  - [x] Keep the existing `getDayRouteSummary(tripId, events, tripTransitMode, walkThresholdMeters)` server-action boundary and its argument contract. Never call Mapbox, `route_cache`, or `src/lib/route.ts` directly from client code.
  - [x] Ensure every fetch input is coherent with the stable key. Do not suppress `react-hooks/exhaustive-deps`; avoid stale closures through a stable data source rather than omitting reactive inputs.
  - [x] Preserve the key-matched state pattern, `active` cleanup guard, loading state, and caught rejection → `{ status: "unavailable" }` behavior.
- [x] Simplify DayCardBody to consume the hook. (AC: 1-4)
  - [x] Remove its local route-summary state/effect/key implementation and retain all unrelated timeline, draft, reorder, Schedule Conflict, focus URL, and route-strip behaviors unchanged.
  - [x] Apply explicit null-and-undefined coordinate checks in its located-event filter and route-strip gate. Do not change `day-route-strip.tsx`; it contains no location truthiness gate.
- [x] Register and verify scope. (AC: 4)
  - [x] Update `tests/e2e/feature-map.mjs` to map `src/components/packt/use-day-route-summary.ts` to the existing `@feat:day-route-strip` coverage, satisfying the unmapped Packt-component guard. Do not add a new user-facing E2E scenario for this internal refactor.
  - [x] Run `npx vitest run src/components/packt/use-day-route-summary.test.ts src/components/packt/day-card-body.test.tsx` before broad validation.
  - [x] Run `packt-build-validator` once after targeted tests pass. Existing affected coverage is `@feat:day-route-strip`, `@feat:map-tab`, and `@feat:schedule-conflict`; preserve whichever feature-map selection results from the mapping update.

## Dev Notes

### Current state and required change

- `src/components/packt/day-card-body.tsx` is an interactive client component. It currently filters `day.events`, builds `routeSummaryKey`, owns `RouteSummaryState`, then fetches in an effect dependent on `[locatedEvents, routeSummaryKey, tripId, tripTransitMode, walkThresholdMeters]`. A new array identity therefore refetches despite identical route inputs.
- The hook owns the extracted `RouteSummaryState` equivalent, key construction, located-event selection, state mismatch → loading, server-action fetch, and cancellation. `DayCardBody` consumes its returned summary and located events only.
- The current filter’s loose `!= null` is zero-safe but must be standardized to explicit checks. The parent route-strip condition is the only render gate relevant to this story; `day-route-strip.tsx` has no coordinate gate and remains unchanged.
- `useScheduleConflicts` remains separate. Its request computes a different key including schedule fields and consumes optimistic ordering; do not fold it into the new hook or change its effect behavior.

### Architecture and reliability guardrails

- Route calculation, cache access, Mapbox Directions calls, provider profile, 3-second timeout, 24-hour cache, quantization, unavailable behavior, and Schedule Conflict algorithms remain server-only and out of scope. Preserve Story 7.2’s two-phase actual-route-distance resolver and Story 7.3’s ordered parallel hop resolution/in-flight dedup.
- Preserve `route-actions.ts` signatures and its `requireUser()`, `assertTripAccess(..., "viewer")`, and event-ownership validation. Client code continues calling only `getDayRouteSummary`.
- Use canonical domain types from `@/data/types`; no local type duplication, `any`, schema/migration, dependency, or provider changes.
- This is a client hook: `"use client"` must be first. Follow Next.js 16.2.4 client-component boundaries; never import server-only modules into the hook.
- Keep UI degradation neutral: loading stays a skeleton, unavailable stays non-blocking, and no route data must block itinerary or external-maps access.

### File structure and scope

- New: `src/components/packt/use-day-route-summary.ts`
- New: `src/components/packt/use-day-route-summary.test.ts`
- Update: `src/components/packt/day-card-body.tsx`
- Update: `src/components/packt/day-card-body.test.tsx`
- Update: `tests/e2e/feature-map.mjs`
- Do not change `src/components/packt/day-route-strip.tsx`, `src/app/(app)/trips/[tripId]/route-actions.ts`, `src/lib/route.ts`, domain types, database schema/migrations, E2E features/steps, package files, or config.

### Testing requirements

- Tests are first-class deliverables: begin with the two named colocated test files before production code. `use-day-route-summary.test.ts` is required by the project matching-colocated-test rule even though component tests also exercise the hook.
- Unit/component tests own this internal behavior; no new end-to-end scenario is needed. The existing day-route-strip flow covers user-visible visibility, and the feature map protects affected regression coverage.
- Maintain ≥95% lines/functions and ≥90% branches across `src/components/packt/**`. Test asynchronous hooks with `act`/`waitFor`, settle deferred work, and clean mocks between cases.

### Previous Story Intelligence

- Story 7.3 preserved all route outcomes while parallelizing only outer hop lookups. Do not duplicate, bypass, or alter `resolveHopRoute`, `resolveDayHopRoutes`, `quantizeCoord`, or the in-flight map from client code.
- Use explicit coordinate checks and zero-coordinate regression coverage, following Story 7.3’s `hasLocation` patch. Distinct coordinates prevent accidental in-flight dedup when route-layer tests are involved, though this story’s component tests should mock the action boundary.
- Its Windows validator run hit the known multi-tag affected-E2E pipe issue; when that infrastructure issue recurs, run the selected tags individually and record equivalent coverage rather than changing product code.

### Git Intelligence

- Recent Epic 7 commits: `78d0028` (Story 7.2 merge), `a0bd17d` (concurrent hops/dedup), `cee7567` (zero-coordinate review patch), and `55dcfe0` (Story 7.3 merge). Keep the change narrow and preserve their route contracts.

### Latest Technical Information

- React compares each `useEffect` dependency with `Object.is`; new object/array references can re-run an effect even when their contents match. Use the stable primitive key while keeping every reactive input coherent and declared—do not silence dependency linting. [React `useEffect`](https://react.dev/reference/react/useEffect)
- In Next.js 16.2.4, state, effects, and custom hooks require a Client Component boundary; the new hook belongs under the existing client `DayCardBody`, not in a server-only module. [Next.js Server and Client Components](C:/Users/spenc/dev/packt/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md)

### Project Structure Notes

- Colocate domain component hooks and their Vitest tests under `src/components/packt/`.
- `tests/e2e/feature-map.mjs` must cover every Packt component; register the new hook under existing day-route-strip coverage.
- No design change is intended. Preserve Day Route Strip’s compact route summary, map deep-link, conflict badge, keyboard/accessibility behavior, and 44×44px thumbnail target.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7, Story 7.4]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Deferred from code review of 4-1]
- [Source: _bmad-output/implementation-artifacts/deferred-work-plan.md#Story D — Stabilize DayCardBody route-summary effect + unify null-checks]
- [Source: _bmad-output/implementation-artifacts/7-3-parallelize-day-hops-with-in-process-dedup.md#Dev Notes, Completion Notes List]
- [Source: src/components/packt/day-card-body.tsx#DayCardBody]
- [Source: src/components/packt/use-schedule-conflicts.ts#useScheduleConflicts]
- [Source: src/components/packt/use-day-draft.ts#useDayDraft]
- [Source: src/app/(app)/trips/[tripId]/route-actions.ts#getDayRouteSummary]
- [Source: tests/e2e/feature-map.mjs]
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture; #Architectural Boundaries]
- [Source: _bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/prd.md#Day Route Strip and Schedule Awareness; #Nonfunctional Requirements]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md#State Patterns]
- [Source: _bmad-output/project-context.md#Next.js; #Testing; #Components]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Story context created from complete planning artifacts, deferred-work records, current implementation, Story 7.3, and recent Git history.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Extracted `useDayRouteSummary` from `DayCardBody`. The fetch effect now depends only on the stable
  primitive `routeSummaryKey` plus `tripId`/`tripTransitMode`/`walkThresholdMeters`; a "latest ref"
  synced by its own effect (same pattern as `useViewportClampedPanel`) supplies the actual event array
  to the fetch without adding an unstable array reference to the fetch effect's dependency list — no
  `react-hooks/exhaustive-deps` suppression needed.
- Reproduced the pre-fix bug as a failing test first (`day-card-body.test.tsx` — content-identical
  rerender issued a second `getDayRouteSummary` call), then made it pass via the extraction.
- Located-event filtering now uses explicit `!== null && !== undefined` checks for both coordinates
  (was loose `!= null`); added a two-event zero-coordinate regression case in both the hook and
  component test suites.
- `day-card-body.tsx` is now 250 lines (previously 285), consuming `useDayRouteSummary` for route
  summary state and located events; all other behavior (DnD, draft, optimistic ordering, Schedule
  Conflict, focus URL, Map-tab deep link) is unchanged.
- Registered `use-day-route-summary.ts` under the existing `@feat:day-route-strip` E2E mapping in
  `tests/e2e/feature-map.mjs`; no new E2E scenario added per Dev Notes.
- `packt-build-validator`: lint/tsc/coverage/build all passed. The affected E2E run (full suite,
  since `feature-map.mjs` is a shared glob) had one failure in `@feat:trip-cover-overflow` — a feature
  untouched by this story. Re-ran that single feature in isolation and it passed cleanly (7/7),
  confirming pre-existing environmental flakiness rather than a regression, consistent with prior
  Epic 7 flakiness notes.

### File List

- `_bmad-output/implementation-artifacts/7-4-stabilize-daycardbody-route-summary-effect.md` (created, updated)
- `src/components/packt/use-day-route-summary.ts` (created)
- `src/components/packt/use-day-route-summary.test.ts` (created)
- `src/components/packt/day-card-body.tsx` (modified)
- `src/components/packt/day-card-body.test.tsx` (modified)
- `tests/e2e/feature-map.mjs` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

### Change Log

- 2026-08-04: Extracted `useDayRouteSummary` hook so the route-summary fetch depends on a stable
  primitive key instead of the raw `day.events` array reference; unified located-event coordinate
  checks to explicit `!== null && !== undefined`; registered the new hook in `feature-map.mjs`.

### Review Findings

- [x] [Review][Patch] Cover immediate loading after route-input changes [src/components/packt/use-day-route-summary.test.ts:98] — use a deferred second request and assert `{ status: "loading" }` before it settles for coordinate and position changes.
- [x] [Review][Patch] Cover stale request rejection [src/components/packt/use-day-route-summary.test.ts:143] — reject a superseded deferred request after a key change and assert that the current ready summary remains unchanged.
