---
title: "Trip Page Live Refresh on Itinerary and Membership Events"
type: "feature"
created: "2026-09-04"
status: "in-review"
baseline_commit: "3bd80b498dc171e2321e3f5a02c53a1fc53c2ca8"
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 4-1 shipped the SSE channels and 4-2 the status indicator, but nothing on the trip page consumes live events — a second editor's itinerary or membership change shows up only on manual refresh, so two people working the same trip are not "always looking at current trip state" (FR8).

**Approach:** On the trip page, open the trip SSE channel and refetch trip data on `itinerary-changed`, `membership-changed`, and any reconnect (`onopen` after a drop). Refetches ride `router.refresh()` (re-runs `getTripDetail`, so the newly computed `accessRole` flows back through `detail` and role-gated UI re-evaluates for free). A monotonic request-generation counter discards a stale refetch response. Close the one producer gap: role-only `saveContributorChanges` must publish `membership-changed` so role changes reach open sessions.

## Boundaries & Constraints

**Always:**
- Extend `useLiveSync(url, onLiveSyncEvent?)` with an optional event callback: parse `data:` JSON frames, filter `heartbeat` + unknown types, invoke with the `LiveSyncEvent` via a stable ref. Status machine, watchdog, and default URL stay; the indicator's contract is unchanged.
- New client hook `src/lib/use-trip-live-refresh.ts` (`"use client"`): opens `/api/trips/${tripId}/events` via `useLiveSync`; refetches on `itinerary-changed` / `membership-changed`; reconnect resync = any move into `Connected` after the first connection triggers one refetch (initial connect does not). Never refetch on `heartbeat`.
- Monotonic generation counter in the hook: each `router.refresh()` bumps it; any post-refresh application runs only when the generation is still current.
- Mount `useTripLiveRefresh(detail.trip.id)` once in `TripDetailClient` (`page-client.tsx`).
- Producer: `saveContributorChanges` (`trips/actions.ts`) publishes `publishTripEvent(tripId, { type: MembershipChanged })` whenever ANY change (role or removal) was applied — today only removals publish. Existing removed-user `MembershipRemoved` user events + `removeTripSubscribersForUser` stay unchanged.
- Tests-first: extend `use-live-sync.test.ts` (callback, payload parse, heartbeat/unknown filter, callback stability); add colocated `use-trip-live-refresh.test.ts` covering the I/O matrix; add E2E below. Coverage-gated.
- E2E `tests/e2e/features/trip-live-refresh.feature` + `tests/e2e/steps/trip-live-refresh.steps.ts`, tag `@feat:trip-live-refresh`, registered in `feature-map.mjs`. (All touched sources are SHARED globs, so the affected run is the full suite.)
- Existing conventions: colors via tokens only; icons `strokeWidth={1.5}`; no new dependencies; `router.refresh()` only — no SWR/query client.

**Ask First:**
- _None._

**Never:**
- No revocation modal, no `membership-removed` / `trip-deleted` handling, no dashboard live refresh — Stories 4.4 / 4.5.
- No changes to pub-sub API, SSE routes, route gating, or the 4-1 wire format. No Redis / horizontal fan-out. No DB or schema changes.
- No forced reconnect when the client shows offline; no refetch on every heartbeat; no polling interval.
- Share dialog (`trip-share-dialog.tsx`) event-driven refetch is out of scope — tracked for the story that touches that dialog.
- No new merge or conflict mechanism — CAP-10 stays latest-write-wins on plain `UPDATE`s.

## I/O & Edge-Case Matrix

