---
title: "Fix SSE force-removal to actually close the subscriber's stream"
type: "bugfix"
created: "2026-09-08"
status: "done"
baseline_commit: "ec88fb1fbcdea54a403ffac9ee32e351f88c3a4e"
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `removeTripSubscribersForUser`/`purgeTripTopic` in `trip-events.ts` delete a subscriber from the in-memory topic Set but never close its underlying SSE stream or run the idle/topic cleanup the normal unsubscribe closure runs — leaking the connection until the client's own watchdog times out (retro epic-4, item 18/EC-1/EC-2/AD-1/AD-2, the retro's highest-confidence finding: three independent review passes converged on it). The connect-time heartbeat flush is also the one frame delivery in the file with no throw guard (item 20/EC-3).

**Approach:** Extract one shared `unregisterTripSubscriber` helper that the normal unsubscribe closure and both force-removal paths all call, and thread a `close` callback (the same controller-closing logic `createLiveSyncResponse` runs on abort) into subscription so force-removal can actually terminate the stream. Wrap the connect-time heartbeat flush in the same try/catch pattern the file's other deliveries already use.

## Boundaries & Constraints

**Always:**

- `unregisterTripSubscriber` is the only code that mutates `tripTopics`/calls `stopHeartbeatSchedulerIfIdle` for a trip subscriber. The closure `subscribeTripForUser` returns, `removeTripSubscribersForUser`, and `purgeTripTopic` all call it — none duplicates the Set/topic-deletion logic inline.
- The `close` callback threaded into `subscribeTripForUser`/`subscribeUser` is the exact controller-closing logic `createLiveSyncResponse` already runs on abort — no second way to terminate a stream.
- Wire format and existing public signatures (`publishTripEvent`, `publishUserEvent`, `formatSseEvent`, `formatSseHeartbeat`) stay unchanged.
- The new try/catch around the connect-time flush follows the existing pattern exactly: try/catch around the single call, `console.warn` with a descriptive message, no rethrow — no change to the happy path.
- `subscribeUser` also gains the `close` param for signature symmetry with `subscribeTripForUser` (both are invoked through `createLiveSyncResponse`'s shared `subscribe` callback shape), even though no force-removal path exists for user topics today — it may go unused there.

**Ask First:** none anticipated — self-contained internal hardening matching an already-approved retro action item.

**Never:**

- Do not introduce a new pub/sub transport (Redis, etc.) — explicitly out of scope per epic-4 boundary.
- Do not touch the `publishItineraryChanged` regression-coverage gap (retro item 19) or the client-side `use-live-sync.ts` throw-isolation gap (item 22) — both are separate, deferred to `deferred-work.md`.
- Do not change the wire-visible heartbeat cadence or the immediate-connect-flush timing behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Force-remove one of a user's multiple tabs | user has 2 open SSE connections on a trip topic; `removeTripSubscribersForUser(tripId, userId)` called | both of that user's streams are closed (`close()`/`controller.close()` invoked) and removed from the Set; other users' subscriptions on the same topic are untouched | N/A |
| Force-remove the last subscriber on a topic | one subscriber remains on a trip topic, then force-removed | topic entry is deleted from `tripTopics`; heartbeat scheduler stops if no other topic has subscribers | N/A |
| `purgeTripTopic` on a topic with open connections | trip has N subscribers; `purgeTripTopic(tripId)` called (e.g. after trip-deleted) | every subscriber's stream is closed; topic removed from `tripTopics` | N/A |
| Connect-time heartbeat flush throws | `controller.enqueue` throws synchronously during the initial connect flush | error caught and logged via `console.warn`; stream setup still completes (abort listener still attached) instead of throwing out of `ReadableStream.start()` | Logged, non-fatal |

</frozen-after-approval>

## Code Map

- `src/lib/trip-events.ts` -- core fix. `TripSubscriber` (line 21) gains `close: () => void`. New `unregisterTripSubscriber(tripId, subscriber)` helper replaces the three divergent inline cleanups: the closure `subscribeTripForUser` returns (lines 177-183), `removeTripSubscribersForUser` (lines 215-223), and `purgeTripTopic` (lines 229-232) -- the latter two must snapshot (`[...subscribers]`) before iterating since the helper mutates the same Set. `subscribeTripForUser`/`subscribeUser` (lines 165, 190) gain a `close` param. `createLiveSyncResponse` (lines 257-295) passes its existing controller-close logic as the second arg to `subscribe(...)`, and wraps the connect-time `enqueueFrame(HEARTBEAT_FRAME)` call (line 289) in try/catch.
- `src/app/api/trips/[tripId]/events/route.ts` -- update the `subscribe` callback passed to `createLiveSyncResponse` (line 11) to accept and forward the second `close` arg into `subscribeTripForUser`.
- `src/app/api/users/me/events/route.ts` -- no functional change required; confirm the existing single-arg callback (line 9) still type-checks against the updated `subscribe` shape.
- `src/lib/trip-events.test.ts` -- extend `removeTripSubscribersForUser` (line 202) and `purgeTripTopic` (line 228) describe blocks with assertions that the force-removed subscriber's stream closes and an emptied topic is pruned from `tripTopics`; extend `createLiveSyncResponse` describe block (line 359) with a test that a throwing connect-flush doesn't crash stream setup.
- `_bmad-output/implementation-artifacts/epic-4-retro-2026-09-08.md` -- source of truth for items 18/20 (disposition table rows #1, #3).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark `epic-4-retro-item-18` and `epic-4-retro-item-20` `status: done` once landed.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/trip-events.ts` -- add `close: () => void` to `TripSubscriber`; add `unregisterTripSubscriber(tripId, subscriber)` helper; rewrite `subscribeTripForUser`'s returned closure, `removeTripSubscribersForUser`, and `purgeTripTopic` to all route through it -- consolidates the three divergent cleanup implementations the retro found (EC-1/EC-2/AD-1/AD-2) into one.
- [x] `src/lib/trip-events.ts` -- thread a `close` param through `subscribeTripForUser`/`subscribeUser`; have `createLiveSyncResponse` pass its controller-close logic as that second arg to `subscribe(...)` -- gives force-removal a way to actually terminate the stream.
- [x] `src/lib/trip-events.ts` -- wrap the connect-time `enqueueFrame(HEARTBEAT_FRAME)` call in `createLiveSyncResponse` in try/catch with `console.warn`, matching `deliverToTripSubscribers`/`deliverToUserSubscribers` -- closes EC-3.
- [x] `src/app/api/trips/[tripId]/events/route.ts` -- forward the `close` callback into `subscribeTripForUser` so trip connections (the only topic type with a force-removal path today) actually get force-closed.
- [x] `src/lib/trip-events.test.ts` and `src/app/api/trips/[tripId]/events/route.test.ts` -- add tests: force-removal closes the subscriber's stream and prunes an emptied topic from `tripTopics`; `purgeTripTopic` closes every subscriber's stream and stops the idle scheduler; unsubscribe remains idempotent; synchronous cleanup still runs the returned unsubscribe; the route forwards working stream cleanup; a throwing connect-time flush doesn't crash `createLiveSyncResponse`.

**Acceptance Criteria:**

- Given a user has two open SSE tabs on a trip topic, when `removeTripSubscribersForUser` force-removes them, then both connections' streams are closed and neither receives further published events.
- Given a trip topic's last subscriber is force-removed or the topic is purged, when the heartbeat scheduler next ticks, then no stale empty entry remains in `tripTopics`, and the scheduler stops once no topic anywhere has a subscriber.
- Given the connect-time heartbeat flush throws, when a client connects, then the error is logged via `console.warn` and stream setup still completes (abort listener attached, no unhandled exception escaping `ReadableStream.start()`).

## Spec Change Log

- Review patch: made subscriber removal idempotent, handled synchronous cleanup before `subscribe` returns, and added route-level stream-closure plus scheduler-stop verification.

## Design Notes

`unregisterTripSubscriber` takes the `tripId` and the `TripSubscriber` record itself (not just a userId/callback) so it can look up the correct Set, delete the exact entry, prune the topic when empty, and stop the idle scheduler — the same three steps every existing unsubscribe closure already does inline:

```ts
function unregisterTripSubscriber(tripId: string, subscriber: TripSubscriber): void {
  const subscribers = tripTopics.get(tripId);
  if (!subscribers?.delete(subscriber)) return;
  if (subscribers.size === 0 && tripTopics.get(tripId) === subscribers) {
    tripTopics.delete(tripId);
  }
  stopHeartbeatSchedulerIfIdle();
  subscriber.close();
}
```

`close` is passed in from the route side (via `createLiveSyncResponse`) rather than trip-events.ts reaching into the `ReadableStreamDefaultController` itself, keeping the module's only DOM/stream dependency at the route boundary where it already lives.

## Verification

**Commands:**

- `npx vitest run src/lib/trip-events.test.ts src/app/api/trips/[tripId]/events/route.test.ts` -- expected: all pass, including force-removal, purge, idempotency, synchronous-cleanup, route-closure, and throw-isolation cases.
- `npx tsc --noEmit` -- expected: no type errors from the new `close` param threading through the trip events route.

**Manual checks (if no CLI):**

- None beyond the automated suite; this is internal reliability plumbing with no user-facing surface, so no E2E scenario applies (unit layer is the correct and sufficient layer per the testing pyramid).

## Suggested Review Order

**Unified subscriber teardown**

- Centralizes deletion, topic pruning, scheduler cleanup, and idempotent stream closure.
  [`trip-events.ts:148`](../../src/lib/trip-events.ts#L148)

- Stores controller cleanup with each trip subscriber for later force-removal.
  [`trip-events.ts:176`](../../src/lib/trip-events.ts#L176)

- Snapshots matching subscribers so mutation cannot skip concurrent tabs.
  [`trip-events.ts:226`](../../src/lib/trip-events.ts#L226)

- Routes whole-topic purge through identical per-subscriber cleanup.
  [`trip-events.ts:240`](../../src/lib/trip-events.ts#L240)

**Response lifecycle**

- Handles synchronous cleanup, aborts, controller closure, and guarded initial heartbeat delivery.
  [`trip-events.ts:271`](../../src/lib/trip-events.ts#L271)

- Forwards response cleanup across route-to-topic subscription boundary.
  [`route.ts:11`](../../src/app/api/trips/%5BtripId%5D/events/route.ts#L11)

**Verification**

- Proves normal unsubscribe remains idempotent.
  [`trip-events.test.ts:89`](../../src/lib/trip-events.test.ts#L89)

- Proves force-removal closes real response streams while preserving other users.
  [`trip-events.test.ts:232`](../../src/lib/trip-events.test.ts#L232)

- Proves purge closes every subscriber and stops idle heartbeat scheduling.
  [`trip-events.test.ts:283`](../../src/lib/trip-events.test.ts#L283)

- Proves route-provided cleanup closes response body.
  [`route.test.ts:94`](../../src/app/api/trips/%5BtripId%5D/events/route.test.ts#L94)

- Proves initial heartbeat failure stays logged and non-fatal.
  [`trip-events.test.ts:539`](../../src/lib/trip-events.test.ts#L539)

**Deferred scope**

- Records client fan-out isolation as separate follow-up work.
  [`deferred-work.md:93`](deferred-work.md#L93)
