// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSyncEventType } from "@/data/types";
import { SSE_HEARTBEAT_INTERVAL_MS } from "./live-sync-constants";
import {
  createLiveSyncResponse,
  formatSseEvent,
  formatSseHeartbeat,
  publishTripEvent,
  publishUserEvent,
  purgeTripTopic,
  removeTripSubscribersForUser,
  resetLiveSyncHeartbeatSchedulerForTest,
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
    // Every subscribe call above lazily starts the module-level heartbeat scheduler. Without this,
    // a subscribe under real timers leaves a live setInterval ticking past this test into the rest
    // of the file.
    resetLiveSyncHeartbeatSchedulerForTest();
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

    it("encodes a heartbeat as an observable data event", () => {
      expect(formatSseHeartbeat()).toBe('data: {"type":"heartbeat"}\n\n');
    });
  });

  describe("publishTripEvent / subscribeTripForUser", () => {
    it("delivers a published event to every subscriber on the topic", () => {
      const first = vi.fn();
      const second = vi.fn();
      const unsubscribeFirst = subscribeTripForUser("trip-1", "user-1", first, vi.fn());
      const unsubscribeSecond = subscribeTripForUser("trip-1", "user-2", second, vi.fn());

      const event = { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" } as const;
      publishTripEvent("trip-1", event);

      expect(first).toHaveBeenCalledWith(event);
      expect(second).toHaveBeenCalledWith(event);

      unsubscribeFirst();
      unsubscribeSecond();
    });

    it("does not deliver to subscribers on a different trip topic", () => {
      const callback = vi.fn();
      const unsubscribe = subscribeTripForUser("trip-1", "user-1", callback, vi.fn());

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
      const close = vi.fn();
      const unsubscribe = subscribeTripForUser("trip-1", "user-1", callback, close);
      unsubscribe();
      unsubscribe();

      publishTripEvent("trip-1", { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" });

      expect(callback).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledOnce();
    });

    it("reclaims an empty trip topic after its final unsubscribe", () => {
      const unsubscribe = subscribeTripForUser("trip-3", "user-1", vi.fn(), vi.fn());

      unsubscribe();

      expect(globalThis.__tripEventTopics?.has("trip-3")).toBe(false);
    });

    it("guards per-subscriber delivery so one throwing subscriber does not block the others", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const throwing = vi.fn(() => {
        throw new Error("boom");
      });
      const healthy = vi.fn();
      const unsubscribeThrowing = subscribeTripForUser("trip-1", "user-1", throwing, vi.fn());
      const unsubscribeHealthy = subscribeTripForUser("trip-1", "user-2", healthy, vi.fn());

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
    it("force-unsubscribes and closes only the targeted user's connections, including multiple tabs", () => {
      const removedTabOne = vi.fn();
      const removedTabTwo = vi.fn();
      const staysSubscribed = vi.fn();
      const closeRemovedTabOne = vi.fn();
      const closeRemovedTabTwo = vi.fn();
      const closeOther = vi.fn();
      subscribeTripForUser("trip-1", "user-removed", removedTabOne, closeRemovedTabOne);
      subscribeTripForUser("trip-1", "user-removed", removedTabTwo, closeRemovedTabTwo);
      const unsubscribeOther = subscribeTripForUser("trip-1", "user-other", staysSubscribed, closeOther);

      removeTripSubscribersForUser("trip-1", "user-removed");

      const event = { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" } as const;
      publishTripEvent("trip-1", event);

      expect(removedTabOne).not.toHaveBeenCalled();
      expect(removedTabTwo).not.toHaveBeenCalled();
      expect(staysSubscribed).toHaveBeenCalledWith(event);
      expect(closeRemovedTabOne).toHaveBeenCalledOnce();
      expect(closeRemovedTabTwo).toHaveBeenCalledOnce();
      expect(closeOther).not.toHaveBeenCalled();

      unsubscribeOther();
    });

    it("closes every targeted response stream while another user's stream stays open", async () => {
      const firstRemovedResponse = createLiveSyncResponse(new AbortController().signal, (callback, close) =>
        subscribeTripForUser("trip-1", "user-removed", callback, close)
      );
      const secondRemovedResponse = createLiveSyncResponse(new AbortController().signal, (callback, close) =>
        subscribeTripForUser("trip-1", "user-removed", callback, close)
      );
      const otherController = new AbortController();
      const otherResponse = createLiveSyncResponse(otherController.signal, (callback, close) =>
        subscribeTripForUser("trip-1", "user-other", callback, close)
      );
      const firstRemovedReader = firstRemovedResponse.body!.getReader();
      const secondRemovedReader = secondRemovedResponse.body!.getReader();
      const otherReader = otherResponse.body!.getReader();
      await Promise.all([firstRemovedReader.read(), secondRemovedReader.read(), otherReader.read()]);

      removeTripSubscribersForUser("trip-1", "user-removed");

      const [firstRemovedResult, secondRemovedResult] = await Promise.all([
        firstRemovedReader.read(),
        secondRemovedReader.read(),
      ]);
      expect(firstRemovedResult.done).toBe(true);
      expect(secondRemovedResult.done).toBe(true);

      const event = { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" } as const;
      publishTripEvent("trip-1", event);
      const otherResult = await otherReader.read();
      expect(new TextDecoder().decode(otherResult.value)).toBe(formatSseEvent(event));

      otherController.abort();
      await Promise.resolve();
    });

    it("closes the final subscriber, prunes the topic, and stops the idle scheduler", () => {
      const close = vi.fn();
      subscribeTripForUser("trip-1", "user-removed", vi.fn(), close);

      removeTripSubscribersForUser("trip-1", "user-removed");

      expect(close).toHaveBeenCalledOnce();
      expect(globalThis.__tripEventTopics?.has("trip-1")).toBe(false);
      expect(globalThis.__liveSyncHeartbeatTimer).toBeUndefined();
    });

    it("is a no-op when the trip topic has no subscribers", () => {
      expect(() => removeTripSubscribersForUser("trip-with-nobody-listening", "user-1")).not.toThrow();
    });
  });

  describe("purgeTripTopic", () => {
    it("closes and removes every subscriber from the trip topic", () => {
      const firstCallback = vi.fn();
      const secondCallback = vi.fn();
      const closeFirst = vi.fn();
      const closeSecond = vi.fn();
      subscribeTripForUser("trip-1", "user-1", firstCallback, closeFirst);
      subscribeTripForUser("trip-1", "user-2", secondCallback, closeSecond);

      purgeTripTopic("trip-1");

      publishTripEvent("trip-1", { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" });
      expect(firstCallback).not.toHaveBeenCalled();
      expect(secondCallback).not.toHaveBeenCalled();
      expect(closeFirst).toHaveBeenCalledOnce();
      expect(closeSecond).toHaveBeenCalledOnce();
      expect(globalThis.__tripEventTopics?.has("trip-1")).toBe(false);
      expect(globalThis.__liveSyncHeartbeatTimer).toBeUndefined();
    });

    it("is a no-op when the topic does not exist", () => {
      expect(() => purgeTripTopic("trip-never-subscribed-to")).not.toThrow();
    });
  });

  describe("periodic heartbeat scheduler", () => {
    beforeEach(() => {
      // Any earlier test's subscribe call may have started the scheduler under real timers.
      // Clear it before switching to fake timers so this describe's own subscribe calls start a
      // fresh, fake-timer-controlled interval instead of leaving that real one ticking unseen.
      resetLiveSyncHeartbeatSchedulerForTest();
      vi.useFakeTimers();
    });

    afterEach(() => {
      resetLiveSyncHeartbeatSchedulerForTest();
      vi.useRealTimers();
    });

    it("delivers a heartbeat to every trip and user subscriber through the shared delivery path", () => {
      const tripSubscriber = vi.fn();
      const userSubscriber = vi.fn();
      const unsubscribeTrip = subscribeTripForUser("trip-1", "user-1", tripSubscriber, vi.fn());
      const unsubscribeUser = subscribeUser("user-2", userSubscriber);

      vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS);

      expect(tripSubscriber).toHaveBeenCalledWith({ type: "heartbeat" });
      expect(userSubscriber).toHaveBeenCalledWith({ type: "heartbeat" });

      unsubscribeTrip();
      unsubscribeUser();
    });

    it("does not attempt delivery to a topic with no subscribers", () => {
      const callback = vi.fn();
      const unsubscribe = subscribeTripForUser("trip-empty", "user-1", callback, vi.fn());
      unsubscribe(); // reclaims the topic, so it no longer exists in tripTopics

      expect(() => vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS)).not.toThrow();
      expect(callback).not.toHaveBeenCalled();
    });

    it("keeps delivering on every subsequent tick, not just the first", () => {
      const callback = vi.fn();
      const unsubscribe = subscribeUser("user-1", callback);

      vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS * 3);

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenCalledWith({ type: "heartbeat" });

      unsubscribe();
    });

    it("guards per-subscriber delivery on the heartbeat tick so one throwing subscriber does not block others", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const throwing = vi.fn(() => {
        throw new Error("boom");
      });
      const healthy = vi.fn();
      const unsubscribeThrowing = subscribeTripForUser("trip-1", "user-1", throwing, vi.fn());
      const unsubscribeHealthy = subscribeTripForUser("trip-1", "user-2", healthy, vi.fn());

      expect(() => vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS)).not.toThrow();

      expect(throwing).toHaveBeenCalledWith({ type: "heartbeat" });
      expect(healthy).toHaveBeenCalledWith({ type: "heartbeat" });
      expect(warnSpy).toHaveBeenCalled();

      unsubscribeThrowing();
      unsubscribeHealthy();
    });

    it("guards per-subscriber delivery on the heartbeat tick for user-topic subscribers too", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const throwing = vi.fn(() => {
        throw new Error("boom");
      });
      const healthy = vi.fn();
      const unsubscribeThrowing = subscribeUser("user-1", throwing);
      const unsubscribeHealthy = subscribeUser("user-2", healthy);

      expect(() => vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS)).not.toThrow();

      expect(throwing).toHaveBeenCalledWith({ type: "heartbeat" });
      expect(healthy).toHaveBeenCalledWith({ type: "heartbeat" });
      expect(warnSpy).toHaveBeenCalled();

      unsubscribeThrowing();
      unsubscribeHealthy();
    });

    it("does not start a second scheduler interval when a subscriber already exists on another topic", () => {
      const setIntervalSpy = vi.spyOn(global, "setInterval");
      const unsubscribeFirst = subscribeTripForUser("trip-1", "user-1", vi.fn(), vi.fn());
      const unsubscribeSecond = subscribeUser("user-1", vi.fn());

      expect(setIntervalSpy).toHaveBeenCalledOnce();

      unsubscribeFirst();
      unsubscribeSecond();
    });

    it("stops the scheduler interval once the last subscriber across every topic unsubscribes", () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");
      const unsubscribeTrip = subscribeTripForUser("trip-1", "user-1", vi.fn(), vi.fn());
      const unsubscribeUser = subscribeUser("user-2", vi.fn());

      unsubscribeTrip();
      expect(clearIntervalSpy).not.toHaveBeenCalled(); // user-2's topic still has a subscriber

      unsubscribeUser();
      expect(clearIntervalSpy).toHaveBeenCalledOnce();

      // A tick after full teardown must not throw or resurrect delivery.
      expect(() => vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS)).not.toThrow();
    });
  });

  describe("createLiveSyncResponse", () => {
    // Cancelling a reader does not run the ReadableStream's abort listener (there is no `cancel()`
    // handler on the source, matching the pre-existing routes) — only aborting the request signal
    // does. Every test below that wires a real subscribeUser/subscribeTripForUser call must abort
    // its own controller so it doesn't leak a live subscriber into userTopics/tripTopics for the
    // rest of the file.
    async function abortAndFlush(controller: AbortController): Promise<void> {
      controller.abort();
      await Promise.resolve();
      await Promise.resolve();
    }

    it("returns the shared SSE headers", async () => {
      const controller = new AbortController();
      const response = createLiveSyncResponse(controller.signal, () => vi.fn());

      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      expect(response.headers.get("Cache-Control")).toBe("no-store, no-transform");
      expect(response.headers.get("Connection")).toBe("keep-alive");
      expect(response.headers.get("X-Accel-Buffering")).toBe("no");

      await abortAndFlush(controller);
    });

    it("flushes an immediate heartbeat on connect", async () => {
      const controller = new AbortController();
      const response = createLiveSyncResponse(controller.signal, () => vi.fn());
      const reader = response.body!.getReader();

      const { value } = await reader.read();
      expect(new TextDecoder().decode(value)).toBe(formatSseHeartbeat());

      await abortAndFlush(controller);
    });

    it("delivers a real published event to the subscribed connection", async () => {
      const controller = new AbortController();
      const response = createLiveSyncResponse(controller.signal, (callback, close) =>
        subscribeTripForUser("trip-1", "user-1", callback, close)
      );
      const reader = response.body!.getReader();
      await reader.read(); // the immediate connect heartbeat

      const event = { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" } as const;
      publishTripEvent("trip-1", event);

      const { value } = await reader.read();
      expect(new TextDecoder().decode(value)).toBe(formatSseEvent(event));

      await abortAndFlush(controller);
    });

    it("delivers a scheduled heartbeat to the subscribed connection", async () => {
      resetLiveSyncHeartbeatSchedulerForTest();
      vi.useFakeTimers();
      const controller = new AbortController();
      const response = createLiveSyncResponse(controller.signal, (callback) => subscribeUser("user-1", callback));
      const reader = response.body!.getReader();
      await reader.read(); // the immediate connect heartbeat

      vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS);

      const { value } = await reader.read();
      expect(new TextDecoder().decode(value)).toBe(formatSseHeartbeat());

      controller.abort();
      resetLiveSyncHeartbeatSchedulerForTest();
      vi.useRealTimers();
    });

    it("delivers a scheduled heartbeat to a trip-subscribed connection", async () => {
      resetLiveSyncHeartbeatSchedulerForTest();
      vi.useFakeTimers();
      const controller = new AbortController();
      const response = createLiveSyncResponse(controller.signal, (callback, close) =>
        subscribeTripForUser("trip-1", "user-1", callback, close)
      );
      const reader = response.body!.getReader();
      await reader.read(); // the immediate connect heartbeat

      vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS);

      const { value } = await reader.read();
      expect(new TextDecoder().decode(value)).toBe(formatSseHeartbeat());

      controller.abort();
      resetLiveSyncHeartbeatSchedulerForTest();
      vi.useRealTimers();
    });

    it("does not enqueue anything when the signal is already aborted at stream start", async () => {
      const controller = new AbortController();
      controller.abort();
      const unsubscribe = vi.fn();

      const response = createLiveSyncResponse(controller.signal, () => unsubscribe);

      expect(unsubscribe).toHaveBeenCalledOnce();
      const { done } = await response.body!.getReader().read();
      expect(done).toBe(true);
    });

    it("unsubscribes and closes the stream once the signal aborts", async () => {
      const controller = new AbortController();
      const unsubscribe = vi.fn();

      const response = createLiveSyncResponse(controller.signal, () => unsubscribe);
      const reader = response.body!.getReader();
      await reader.read(); // the immediate connect heartbeat

      await abortAndFlush(controller);

      expect(unsubscribe).toHaveBeenCalledOnce();
      const { done } = await reader.read();
      expect(done).toBe(true);
    });

    it("logs a throwing connect-time heartbeat flush without crashing stream setup", async () => {
      const controller = new AbortController();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const addEventListenerSpy = vi.spyOn(controller.signal, "addEventListener");
      const unsubscribe = vi.fn();

      expect(() =>
        createLiveSyncResponse(controller.signal, (_callback, close) => {
          close();
          return unsubscribe;
        })
      ).not.toThrow();

      expect(unsubscribe).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        "Live sync heartbeat flush failed while opening connection",
        expect.any(Error)
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
    });
  });
});