| Scenario   | Input / State | Expected Output / Behavior | Error Handling |
| ---------- | ------------- | -------------------------- | -------------- |
| ITINERARY  | `itinerary-changed` arrives on trip channel | one `router.refresh()` (generation bumped) | refresh idempotent; failures surface via Next |
| MEMBERSHIP | `membership-changed` (any user) arrives | one refetch; no modal or interrupt; contributor count + role gates re-evaluate from new `accessRole` | N/A |
| RECONNECT  | status moves into `Connected` after a prior connection | one refetch (resync; events missed during the gap are recovered by the full refetch) | N/A |
| FIRST_CONNECT | initial `reconnecting → Connected` | no refetch (page just loaded) | N/A |
| STALE_GUARD | two refetches issued; older response settles after newer | older application discarded (generation mismatch) | stale response dropped |
| HEARTBEAT  | `{ "type": "heartbeat" }` frame | no refetch (liveness only) | N/A |
| UNKNOWN    | unrecognized `type` or malformed frame | ignored — no crash, no refetch | parse guarded |
| UNMOUNT    | hook unmounts / `tripId` changes | EventSource closed, timers cleared, no further refetches | cleanup idempotent |
| SELF_ROLE  | viewer's own role demoted while page open | refetch re-runs `assertTripAccess`; Budget tab + mutation controls update per new role; no interstitial | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/use-live-sync.ts:10,21-28` -- extend signature `useLiveSync(url?, onLiveSyncEvent?)`; parse `onmessage.data`, filter heartbeat/unknown, invoke callback through a ref.
- `src/lib/use-live-sync.test.ts` (`MockEventSource` + `emitMessage` L7-30) -- extend with callback/payload/filter/stability cases.
- `src/lib/use-trip-live-refresh.ts` -- NEW hook; `useLiveSync(\`/api/trips/${tripId}/events\`, handler)`, event-type guard, generation-guarded `router.refresh()`, reconnect resync via status watcher.
- `src/lib/use-trip-live-refresh.test.ts` -- NEW colocated tests (same MockEventSource + fake-timer technique).
- `src/app/(app)/trips/[tripId]/page-client.tsx:78-102` -- mount `useTripLiveRefresh(detail.trip.id)` once; role gates already derive from `detail.accessRole`.
- `src/app/(app)/trips/actions.ts:1029-1050` -- `saveContributorChanges`: publish `MembershipChanged` on the trip topic for any applied change, not only removals.
- `src/app/api/trips/[tripId]/events/route.ts:13-22` -- read-only reference: the viewer-gated channel the hook consumes (already tested).
- `src/lib/trip-events.ts:37-47` -- `publishTripEvent` (unchanged) -- the emitted signal the hook reacts to.
- `tests/e2e/features/trip-live-refresh.feature` + `tests/e2e/steps/trip-live-refresh.steps.ts` + `tests/e2e/feature-map.mjs` -- register `@feat:trip-live-refresh`.
- `tests/e2e/scenario-fixture.ts` + `tests/e2e/e2e-seed-data.ts` -- reuse `createTrip` / mothers; a second user + second context for the role-change scenario.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/use-live-sync.ts` + `src/lib/use-live-sync.test.ts` -- extend the hook with the optional `onLiveSyncEvent` callback (parsed `LiveSyncEvent`, heartbeat/unknown filtered, ref-held for stability) + colocated tests -- the event path into the page.
- [x] `src/lib/use-trip-live-refresh.ts` + `src/lib/use-trip-live-refresh.test.ts` -- NEW hook + colocated tests (event→refresh map incl. no-op set, initial-connect no-refetch, reconnect resync, stale-generation discard, unmount, unknown-frame guard) -- the live-refresh brain, exercising the I/O matrix.
- [x] `src/app/(app)/trips/[tripId]/page-client.tsx` -- mount `useTripLiveRefresh(detail.trip.id)` -- activate live refresh on the trip page.
- [x] `src/app/(app)/trips/actions.ts` -- `saveContributorChanges`: publish `membership-changed` on the trip topic for any applied role change (not just removals) -- AC's real end-to-end path.
- [x] `tests/e2e/features/trip-live-refresh.feature` + `tests/e2e/steps/trip-live-refresh.steps.ts` + `feature-map.mjs` -- Scenario A: two tabs, same session — edit an event title in tab 2; tab 1 shows it without a reload, and a second successive edit converges (latest wins). Scenario B: two sessions — manager demotes contributor B (editor→viewer) while B's trip page is open; B's page re-evaluates (Budget tab disappears) without reload -- user-facing verification of AC 1–6.

**Acceptance Criteria:**

- Given a trip page open with the trip EventSource connected, when an `itinerary-changed` event arrives, then the page refetches trip data (`router.refresh()` once).
- Given the EventSource reconnects after a drop, when `Connected` fires after the first connection, then a full refetch runs regardless of missed events; the initial connect triggers none.
- Given two refetches are triggered in quick succession, when responses return out of order, then only the most-recent-generation response is applied.
- Given two contributors edit the same itinerary item, when both writes commit, then the latest write wins and both sessions converge on their next refetch — no merge prompt, no corruption (CAP-10, no new mechanism; regression coverage via E2E Scenario A).
- Given a `membership-changed` event names a different user, when it arrives, then the trip page's contributor data refetches with no interrupt or modal.
- Given a `membership-changed` event names the viewer themselves (a role change), when processed, then role-gated UI (Budget tab, mutation controls, Share entry point) re-evaluates against the new role immediately — no interstitial, no full reload.
- Given coverage and checks, then `npm run test:coverage` stays ≥95% lines/functions / ≥90% branches, `npm run lint` and `npx tsc --noEmit` are clean, and `npm run test:e2e:affected` passes (full suite — `src/lib/**`, page-client, actions.ts all SHARED).

## Spec Change Log

- Code review (post-implementation): `useLiveSync`'s `[url]`-keyed effect never reset `status` before opening the new `EventSource`, so switching trips while connected could leave a stale `Connected` value that suppressed the next genuine reconnect's re-render (React bails on an identical `setState` value), causing `useTripLiveRefresh` to misread that reconnect as an initial connect and skip its refresh. Fixed by unconditionally calling `setStatus(Reconnecting)` at the top of the effect (a no-op on first mount); added a reproduction test in `use-trip-live-refresh.test.ts`.

## Design Notes

- **Why `router.refresh()`:** `getTripDetail` is page-scope RSC; `router.refresh()` re-runs it server-side, so one signal refreshes itinerary + expenses + contributors + `accessRole` together. Role gates (`page-client.tsx:100-102`, hero `canManage`/`canEdit`) all derive from `detail.accessRole`, so re-evaluation is free — no per-component role plumbing; E2E Scenario B (Budget tab disappears) proves it.
- **Reconnect resync without hook surgery:** `useLiveSync` already transitions `reconnecting → Connected` on every `onopen`. The trip hook watches `status`: the FIRST transition to `Connected` is the initial connect (no refetch); every later `reconnecting → Connected` is a reconnect → full refetch. No EventSource `onopen` plumbing needed.
- **Acting-session double-refresh is acceptable:** the session that mutates gets Next's post-`revalidatePath` refresh plus its own published event's refetch — both idempotent RSC GETs; the generation guard makes them converge.
- **Role change keeps the stream open:** the events route authorizes at open; `assertTripAccess` re-fires only on the refetch's query path. A demoted viewer keeps receiving events; a removed viewer's next refetch hits `notFound()` (revocation modal is 4.4).
- **CAP-10:** plain `UPDATE`s are already latest-write-wins; 4.3 adds no mechanism, only convergence coverage on refetch.

## Verification

**Commands:**

- `npx vitest run src/lib/use-live-sync.test.ts src/lib/use-trip-live-refresh.test.ts` -- expected: pass (event callback, refetch map, reconnect resync, stale guard).
- `npm run test:coverage` -- expected: ≥95% lines/functions, ≥90% branches (incl. the new hook).
- `npm run lint` -- expected: clean. `npx tsc --noEmit` -- expected: clean.
- `npm run test:e2e:affected` -- expected: full suite (all touched files under SHARED globs) with the new E2E scenarios green.