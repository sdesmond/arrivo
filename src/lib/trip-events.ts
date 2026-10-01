import "server-only";
import type { LiveSyncEvent } from "@/data/types";
import { SSE_HEARTBEAT_INTERVAL_MS } from "./live-sync-constants";
export { SSE_HEARTBEAT_INTERVAL_MS } from "./live-sync-constants";

// The heartbeat's wire shape stays an internal literal/type local to this file rather than a
// LiveSyncEventType member — deferred to keep src/data/types.ts limited to real, typed events (see
// deferred-work.md). SseFrame is the delivery-time union: everything that can travel through a
// subscriber callback, whether published via publishTripEvent/publishUserEvent or ticked by the
// heartbeat scheduler below.
interface HeartbeatFrame {
  type: "heartbeat";
}

const HEARTBEAT_FRAME: HeartbeatFrame = { type: "heartbeat" };

type SseFrame = LiveSyncEvent | HeartbeatFrame;

type LiveSyncCallback = (frame: SseFrame) => void;

interface TripSubscriber {
  userId: string;
  callback: LiveSyncCallback;
  close: () => void;
}

// Same lazy-init globalThis-singleton shape as src/db/index.ts, so the maps survive
// Next.js dev-mode module reloads without piling up duplicate topic sets.
declare global {
  var __tripEventTopics: Map<string, Set<TripSubscriber>> | undefined;
  var __userEventTopics: Map<string, Set<LiveSyncCallback>> | undefined;
  var __liveSyncHeartbeatTimer: ReturnType<typeof setInterval> | undefined;
}

const tripTopics = globalThis.__tripEventTopics ?? new Map<string, Set<TripSubscriber>>();
if (process.env.NODE_ENV !== "production") globalThis.__tripEventTopics = tripTopics;

const userTopics = globalThis.__userEventTopics ?? new Map<string, Set<LiveSyncCallback>>();
if (process.env.NODE_ENV !== "production") globalThis.__userEventTopics = userTopics;

