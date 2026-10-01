---
title: "SSE Pub-Sub Infrastructure and Both Routes"
type: "feature"
created: "2026-09-04"
status: "done"
review_loop_iteration: 0
context: []
baseline_commit: "adf46b28c93c3dd18382941ecaa0ca4017852d7a"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Contributors today can only see other people's trip changes by manually refreshing — there is no server mechanism that notifies an open session when relevant state changes, so live sync (FR8) and immediate revocation (FR9) have no foundation.

**Approach:** Ship an in-process pub-sub bus (`src/lib/trip-events.ts`, `globalThis`-singleton maps mirroring `src/db/index.ts`), two SSE Route Handlers (`GET /api/trips/[tripId]/events` and `GET /api/users/me/events`) that stream that bus to open sessions, and instrument existing server actions to publish typed events after their writes commit. No client-side consumers yet — those land in Stories 4.2–4.5; this story's routes must work and pass tests standing alone.

## Boundaries & Constraints

**Always:**
- `trip-events.ts` holds two topic maps on `globalThis` (`trip:{tripId}`, `user:{userId}`), same lazy-init shape as `src/db/index.ts` (`declare global`, `?? new Map()`, assign when `NODE_ENV !== "production"`).
- Event types live in `src/data/types.ts` as a const-object + discriminated union (`LiveSyncEventType`, `LiveSyncEvent`): `itinerary-changed`, `membership-changed`, `membership-removed`, `trip-deleted`. Payloads minimal (`membership-removed` carries `{removedUserId, tripId, tripName, removedByName, removedByEmail}`).
- Route gating: trip route = `requireUser()` then `assertTripAccess(tripId, userId, "viewer")`; user route = `requireUser()` only. Both before any subscription.
- Trips route subscribes keyed by `userId` so a contributor removal can force-unsubscribe exactly that user's connection(s); user route subscribes by the session user's `userId`.
- Every subscriber is removed when its request's `AbortSignal` fires (and interval cleared) — no dead-subscriber accumulation.
- Actions publish AFTER the write commits, BEFORE `revalidatePath`. Delivery is guarded per subscriber (one throwing subscriber never breaks the action or other subscribers).
- A contributor removal force-unsubscribes that user's `trip:{tripId}` subscribers in the same operation as the commit, publishes `membership-removed` to `user:{userId}` and `membership-changed` to `trip:{tripId}` (open share dialogs refetch on it); `deleteTrip` publishes `trip-deleted` then purges the trip topic. A role change alone publishes nothing in this story — that producer lands with its consumer in Story 4.3. `itinerary-changed` publishing is scoped to the mutation actions in `src/app/(app)/trips/[tripId]/actions.ts` only.
- SSE encoding is defined in `trip-events.ts` (`data: {json}\n\n` events; heartbeat as a `: ping\n\n` comment) so it is coverage-tested; routes just enqueue it. Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-store, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
- No new dependencies, no schema/DB changes, single-process assumption (multi-instance fan-out stays deferred).

**Ask First:**
- `SSE_HEARTBEAT_INTERVAL_MS` default `15_000` (15s survives common proxy idle timeouts). Adjust only if you want a different cadence.

**Never:**
- No Redis/external pub-sub, no `use-live-sync.ts`, no `sync-status-indicator` (Story 4.2), no refetch-on-event/revocation-modal wiring (4.3/4.4), no client `EventSource` code.
- Do not publish from budget, reservations, transit, or packing action files in this story (deferred — Story 4.3 decides).
- No new DB tables/columns/migrations; do not add a version/optimistic-lock column (CAP-10 stays latest-write-wins).

## I/O & Edge-Case Matrix

| Scenario   | Input / State | Expected Output / Behavior | Error Handling |
| ---------- | ------------- | -------------------------- | -------------- |
| HAPPY_PATH | itinerary action commits; trip route open | every `trip:{tripId}` subscriber receives `itinerary-changed` | per-subscriber delivery guarded |
| GATING     | GET trip route, no session / below viewer | `requireUser()` redirect; `assertTripAccess` `notFound()` — before subscribe | handled by helpers |
| IDLE       | open SSE connection, no events | heartbeat comment emitted every interval; stream stays open | N/A |
| DISCONNECT | client closes/tab closes/navigates | `AbortSignal` fires → subscriber removed + interval cleared | cleanup idempotent |
| REMOVAL    | `saveContributorChanges` removal commits | `publishUserEvent` `membership-removed`; `publishTripEvent` `membership-changed`; `removeTripSubscribersForUser(tripId, removedUserId)` | publish guarded per subscriber |
| DELETE     | `deleteTrip` commits | `trip-deleted` published to `trip:{tripId}`; trip topic purged | N/A |

