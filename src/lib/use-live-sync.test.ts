import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncConnectionStatus } from "@/data/types";
import { LIVE_SYNC_DEAD_CHANNEL_GRACE_MS, SSE_HEARTBEAT_INTERVAL_MS } from "./live-sync-constants";
import { useLiveSync } from "./use-live-sync";

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly close = vi.fn();
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  emitError(): void {
    this.onerror?.(new Event("error"));
  }

  emitMessage(): void {
    this.onmessage?.(new MessageEvent("message", { data: '{"type":"heartbeat"}' }));
  }

  emitOpen(): void {
    this.onopen?.(new Event("open"));
  }
}

const DEAD_CHANNEL_TIMEOUT_MS = SSE_HEARTBEAT_INTERVAL_MS + LIVE_SYNC_DEAD_CHANNEL_GRACE_MS;

describe("useLiveSync", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
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
});
