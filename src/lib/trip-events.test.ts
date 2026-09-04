// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSyncEventType } from "@/data/types";
import {
  SSE_HEARTBEAT_INTERVAL_MS,
  formatSseEvent,
  formatSseHeartbeat,
  publishTripEvent,
  publishUserEvent,
  purgeTripTopic,
  removeTripSubscribersForUser,
  subscribeTripForUser,
  subscribeUser,
} from "./trip-events";

describe("trip-events", () => {
  beforeEach(() => {
    // Each subscribe call returns its own unsubscribe; tests clean up their own
    // subscriptions, but clear any stray console noise between tests.
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Defensive: purge every topic this suite could have touched so state never
    // leaks across tests via the globalThis singleton maps.
    purgeTripTopic("trip-1");
    purgeTripTopic("trip-2");
  });

  describe("SSE_HEARTBEAT_INTERVAL_MS", () => {
    it("defaults to 15 seconds", () => {
      expect(SSE_HEARTBEAT_INTERVAL_MS).toBe(15_000);
    });
  });

  describe("formatSseEvent / formatSseHeartbeat", () => {
    it("encodes an event as a data: line followed by a blank line", () => {
      const event = { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" } as const;
      expect(formatSseEvent(event)).toBe(`data: ${JSON.stringify(event)}\n\n`);
    });

    it("encodes a heartbeat as an SSE comment", () => {
      expect(formatSseHeartbeat()).toBe(": ping\n\n");
    });
  });

  describe("publishTripEvent / subscribeTripForUser", () => {
    it("delivers a published event to every subscriber on the topic", () => {
      const first = vi.fn();
      const second = vi.fn();
      const unsubscribeFirst = subscribeTripForUser("trip-1", "user-1", first);
      const unsubscribeSecond = subscribeTripForUser("trip-1", "user-2", second);

      const event = { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" } as const;
      publishTripEvent("trip-1", event);

      expect(first).toHaveBeenCalledWith(event);
      expect(second).toHaveBeenCalledWith(event);

      unsubscribeFirst();
      unsubscribeSecond();
    });

    it("does not deliver to subscribers on a different trip topic", () => {
      const callback = vi.fn();
      const unsubscribe = subscribeTripForUser("trip-1", "user-1", callback);

      publishTripEvent("trip-2", { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-2" });

      expect(callback).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("is a no-op when publishing to a topic with no subscribers", () => {
      expect(() =>
        publishTripEvent("trip-with-nobody-listening", {
          type: LiveSyncEventType.TripDeleted,
          tripId: "trip-with-nobody-listening",
        })
      ).not.toThrow();
    });

    it("stops delivering to a subscriber once its unsubscribe function runs", () => {
      const callback = vi.fn();
      const unsubscribe = subscribeTripForUser("trip-1", "user-1", callback);
      unsubscribe();

      publishTripEvent("trip-1", { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" });

      expect(callback).not.toHaveBeenCalled();
    });

    it("reclaims an empty trip topic after its final unsubscribe", () => {
      const unsubscribe = subscribeTripForUser("trip-3", "user-1", vi.fn());

      unsubscribe();

      expect(globalThis.__tripEventTopics?.has("trip-3")).toBe(false);
    });

    it("guards per-subscriber delivery so one throwing subscriber does not block the others", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const throwing = vi.fn(() => {
        throw new Error("boom");
      });
      const healthy = vi.fn();
      const unsubscribeThrowing = subscribeTripForUser("trip-1", "user-1", throwing);
      const unsubscribeHealthy = subscribeTripForUser("trip-1", "user-2", healthy);

      const event = { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" } as const;
      expect(() => publishTripEvent("trip-1", event)).not.toThrow();

      expect(throwing).toHaveBeenCalledWith(event);
      expect(healthy).toHaveBeenCalledWith(event);
      expect(warnSpy).toHaveBeenCalled();

      unsubscribeThrowing();
      unsubscribeHealthy();
    });
  });

  describe("publishUserEvent / subscribeUser", () => {
    it("delivers a published event to every subscriber on the user topic", () => {
      const first = vi.fn();
      const second = vi.fn();
      const unsubscribeFirst = subscribeUser("user-1", first);
      const unsubscribeSecond = subscribeUser("user-1", second);

      const event = {
        type: LiveSyncEventType.MembershipRemoved,
        removedUserId: "user-1",
        tripId: "trip-1",
        tripName: "Big Trip",
        removedByName: "Manager Name",
        removedByEmail: "manager@example.com",
      } as const;
      publishUserEvent("user-1", event);

      expect(first).toHaveBeenCalledWith(event);
      expect(second).toHaveBeenCalledWith(event);

      unsubscribeFirst();
      unsubscribeSecond();
    });

    it("does not deliver to a different user's topic", () => {
      const callback = vi.fn();
      const unsubscribe = subscribeUser("user-1", callback);

      publishUserEvent("user-2", { type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" });

      expect(callback).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("stops delivering once unsubscribed", () => {
      const callback = vi.fn();
      const unsubscribe = subscribeUser("user-1", callback);
      unsubscribe();

      publishUserEvent("user-1", { type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" });

      expect(callback).not.toHaveBeenCalled();
    });

    it("reclaims an empty user topic after its final unsubscribe", () => {
      const unsubscribe = subscribeUser("user-3", vi.fn());

      unsubscribe();

      expect(globalThis.__userEventTopics?.has("user-3")).toBe(false);
    });

    it("guards per-subscriber delivery so one throwing subscriber does not block others", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const throwing = vi.fn(() => {
        throw new Error("boom");
      });
      const healthy = vi.fn();
      const unsubscribeThrowing = subscribeUser("user-1", throwing);
      const unsubscribeHealthy = subscribeUser("user-1", healthy);

      expect(() =>
        publishUserEvent("user-1", { type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" })
      ).not.toThrow();

      expect(throwing).toHaveBeenCalled();
      expect(healthy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();

      unsubscribeThrowing();
      unsubscribeHealthy();
    });
  });

  describe("removeTripSubscribersForUser", () => {
    it("force-unsubscribes only the targeted user's connections, including multiple tabs", () => {
      const removedTabOne = vi.fn();
      const removedTabTwo = vi.fn();
      const staysSubscribed = vi.fn();
      subscribeTripForUser("trip-1", "user-removed", removedTabOne);
      subscribeTripForUser("trip-1", "user-removed", removedTabTwo);
      const unsubscribeOther = subscribeTripForUser("trip-1", "user-other", staysSubscribed);

      removeTripSubscribersForUser("trip-1", "user-removed");

      const event = { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" } as const;
      publishTripEvent("trip-1", event);

      expect(removedTabOne).not.toHaveBeenCalled();
      expect(removedTabTwo).not.toHaveBeenCalled();
      expect(staysSubscribed).toHaveBeenCalledWith(event);

      unsubscribeOther();
    });

    it("is a no-op when the trip topic has no subscribers", () => {
      expect(() => removeTripSubscribersForUser("trip-with-nobody-listening", "user-1")).not.toThrow();
    });
  });

  describe("purgeTripTopic", () => {
    it("removes every subscriber from the trip topic", () => {
      const callback = vi.fn();
      subscribeTripForUser("trip-1", "user-1", callback);

      purgeTripTopic("trip-1");

      publishTripEvent("trip-1", { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" });
      expect(callback).not.toHaveBeenCalled();
    });

    it("is a no-op when the topic does not exist", () => {
      expect(() => purgeTripTopic("trip-never-subscribed-to")).not.toThrow();
    });
  });
});
