---
title: "Route SSE heartbeat through the pub/sub fan-out path"
type: "bugfix"
created: "2026-09-08"
status: "done"
review_loop_iteration: 0
baseline_commit: "b7d47efce89e6b41465f918bf6be6cd9417a02e1"
context: ["{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Both SSE routes emit their periodic heartbeat from a per-connection `setInterval` that never touches `trip-events.ts`'s pub/sub maps, so the heartbeat proves only that the HTTP connection is open — not that `publishTripEvent`/`publishUserEvent` fan-out actually reaches that subscriber. A broken fan-out reports as healthy indefinitely (logged 2026-09-08, `deferred-work.md`).

**Approach:** Move periodic heartbeats out of each route's local timer and into a scheduler in `trip-events.ts` that delivers them through the exact same per-subscriber delivery loop `publishTripEvent`/`publishUserEvent` already use. Bundle the same-file cleanup this makes natural: extract the two routes' now-near-identical stream setup into one shared helper, and fix the two small pre-existing gaps in the same files (aborted-controller enqueue guard, `releaseChannel` identity check).

## Boundaries & Constraints

**Always:**

- Wire format stays byte-compatible: heartbeat frames remain `data: {"type":"heartbeat"}\n\n`; `use-live-sync.ts`'s `parseLiveSyncEvent`/dead-channel/watchdog behavior does not change — any message (heartbeat or real event) still resets the watchdog.
- The one-time immediate flush on connect (fires before any interval, so the response isn't held open a full interval before the client sees "Connected") stays and is not folded into the scheduler's cadence.
- Every periodic heartbeat reaching a client passes through the same subscriber Set + per-subscriber try/catch delivery used for real events (`tripTopics`/`userTopics`) — no parallel delivery mechanism.
- `publishTripEvent`/`publishUserEvent`'s existing public signatures (typed `LiveSyncEvent`, real events only) stay unchanged for their current server-action callers.
- `SSE_HEARTBEAT_INTERVAL_MS` (`live-sync-constants.ts`) stays the single cadence source; no second interval value.
- Any new module-level timer in `trip-events.ts` follows the existing `globalThis`-singleton guard pattern (like `__tripEventTopics`) so dev-mode HMR can't spawn duplicates, and ships a test-reset export the same way `purgeTripTopic` already resets topic state.
- No enqueue is attempted on a controller for a request whose `signal.aborted` is already true at stream start.
- `releaseChannel(url)` only releases the channel object its caller actually acquired, never whatever the map currently holds at that key.

**Ask First:**

- Whether `formatSseHeartbeat()` stays a distinct export or collapses into `formatSseEvent(HEARTBEAT_EVENT)` — implementer's call; ask if an existing test/call site makes one option clearly wrong.

**Never:**

- No Redis or cross-instance transport — horizontal-scale fan-out is explicitly out of scope per `epic-4-context.md` ("deferred; a multi-instance deployment... must swap in Redis first"). This fix only makes the existing in-process health signal honest.
- No changes to `SyncConnectionStatus` values or the dead-channel timeout formula beyond the `releaseChannel` guard.
- No touching `sync-status-indicator.tsx` aria-live/debounce or `bottom-tab-bar.tsx` safe-area handling — separate deferred items, not this goal.
- Do not add a `Heartbeat` entry to `LiveSyncEventType`/`LiveSyncEvent` in `src/data/types.ts` — carved off to `deferred-work.md` to keep this spec in scope; keep the heartbeat representation an internal literal/type local to `trip-events.ts`, matching today's `formatSseHeartbeat()` shape.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Healthy fan-out, idle connection | Client connected, subscriber registered, no real events, interval elapses | Heartbeat delivered via the subscriber callback; client stays Connected | N/A |
| Broken fan-out | Connection's callback is absent from `tripTopics`/`userTopics` (simulated: never registered) | No heartbeat or event reaches the client; after `SSE_HEARTBEAT_INTERVAL_MS + LIVE_SYNC_DEAD_CHANNEL_GRACE_MS` the client watchdog flips to Offline | dead-channel watchdog (`use-live-sync.ts`, unchanged) |
| Already-aborted request at stream start | `request.signal.aborted === true` when `start(controller)` runs | No enqueue attempted; controller closes cleanly | Must not throw "Invalid state: Controller is already closed" |
| Stale `releaseChannel` call | Cleanup fires for a channel object the shared map already replaced at that URL | The newer channel is untouched — not decremented, not closed | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/trip-events.ts` -- pub/sub core. `publishTripEvent`/`publishUserEvent` (37-63) already do per-subscriber try/catch delivery — reuse that loop for the new scheduler. Add scheduler + test-reset export, and extract the shared stream-setup helper (both routes already import from here). Heartbeat stays an internal literal local to this file, matching today's `formatSseHeartbeat()` output (not promoted to `data/types.ts` — see `deferred-work.md`).
- `src/app/api/users/me/events/route.ts` / `src/app/api/trips/[tripId]/events/route.ts` -- byte-identical stream setup today (same `SSE_RESPONSE_HEADERS`, same shape); drop each route's local `setInterval(emitHeartbeat, ...)` (line 29), adopt the shared helper with `subscribeUser` / `subscribeTripForUser` respectively.
- `src/lib/live-sync-constants.ts` -- `SSE_HEARTBEAT_INTERVAL_MS` (15s), `LIVE_SYNC_DEAD_CHANNEL_GRACE_MS` (10s); reused as-is.
- `src/lib/use-live-sync.ts` -- `releaseChannel` (100-110) keys purely on `url`; add identity guard. `parseLiveSyncEvent` unchanged.
- `src/lib/trip-events.test.ts` -- extend the existing per-subscriber throw-isolation pattern (101-119, 174-193) for scheduler coverage.
- `src/app/api/users/me/events/route.test.ts` / `src/app/api/trips/[tripId]/events/route.test.ts` -- each has an "idle heartbeat" test (line 85 / 108) and an abort test asserting `clearIntervalSpy` (line 98 / 121) that both assert the exact mechanism being removed — rewrite, don't patch.
- `src/lib/use-live-sync.test.ts` -- add the stale-`releaseChannel` scenario from the I/O matrix.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/trip-events.ts` -- add a `globalThis`-guarded periodic scheduler that, each `SSE_HEARTBEAT_INTERVAL_MS` tick, delivers a heartbeat to every subscriber in `tripTopics` and `userTopics` via the same per-subscriber try/catch loop `publishTripEvent`/`publishUserEvent` use; export a test-reset hook alongside `purgeTripTopic` -- makes the periodic beat prove the real fan-out path.
- [x] `src/lib/trip-events.ts` -- extract a shared stream-setup helper (subscribe, immediate connect flush guarded against an already-aborted signal, abort cleanup) parameterized by which `subscribe*` function to call -- removes the byte-identical duplication between the two routes.
- [x] `src/app/api/users/me/events/route.ts` + `src/app/api/trips/[tripId]/events/route.ts` -- drop each route's local heartbeat interval; adopt the shared helper with `subscribeUser` / `subscribeTripForUser`.
- [x] `src/lib/use-live-sync.ts` -- add an identity guard to `releaseChannel(url)` so it only acts on the channel object its caller acquired.
- [x] `src/lib/trip-events.test.ts` -- cover: scheduler delivers a heartbeat to every trip/user subscriber through the shared delivery path; a topic with no subscribers gets no delivery attempt.
- [x] `src/app/api/users/me/events/route.test.ts` + `src/app/api/trips/[tripId]/events/route.test.ts` -- rewrite each file's idle-heartbeat test to trigger the periodic beat via the mocked subscribe callback (mirroring "streams a published event through to the client"); replace the interval-clearing assertion in the abort test with whatever the shared helper actually cleans up on abort.
- [x] `src/lib/use-live-sync.test.ts` -- add the stale-`releaseChannel` scenario (I/O matrix row 4).

**Acceptance Criteria:**

- Given a client subscribed to a trip or personal channel with an intact fan-out registration, when the heartbeat interval elapses, then the heartbeat is delivered through that connection's registered subscriber callback (not an independent per-route timer).
- Given a connection whose subscriber registration is missing from `tripTopics`/`userTopics`, when the heartbeat interval elapses, then no heartbeat reaches that connection and the client transitions to Offline after the existing watchdog grace window.
- Given the two SSE route handlers, when their `ReadableStream` is constructed, then both call one shared helper for subscribe/flush/cleanup with no duplicated stream-setup logic remaining between the two files.
- Given a request whose signal is already aborted when the stream starts, when the handler runs, then no enqueue is attempted and no "Invalid state" error is thrown.
- Given two consumers of `use-live-sync.ts` sharing a channel URL, when a stale effect cleanup calls `releaseChannel` after the map's entry at that URL was replaced, then the newer channel's refcount and open state are unaffected.

## Spec Change Log

## Design Notes

- Only *where* the heartbeat is generated changes, not the wire format — `use-live-sync.ts` already treats any message, heartbeat included, as proof of life. No client-visible behavior change in the healthy case.
- Mirror the existing `globalThis`-singleton guard (`__tripEventTopics`) for the new interval — same reasons: survives dev HMR, and needs a `purgeTripTopic`-style reset export so it doesn't leak a live timer across Vitest files.
- The two route tests' "idle heartbeat" and "clears the heartbeat interval" cases assert the old per-route-timer mechanism (`vi.advanceTimersByTime` / `clearIntervalSpy`) directly — re-derive them from the new shared helper's actual tick/abort behavior, don't patch in place.
- "Ask First" resolved: `formatSseHeartbeat()` stays a distinct export rather than collapsing into `formatSseEvent(HEARTBEAT_EVENT)` — both route test files already imported `formatSseHeartbeat` as a separate mock/assertion target, and `createLiveSyncResponse` branches on `frame.type === "heartbeat"` to pick between the two formatters, so keeping them distinct avoided widening `formatSseEvent`'s signature to accept the internal `HeartbeatFrame` type.
- Code-review patch (2026-09-08): the module-level heartbeat scheduler had no shutdown path — once started by the first subscriber, its `setInterval` never cleared even after every subscriber unsubscribed. Added `stopHeartbeatSchedulerIfIdle()`, called from both `subscribeTripForUser`'s and `subscribeUser`'s unsubscribe closures, which clears the interval once `tripTopics` and `userTopics` are both empty.

## Verification

**Commands:**

- `npm test -- --run src/lib/trip-events.test.ts src/lib/use-live-sync.test.ts` -- expected: all pass
- `npm test -- --run src/app/api/users/me/events/route.test.ts "src/app/api/trips/[tripId]/events/route.test.ts"` -- expected: all pass
- `npm run test:coverage` -- expected: thresholds hold for `src/lib/**`
- `npx tsc --noEmit` -- expected: no type errors from the new scheduler/shared-helper code (heartbeat stays an internal literal, not added to `LiveSyncEvent`)
- `packt-build-validator` -- expected: PASS (final gate per project workflow; covers lint, build, and affected E2E — no E2E changes are expected since the observable Connected/Reconnecting/Offline UI states are unchanged)

## Suggested Review Order

**Heartbeat routed through the real fan-out path**

- Entry point: the heartbeat now ticks through the same per-subscriber loop real events use, instead of a route-local timer that never touched the pub/sub maps.
  [`trip-events.ts:107`](../../src/lib/trip-events.ts#L107)

- The shared delivery loop every subscriber's frame — real or heartbeat — passes through; unchanged shape, now called by two producers instead of one.
  [`trip-events.ts:54`](../../src/lib/trip-events.ts#L54)

- `publishTripEvent`/`publishUserEvent` now delegate to that shared loop instead of owning their own copy of it.
  [`trip-events.ts:88`](../../src/lib/trip-events.ts#L88)

**Scheduler lifecycle**

- Lazily starts the module-level interval the first time any subscriber connects, guarded like the existing topic-map singletons.
  [`trip-events.ts:125`](../../src/lib/trip-events.ts#L125)

- Review-patch: stops the interval once every topic is empty, so an idle process doesn't tick forever after its last connection closes.
  [`trip-events.ts:142`](../../src/lib/trip-events.ts#L142)

- Wired into `subscribeTripForUser`'s unsubscribe closure.
  [`trip-events.ts:182`](../../src/lib/trip-events.ts#L182)

**Shared stream-setup helper**

- Consolidates both routes' subscribe/flush/cleanup into one function; the already-aborted branch fixes the pre-existing enqueue-on-closed-controller bug.
  [`trip-events.ts:257`](../../src/lib/trip-events.ts#L257)

- Trip route now just binds its subscribe call to the shared helper.
  [`trips/[tripId]/events/route.ts:11`](../../src/app/api/trips/%5BtripId%5D/events/route.ts#L11)

- User route does the same.
  [`users/me/events/route.ts:9`](../../src/app/api/users/me/events/route.ts#L9)

**`releaseChannel` identity guard**

- A stale cleanup now only releases the exact channel object it acquired, never whatever the map currently holds at that URL.
  [`use-live-sync.ts:106`](../../src/lib/use-live-sync.ts#L106)

**Tests**

- Proves a heartbeat tick reaches every trip and user subscriber through the real delivery path, not a mock.
  [`trip-events.test.ts:258`](../../src/lib/trip-events.test.ts#L258)

- Review-patch regression test: the scheduler interval actually clears once the last subscriber across every topic unsubscribes.
  [`trip-events.test.ts:343`](../../src/lib/trip-events.test.ts#L343)

- End-to-end: a scheduled heartbeat reaches a trip-subscribed connection through the real `Response` stream, not just the lower-level scheduler.
  [`trip-events.test.ts:429`](../../src/lib/trip-events.test.ts#L429)

- Forces the channel map to be replaced out from under a still-mounted consumer, then proves its stale cleanup leaves the newer channel untouched.
  [`use-live-sync.test.ts:314`](../../src/lib/use-live-sync.test.ts#L314)
