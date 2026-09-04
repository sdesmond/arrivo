import "server-only";
import type { LiveSyncEvent } from "@/data/types";
export { SSE_HEARTBEAT_INTERVAL_MS } from "./live-sync-constants";

type LiveSyncCallback = (event: LiveSyncEvent) => void;

interface TripSubscriber {
  userId: string;
  callback: LiveSyncCallback;
}

// Same lazy-init globalThis-singleton shape as src/db/index.ts, so the maps survive
// Next.js dev-mode module reloads without piling up duplicate topic sets.
declare global {
  var __tripEventTopics: Map<string, Set<TripSubscriber>> | undefined;
  var __userEventTopics: Map<string, Set<LiveSyncCallback>> | undefined;
}

const tripTopics = globalThis.__tripEventTopics ?? new Map<string, Set<TripSubscriber>>();
if (process.env.NODE_ENV !== "production") globalThis.__tripEventTopics = tripTopics;

const userTopics = globalThis.__userEventTopics ?? new Map<string, Set<LiveSyncCallback>>();
if (process.env.NODE_ENV !== "production") globalThis.__userEventTopics = userTopics;

export function formatSseEvent(event: LiveSyncEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function formatSseHeartbeat(): string {
  return `data: ${JSON.stringify({ type: "heartbeat" })}\n\n`;
}

/**
 * Publishes an event to every subscriber on a trip's topic. Delivery is guarded
 * per-subscriber — one throwing callback never blocks the rest, or the caller.
 */
export function publishTripEvent(tripId: string, event: LiveSyncEvent): void {
  const subscribers = tripTopics.get(tripId);
  if (!subscribers) return;
  for (const subscriber of subscribers) {
    try {
      subscriber.callback(event);
    } catch (error) {
      console.warn(`Live sync subscriber threw while delivering to trip:${tripId}`, error);
    }
  }
}

/**
 * Publishes an event to every subscriber on a user's personal topic. Delivery is
 * guarded per-subscriber — one throwing callback never blocks the rest, or the caller.
 */
export function publishUserEvent(userId: string, event: LiveSyncEvent): void {
  const subscribers = userTopics.get(userId);
  if (!subscribers) return;
  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch (error) {
      console.warn(`Live sync subscriber threw while delivering to user:${userId}`, error);
    }
  }
}

/**
 * Subscribes a callback to a trip's topic, tagged with the subscribing session's
 * userId so a contributor removal can force-unsubscribe exactly that user's
 * connection(s) via removeTripSubscribersForUser. Returns an unsubscribe function
 * the route wires to its request's AbortSignal.
 */
export function subscribeTripForUser(tripId: string, userId: string, callback: LiveSyncCallback): () => void {
  let subscribers = tripTopics.get(tripId);
  if (!subscribers) {
    subscribers = new Set<TripSubscriber>();
    tripTopics.set(tripId, subscribers);
  }

  const subscriber: TripSubscriber = { userId, callback };
  subscribers.add(subscriber);

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && tripTopics.get(tripId) === subscribers) {
      tripTopics.delete(tripId);
    }
  };
}

/**
 * Subscribes a callback to a user's personal topic. Returns an unsubscribe
 * function the route wires to its request's AbortSignal.
 */
export function subscribeUser(userId: string, callback: LiveSyncCallback): () => void {
  let subscribers = userTopics.get(userId);
  if (!subscribers) {
    subscribers = new Set<LiveSyncCallback>();
    userTopics.set(userId, subscribers);
  }

  subscribers.add(callback);

  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0 && userTopics.get(userId) === subscribers) {
      userTopics.delete(userId);
    }
  };
}

/**
 * Force-unsubscribes every connection a specific user holds on a trip's topic —
 * used when a contributor is removed while their session may still be open.
 * Removes all of that user's connections (e.g. multiple open tabs).
 */
export function removeTripSubscribersForUser(tripId: string, userId: string): void {
  const subscribers = tripTopics.get(tripId);
  if (!subscribers) return;
  for (const subscriber of subscribers) {
    if (subscriber.userId === userId) {
      subscribers.delete(subscriber);
    }
  }
}

/**
 * Empties and removes a trip's topic entirely — called after publishing
 * trip-deleted so no dead entry lingers on the map.
 */
export function purgeTripTopic(tripId: string): void {
  tripTopics.get(tripId)?.clear();
  tripTopics.delete(tripId);
}
