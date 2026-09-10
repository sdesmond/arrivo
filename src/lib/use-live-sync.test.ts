import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSyncEventType, SyncConnectionStatus } from "@/data/types";
import type { LiveSyncEvent } from "@/data/types";
import { MockEventSource } from "./live-sync-test-helpers";
import { LIVE_SYNC_DEAD_CHANNEL_GRACE_MS, SSE_HEARTBEAT_INTERVAL_MS } from "./live-sync-constants";
import { resetLiveSyncChannelsForTest, useLiveSync } from "./use-live-sync";

const DEAD_CHANNEL_TIMEOUT_MS = SSE_HEARTBEAT_INTERVAL_MS + LIVE_SYNC_DEAD_CHANNEL_GRACE_MS;

describe("useLiveSync", () => {
  beforeEach(() => {
    // The channel registry is module-level, so it outlives any single renderHook. Reset it before
    // stubbing EventSource, or a channel leaked by an earlier test (and its watchdog timer) shows
    // up here as an unrelated instance-count failure.
    resetLiveSyncChannelsForTest();
    MockEventSource.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    resetLiveSyncChannelsForTest();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("starts reconnecting and opens the default personal event channel once", () => {
    const { result } = renderHook(() => useLiveSync());

    expect(result.current).toBe(SyncConnectionStatus.Reconnecting);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe("/api/users/me/events");
  });

  it("becomes connected when the channel opens", () => {
    const { result } = renderHook(() => useLiveSync("/api/users/me/events"));

    act(() => MockEventSource.instances[0]?.emitOpen());

    expect(result.current).toBe(SyncConnectionStatus.Connected);
  });

  it("becomes reconnecting when the channel reports an error", () => {
    const { result } = renderHook(() => useLiveSync());
    act(() => MockEventSource.instances[0]?.emitOpen());

    act(() => MockEventSource.instances[0]?.emitError());

    expect(result.current).toBe(SyncConnectionStatus.Reconnecting);
  });

  it("recovers to connected when the channel opens after a drop", () => {
    const { result } = renderHook(() => useLiveSync());
    act(() => MockEventSource.instances[0]?.emitOpen());
    act(() => MockEventSource.instances[0]?.emitError());
    act(() => MockEventSource.instances[0]?.emitOpen());

    expect(result.current).toBe(SyncConnectionStatus.Connected);
  });

  it("becomes offline after the channel stays silent beyond its watchdog window", () => {
    const { result } = renderHook(() => useLiveSync());

    act(() => vi.advanceTimersByTime(DEAD_CHANNEL_TIMEOUT_MS));

    expect(result.current).toBe(SyncConnectionStatus.Offline);
  });

  it("resets the watchdog on messages and returns to connected from offline", () => {
    const { result } = renderHook(() => useLiveSync());
    act(() => vi.advanceTimersByTime(DEAD_CHANNEL_TIMEOUT_MS));
    expect(result.current).toBe(SyncConnectionStatus.Offline);

    act(() => MockEventSource.instances[0]?.emitMessage());
    expect(result.current).toBe(SyncConnectionStatus.Connected);

    act(() => vi.advanceTimersByTime(DEAD_CHANNEL_TIMEOUT_MS - 1));
    expect(result.current).toBe(SyncConnectionStatus.Connected);
  });

  it("keeps the dead-channel status offline until the channel opens or sends a message", () => {
    const { result } = renderHook(() => useLiveSync());
    act(() => vi.advanceTimersByTime(DEAD_CHANNEL_TIMEOUT_MS));

    act(() => MockEventSource.instances[0]?.emitError());

    expect(result.current).toBe(SyncConnectionStatus.Offline);
  });

  it("closes the source and clears its watchdog on unmount", () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = renderHook(() => useLiveSync());
    const source = MockEventSource.instances[0];

    unmount();

    expect(source?.close).toHaveBeenCalledOnce();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  describe("onLiveSyncEvent callback", () => {
    it("invokes the callback with the parsed event for a known type", () => {
      const onLiveSyncEvent = vi.fn();
      renderHook(() => useLiveSync("/api/trips/trip-1/events", onLiveSyncEvent));

      act(() =>
        MockEventSource.instances[0]?.emitMessage(
          JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" })
        )
      );

      expect(onLiveSyncEvent).toHaveBeenCalledExactlyOnceWith({
        type: LiveSyncEventType.ItineraryChanged,
        tripId: "trip-1",
      });
    });

    it("passes through the full event payload for a multi-field event type", () => {
      const onLiveSyncEvent = vi.fn();
      renderHook(() => useLiveSync("/api/trips/trip-1/events", onLiveSyncEvent));

      const payload: LiveSyncEvent = {
        type: LiveSyncEventType.MembershipRemoved,
        removedUserId: "user-1",
        tripId: "trip-1",
        tripName: "Test Trip",
        removedByName: "Manager",
        removedByEmail: "manager@example.com",
      };
      act(() => MockEventSource.instances[0]?.emitMessage(JSON.stringify(payload)));

      expect(onLiveSyncEvent).toHaveBeenCalledExactlyOnceWith(payload);
    });

    it("does not invoke the callback for a heartbeat frame", () => {
      const onLiveSyncEvent = vi.fn();
      renderHook(() => useLiveSync("/api/trips/trip-1/events", onLiveSyncEvent));

      act(() => MockEventSource.instances[0]?.emitMessage('{"type":"heartbeat"}'));

      expect(onLiveSyncEvent).not.toHaveBeenCalled();
    });

    it("does not invoke the callback for an unrecognized event type", () => {
      const onLiveSyncEvent = vi.fn();
      renderHook(() => useLiveSync("/api/trips/trip-1/events", onLiveSyncEvent));

      act(() => MockEventSource.instances[0]?.emitMessage('{"type":"something-unknown"}'));

      expect(onLiveSyncEvent).not.toHaveBeenCalled();
    });

    it("does not invoke the callback and does not throw for malformed JSON", () => {
      const onLiveSyncEvent = vi.fn();
      renderHook(() => useLiveSync("/api/trips/trip-1/events", onLiveSyncEvent));

      expect(() => act(() => MockEventSource.instances[0]?.emitMessage("not json"))).not.toThrow();
      expect(onLiveSyncEvent).not.toHaveBeenCalled();
    });

    it("does not invoke the callback for a frame with no type field", () => {
      const onLiveSyncEvent = vi.fn();
      renderHook(() => useLiveSync("/api/trips/trip-1/events", onLiveSyncEvent));

      act(() => MockEventSource.instances[0]?.emitMessage('{"tripId":"trip-1"}'));

      expect(onLiveSyncEvent).not.toHaveBeenCalled();
    });

    it("still marks connected and resets the watchdog on a message that carries an event", () => {
      const onLiveSyncEvent = vi.fn();
      const { result } = renderHook(() => useLiveSync("/api/trips/trip-1/events", onLiveSyncEvent));
      act(() => vi.advanceTimersByTime(DEAD_CHANNEL_TIMEOUT_MS));
      expect(result.current).toBe(SyncConnectionStatus.Offline);

      act(() =>
        MockEventSource.instances[0]?.emitMessage(
          JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" })
        )
      );

      expect(result.current).toBe(SyncConnectionStatus.Connected);
      expect(onLiveSyncEvent).toHaveBeenCalledOnce();
    });

    it("calls the latest callback without resubscribing the EventSource when the callback identity changes", () => {
      const firstCallback = vi.fn();
      const secondCallback = vi.fn();
      const { rerender } = renderHook(({ callback }) => useLiveSync("/api/trips/trip-1/events", callback), {
        initialProps: { callback: firstCallback },
      });

      rerender({ callback: secondCallback });
      expect(MockEventSource.instances).toHaveLength(1);

      act(() =>
        MockEventSource.instances[0]?.emitMessage(
          JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" })
        )
      );

      expect(firstCallback).not.toHaveBeenCalled();
      expect(secondCallback).toHaveBeenCalledOnce();
    });

    it("works with no callback supplied", () => {
      renderHook(() => useLiveSync("/api/trips/trip-1/events"));

      expect(() =>
        act(() =>
          MockEventSource.instances[0]?.emitMessage(
            JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" })
          )
        )
      ).not.toThrow();
    });
  });

  describe("shared channel per URL", () => {
    it("opens only one EventSource for two concurrent consumers of the same URL", () => {
      renderHook(() => useLiveSync());
      renderHook(() => useLiveSync());

      expect(MockEventSource.instances).toHaveLength(1);
    });

    it("opens independent EventSource instances for different URLs", () => {
      renderHook(() => useLiveSync("/api/trips/trip-1/events"));
      renderHook(() => useLiveSync("/api/trips/trip-2/events"));

      expect(MockEventSource.instances).toHaveLength(2);
    });

    it("keeps the shared EventSource open while any consumer remains mounted", () => {
      const first = renderHook(() => useLiveSync());
      renderHook(() => useLiveSync());

      first.unmount();

      expect(MockEventSource.instances[0]?.close).not.toHaveBeenCalled();
    });

    it("closes the shared EventSource only after the last consumer unmounts", () => {
      const first = renderHook(() => useLiveSync());
      const second = renderHook(() => useLiveSync());

      first.unmount();
      second.unmount();

      expect(MockEventSource.instances[0]?.close).toHaveBeenCalledOnce();
    });

    it("delivers a message to every consumer subscribed to the shared channel", () => {
      const firstCallback = vi.fn();
      const secondCallback = vi.fn();
      renderHook(() => useLiveSync("/api/trips/trip-1/events", firstCallback));
      renderHook(() => useLiveSync("/api/trips/trip-1/events", secondCallback));

      act(() =>
        MockEventSource.instances[0]?.emitMessage(
          JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" })
        )
      );

      expect(firstCallback).toHaveBeenCalledOnce();
      expect(secondCallback).toHaveBeenCalledOnce();
    });

    it("reflects a shared status change on every consumer", () => {
      const first = renderHook(() => useLiveSync());
      const second = renderHook(() => useLiveSync());

      act(() => MockEventSource.instances[0]?.emitOpen());

      expect(first.result.current).toBe(SyncConnectionStatus.Connected);
      expect(second.result.current).toBe(SyncConnectionStatus.Connected);
    });

    it("guards per-listener event delivery so one throwing listener does not block the others", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const throwingCallback = vi.fn(() => {
        throw new Error("boom");
      });
      const healthyCallback = vi.fn();
      renderHook(() => useLiveSync("/api/trips/trip-1/events", throwingCallback));
      renderHook(() => useLiveSync("/api/trips/trip-1/events", healthyCallback));

      expect(() =>
        act(() =>
          MockEventSource.instances[0]?.emitMessage(
            JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" })
          )
        )
      ).not.toThrow();

      expect(throwingCallback).toHaveBeenCalledOnce();
      expect(healthyCallback).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalled();
    });

    it("gives a consumer joining an already-connected channel its true current status immediately", () => {
      renderHook(() => useLiveSync());
      act(() => MockEventSource.instances[0]?.emitOpen());

      const joiner = renderHook(() => useLiveSync());

      expect(joiner.result.current).toBe(SyncConnectionStatus.Connected);
    });

    it("does not touch a newer channel when a stale cleanup releases the channel the map already replaced", () => {
      const first = renderHook(() => useLiveSync());
      const firstEventSource = MockEventSource.instances[0];
      expect(firstEventSource).toBeDefined();

      // Simulate the module's channel registry being replaced out from under `first`'s still-live
      // reference at the same URL — e.g. some other path fully released and reopened the channel
      // before `first`'s own effect cleanup for it has run. resetLiveSyncChannelsForTest (normally
      // test teardown) is repurposed here to force exactly that replacement without going through
      // `first`'s own unmount.
      resetLiveSyncChannelsForTest();
      const second = renderHook(() => useLiveSync());
      const secondEventSource = MockEventSource.instances[1];
      expect(secondEventSource).toBeDefined();
      expect(secondEventSource).not.toBe(firstEventSource);

      // `first`'s cleanup now fires holding the old channel object, which the map no longer holds
      // at this URL — a stale release.
      first.unmount();

      // The newer channel (second's) must be entirely unaffected: not decremented, not closed.
      expect(secondEventSource?.close).not.toHaveBeenCalled();
      expect(MockEventSource.instances).toHaveLength(2);

      second.unmount();
      expect(secondEventSource?.close).toHaveBeenCalledOnce();
    });
  });
});