## Code Map

- `src/db/index.ts` (`L5-10`) -- the `globalThis` singleton pattern `trip-events.ts` mirrors.
- `src/data/types.ts` (`L34-39`) -- `CollaboratorRole` const-object precedent; new `LiveSyncEventType`/`LiveSyncEvent` added here.
- `src/lib/trip-events.ts` -- NEW. Pub-sub bus + `SSE_HEARTBEAT_INTERVAL_MS` + `formatSseEvent`/`formatSseHeartbeat`. Colocated `trip-events.test.ts` (must satisfy coverage).
- `src/app/api/trips/[tripId]/events/route.ts` -- NEW. Trip SSE route: `requireUser` → `assertTripAccess(...,"viewer")` → `subscribeTripForUser(tripId, userId, cb)` → heartbeat → abort cleanup → `new Response(stream, { headers })`.
- `src/app/api/users/me/events/route.ts` -- NEW. User SSE route: `requireUser` → `subscribeUser(userId, cb)` → same heartbeat/cleanup.
- `src/app/api/storage/[...path]/route.ts` + `route.test.ts` -- conventions to mirror: Promise-typed `params`, `new Response(stream, { headers })`, hoisted `vi.mock` auth helpers, `@vitest-environment node`.
- `src/lib/auth-helpers.ts` (`requireUser` L14-18, `assertTripAccess` L23-37) -- gating helpers for both routes.
- `src/app/(app)/trips/[tripId]/actions.ts` -- 25+ mutation actions (createEvent L207-220 commit, updateEvent L229-241, deleteEvent L252, addDay L385-393, removeLastDay L453, createNote L553-558, createChecklistItem L737, toggleChecklistItem L753-756, deleteEventWithDocDecision L283, reorderDayItems L332-346, …). Each publishes `itinerary-changed` after commit. Colocated `actions.test.ts`.
- `src/app/(app)/trips/actions.ts` -- `acceptInvitation` L781 (TODO(epic-4) L832-833 → publish to trip + user channels), `declineInvitation` L841 (TODO L866-867 → both), `rescindInvitation` L875 (TODO L892-894 → trip channel), `deleteTrip` L639 (commit L645 + reval L658; publish `trip-deleted` + purge), `saveContributorChanges` L950 (role→`membership-changed` trip channel; remove L1011 → `membership-removed` + force-unsub). Colocated `actions.test.ts`.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` + `01-app/02-guides/streaming.md` -- read before writing the routes (Promised `params`, streaming `Response`, SSE guidance).

## Tasks & Acceptance

**Execution:**

- [x] `src/data/types.ts` -- add `LiveSyncEventType` const object + `LiveSyncEvent` discriminated union -- typed event contract for pub/sub and routes.
- [x] `src/lib/trip-events.ts` -- implement topic maps, `publishTripEvent`, `publishUserEvent`, `subscribeTripForUser` (returns unsubscribe → callback removed on the entry's `AbortSignal`), `subscribeUser`, `removeTripSubscribersForUser`, `purgeTripTopic`, `SSE_HEARTBEAT_INTERVAL_MS`, `formatSseEvent`, `formatSseHeartbeat` -- the bus. Guard per-subscriber delivery.
- [x] `src/lib/trip-events.test.ts` -- unit tests (delivery, multi-subscriber, user topic, unsubscribe, force-unsub by user, purge, throw-guard, SSE format, interval constant) -- coverage-gated.
- [x] `src/app/api/trips/[tripId]/events/route.ts` -- gated trip SSE route with heartbeat + abort cleanup (`subscribeTripForUser`) -- server-side live channel.
- [x] `src/app/api/users/me/events/route.ts` -- `requireUser`-only user SSE route with heartbeat + abort cleanup (`subscribeUser`) -- personal channel for membership events.
- [x] route tests for both -- unauthenticated/below-viewer gating, subscriber wired with session user, event flows through the stream, abort deregisters, idle emits heartbeat (fake timers) -- mirror `storage/[...path]/route.test.ts`.
- [x] `src/app/(app)/trips/[tripId]/actions.ts` -- after each committed mutation, `publishTripEvent(tripId, {type:"itinerary-changed", tripId})` before `revalidatePath` -- choose one call-site form & apply uniformly (25+ actions).
- [x] `[tripId]/actions.test.ts` -- assert representative actions (createEvent, updateEvent, deleteEvent, addDay, removeLastDay, deleteEventWithDocDecision) publish `itinerary-changed`; existing suites keep passing (add `vi.mock("@/lib/trip-events", ...)` where asserting).
- [x] `src/app/(app)/trips/actions.ts` -- publish: `acceptInvitation`/`declineInvitation` → `membership-changed` on trip + user channels; `rescindInvitation` → `membership-changed` on trip channel; `deleteTrip` → `trip-deleted` on trip channel + `purgeTripTopic`; `saveContributorChanges` → per removal `membership-removed` (with trip name + acting manager identity) on user channel + `membership-changed` on trip channel + `removeTripSubscribersForUser` -- wire existing TODO(epic-4) sites + AC9/AC10.
- [x] `trips/actions.test.ts` -- assert the above publishes fire (and nothing publishes on rejected saves) -- existing suites keep passing.

### Review Findings

- [x] [Review][Patch] Publish itinerary changes after document and cover uploads [src/app/(app)/trips/[tripId]/document-upload-actions.ts:28]
- [x] [Review][Patch] Clean up SSE resources when request aborts during authorization [src/app/api/trips/[tripId]/events/route.ts:22]
- [x] [Review][Patch] Remove empty pub-sub topic entries after final unsubscribe [src/lib/trip-events.ts:82]
- [x] [Review][Patch] Read removal notification trip name before releasing transaction lock [src/app/(app)/trips/actions.ts:1029]
- [x] [Review][Patch] Verify trip-deleted delivery precedes topic purge [src/app/(app)/trips/actions.test.ts:193]

**Acceptance Criteria:**

- Given `trip-events.ts`, when `publishTripEvent(tripId, event)` runs, then every subscriber on `trip:{tripId}` receives it in-process; likewise `publishUserEvent` on `user:{userId}`.
- Given `GET /api/trips/[tripId]/events`, when unauthenticated or below viewer, then `requireUser()`/`assertTripAccess` reject before any subscription is created.
- Given `GET /api/users/me/events`, when authenticated, then it subscribes to `user:{userId}` for that user only (no trip check).
- Given either open connection, when no event arrives for an interval, then a heartbeat comment keeps the connection alive.
- Given an open trip connection, when an itinerary mutation commits, then the client receives `itinerary-changed`.
- Given an open connection, when its `AbortSignal` fires, then the subscriber is removed from its topic's `Set` immediately.
- Given a contributor removed while their trip connection is open, then that user's `trip:{tripId}` subscriber is force-unsubscribed in the same operation.
- Given `deleteTrip` with open connections, then `trip-deleted` publishes to `trip:{tripId}` and the topic is purged.

## Spec Change Log

## Design Notes

- **Force-unsubscribe shape:** `subscribeTripForUser(tripId, userId, cb)` tags each entry with the session `userId` so a removal can drop exactly the removed user's connections through `removeTripSubscribersForUser`. Multiple tabs for the same user are all removed — matching "removed while their connection is open".
- **Publish-after-commit ordering:** every publish sits between the DB write and `revalidatePath`. A publish is best-effort — it must never fail the mutation. Per-subscriber `try/catch` keeps one dead connection from poisoning the bus.
- **Deletion lifecycle:** `deleteTrip` publishes `trip-deleted` then `purgeTripTopic`. The topic set is emptied (no leak); making the client close its own stream on `trip-deleted` is consumer logic arriving in 4.3/4.4 — the server never resolves the request itself.
- **Heartbeat viability:** always-send fixed-interval heartbeat satisfies "idle stays alive" without tracking per-connection last-event times; `setInterval` is cleared on `AbortSignal`. Fake timers make the interval testable in node env.
- **`membership-removed` identity:** `removedByName`/`removedByEmail` are the acting manager from the session, captured at publish time (a revoked user could never fetch them later); `removedUserId` comes from the deleted collaborator row; `tripName` from one `trips` read.

## Verification

**Commands:**

- `npx vitest run src/lib/trip-events.test.ts` -- expected: pass (new pub-sub + SSE format).
- `npx vitest run "src/app/api/trips/[tripId]/events/route.test.ts" "src/app/api/users/me/events/route.test.ts"` -- expected: pass (gating, stream, heartbeat, abort).
- `npx vitest run "src/app/(app)/trips/actions.test.ts" "src/app/(app)/trips/[tripId]/actions.test.ts"` -- expected: pass (publish assertions + untouched suites).
- `npm run test:coverage` -- expected: ≥95% lines/functions, ≥90% branches (incl. `trip-events.ts`).
- `npm run lint` + `npx tsc --noEmit` -- expected: clean.
- `npm run test:e2e:affected` -- expected: **full suite** is triggered (all touched files fall under `SHARED_GLOBS`: `src/lib/**`, `src/app/api/**`, `trips/actions.ts`, `[tripId]/actions.ts`) — must pass. No new `.feature` this story: no user-facing surface yet, and the POM pyramid puts server infra at unit level; consumers land in 4.2–4.5.