export function formatSseEvent(event: LiveSyncEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function formatSseHeartbeat(): string {
  return `data: ${JSON.stringify(HEARTBEAT_FRAME)}\n\n`;
}

/**
 * Delivers a frame (real event or heartbeat) to every subscriber on a trip's topic. Delivery is
 * guarded per-subscriber — one throwing callback never blocks the rest, or the caller. Shared by
 * publishTripEvent and the heartbeat scheduler so a heartbeat proves the exact same fan-out path a
 * real event would take.
 */
function deliverToTripSubscribers(tripId: string, frame: SseFrame): void {
  const subscribers = tripTopics.get(tripId);
  if (!subscribers) return;
  for (const subscriber of subscribers) {
    try {
      subscriber.callback(frame);
    } catch (error) {
      console.warn(`Live sync subscriber threw while delivering to trip:${tripId}`, error);
      unregisterTripSubscriber(tripId, subscriber);
    }
  }
}

/**
 * Delivers a frame (real event or heartbeat) to every subscriber on a user's personal topic.
 * Delivery is guarded per-subscriber — one throwing callback never blocks the rest, or the caller.
 * Shared by publishUserEvent and the heartbeat scheduler so a heartbeat proves the exact same
 * fan-out path a real event would take.
 */
function deliverToUserSubscribers(userId: string, frame: SseFrame): void {
  const subscribers = userTopics.get(userId);
  if (!subscribers) return;
  for (const subscriber of subscribers) {
    try {
      subscriber(frame);
    } catch (error) {
      console.warn(`Live sync subscriber threw while delivering to user:${userId}`, error);
      unregisterUserSubscriber(userId, subscriber);
    }
  }
}

/**
 * Publishes an event to every subscriber on a trip's topic. Delivery is guarded per-subscriber —
 * one throwing callback never blocks the rest, or the caller.
 */
export function publishTripEvent(tripId: string, event: LiveSyncEvent): void {
  deliverToTripSubscribers(tripId, event);
}

/**
 * Publishes an event to every subscriber on a user's personal topic. Delivery is guarded
 * per-subscriber — one throwing callback never blocks the rest, or the caller.
 */
export function publishUserEvent(userId: string, event: LiveSyncEvent): void {
  deliverToUserSubscribers(userId, event);
}

/**
 * Ticks every trip and user topic once, delivering a heartbeat through the exact same
 * per-subscriber delivery loop publishTripEvent/publishUserEvent use. This is what makes the
 * heartbeat prove the pub/sub fan-out actually reaches each subscriber, rather than only proving
 * the HTTP connection is open (a per-route setInterval never touched tripTopics/userTopics at
 * all, so a broken fan-out reported as healthy indefinitely).
 */
function tickHeartbeat(): void {
  for (const tripId of tripTopics.keys()) {
    deliverToTripSubscribers(tripId, HEARTBEAT_FRAME);
  }
  for (const userId of userTopics.keys()) {
    deliverToUserSubscribers(userId, HEARTBEAT_FRAME);
  }
}

/**
 * Lazily starts the module-level heartbeat scheduler, guarded by the same globalThis-singleton
 * pattern as tripTopics/userTopics above so dev-mode HMR can't spawn duplicate intervals. Called
 * from every subscribe so the scheduler is running whenever at least one subscriber exists,
 * without needing a second cadence source beyond SSE_HEARTBEAT_INTERVAL_MS. Paired with
 * stopHeartbeatSchedulerIfIdle, which every unsubscribe calls to clear the interval once the last
 * subscriber is gone — unlike tripTopics/userTopics, a setInterval has no other way to reclaim
 * itself, so leaving it out would tick forever once anyone had ever subscribed.
 */
function ensureHeartbeatScheduler(): void {
  if (globalThis.__liveSyncHeartbeatTimer !== undefined) return;
  globalThis.__liveSyncHeartbeatTimer = setInterval(tickHeartbeat, SSE_HEARTBEAT_INTERVAL_MS);
}

function clearHeartbeatTimer(): void {
  if (globalThis.__liveSyncHeartbeatTimer !== undefined) {
    clearInterval(globalThis.__liveSyncHeartbeatTimer);
    globalThis.__liveSyncHeartbeatTimer = undefined;
  }
}

/**
 * Stops the module-level heartbeat scheduler once no trip or user topic has any subscriber left,
 * so an idle process doesn't keep an interval alive forever after its last connection closed.
 * Called from every unsubscribe, after that subscriber's topic bookkeeping runs.
 */
function stopHeartbeatSchedulerIfIdle(): void {
  if (tripTopics.size > 0 || userTopics.size > 0) return;
  clearHeartbeatTimer();
}

function unregisterTripSubscriber(tripId: string, subscriber: TripSubscriber): void {
  const subscribers = tripTopics.get(tripId);
  if (!subscribers?.delete(subscriber)) return;
  if (subscribers.size === 0 && tripTopics.get(tripId) === subscribers) {
    tripTopics.delete(tripId);
  }
  stopHeartbeatSchedulerIfIdle();
  subscriber.close();
}

function unregisterUserSubscriber(userId: string, callback: LiveSyncCallback): void {
  const subscribers = userTopics.get(userId);
  if (!subscribers?.delete(callback)) return;
  if (subscribers.size === 0 && userTopics.get(userId) === subscribers) {
    userTopics.delete(userId);
  }
  stopHeartbeatSchedulerIfIdle();
}

/**
 * Test-only teardown for the module-level heartbeat scheduler timer, the same way purgeTripTopic
 * resets topic state below. Without this, a subscribe call under real timers in one test leaves a
 * live setInterval ticking (and keeping the process alive) across the rest of the Vitest file —
 * and under fake timers, a leftover interval from a prior test is a real (unfaked) handle that
 * `vi.advanceTimersByTime` can't drive. Call it in beforeEach/afterEach in any suite that
 * subscribes against the real module.
 */
export function resetLiveSyncHeartbeatSchedulerForTest(): void {
  clearHeartbeatTimer();
}

/**
 * Subscribes a callback to a trip's topic, tagged with the subscribing session's
 * userId so a contributor removal can force-unsubscribe exactly that user's
 * connection(s) via removeTripSubscribersForUser. Returns an unsubscribe function
 * the route wires to its request's AbortSignal.
 */
export function subscribeTripForUser(
  tripId: string,
  userId: string,
  callback: LiveSyncCallback,
  close: () => void
): () => void {
  ensureHeartbeatScheduler();

  let subscribers = tripTopics.get(tripId);
  if (!subscribers) {
    subscribers = new Set<TripSubscriber>();
    tripTopics.set(tripId, subscribers);
  }

  const subscriber: TripSubscriber = { userId, callback, close };
  subscribers.add(subscriber);

  return () => unregisterTripSubscriber(tripId, subscriber);
}

/**
 * Subscribes a callback to a user's personal topic. Returns an unsubscribe
 * function the route wires to its request's AbortSignal.
 */
export function subscribeUser(userId: string, callback: LiveSyncCallback, close: () => void = () => {}): () => void {
  void close;
  ensureHeartbeatScheduler();

  let subscribers = userTopics.get(userId);
  if (!subscribers) {
    subscribers = new Set<LiveSyncCallback>();
    userTopics.set(userId, subscribers);
  }

  subscribers.add(callback);

  return () => unregisterUserSubscriber(userId, callback);
}

/**
 * Force-unsubscribes every connection a specific user holds on a trip's topic —
 * used when a contributor is removed while their session may still be open.
 * Removes all of that user's connections (e.g. multiple open tabs).
 */
export function removeTripSubscribersForUser(tripId: string, userId: string): void {
  const subscribers = tripTopics.get(tripId);
  if (!subscribers) return;
  for (const subscriber of [...subscribers]) {
    if (subscriber.userId === userId) {
      unregisterTripSubscriber(tripId, subscriber);
    }
  }
}

/**
 * Empties and removes a trip's topic entirely — called after publishing
 * trip-deleted so no dead entry lingers on the map.
 */
export function purgeTripTopic(tripId: string): void {
  const subscribers = tripTopics.get(tripId);
  if (!subscribers) return;
  for (const subscriber of [...subscribers]) {
    unregisterTripSubscriber(tripId, subscriber);
  }
}

const SSE_RESPONSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/**
 * Builds the Response both SSE routes return: shared headers plus a stream wired to whichever
 * subscribe function the caller passes (subscribeUser or subscribeTripForUser, already bound to
 * its userId/tripId args) — subscribe, immediate connect flush, and abort cleanup all live here so
 * the two route handlers don't duplicate this setup.
 *
 * The immediate heartbeat flush fires once synchronously on a live signal so the response flushes
 * right away — without an initial byte the client's connection can sit unopened for a full
 * heartbeat interval, racing any "Connected" assertion tied to that interval length. It is a
 * one-time connect signal, not part of the periodic scheduler's cadence.
 *
 * If the signal is already aborted when the stream starts, subscribe still runs (so its
 * unsubscribe is available to clean up), but no flush is attempted and cleanup fires immediately —
 * enqueueing into a controller that's about to close throws "Invalid state: Controller is already
 * closed".
 */
export function createLiveSyncResponse(
  signal: AbortSignal,
  subscribe: (callback: (frame: SseFrame) => void, close: () => void) => () => void
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueueFrame = (frame: SseFrame) => {
        const payload = frame.type === "heartbeat" ? formatSseHeartbeat() : formatSseEvent(frame);
        controller.enqueue(encoder.encode(payload));
      };

      let cleanedUp = false;
      let unsubscribe = () => {};
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed — nothing to do.
        }
      };

      unsubscribe = subscribe(enqueueFrame, cleanup);
      if (cleanedUp) unsubscribe();

      if (signal.aborted) {
        cleanup();
        return;
      }

      try {
        enqueueFrame(HEARTBEAT_FRAME);
      } catch (error) {
        console.warn("Live sync heartbeat flush failed while opening connection", error);
      }
      signal.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, { headers: SSE_RESPONSE_HEADERS });
}
