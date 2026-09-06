import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSyncEventType, SyncConnectionStatus } from "@/data/types";
import type { LiveSyncEvent } from "@/data/types";
import { useLiveRefresh } from "./use-live-refresh";

const { mockRouterRefresh, channel } = vi.hoisted(() => ({
  mockRouterRefresh: vi.fn(),
  channel: {
    urls: [] as (string | undefined)[],
    emit: (() => {}) as (event: unknown) => void,
    setStatus: (() => {}) as (status: string) => void,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

// Stands in for the shared-channel registry so this suite exercises the refresh policy on its own:
// which events refresh, how bursts collapse, and how Connected transitions are read. The registry's
// own behaviour (one EventSource per URL, ref counting) is covered by `use-live-sync.test.ts`, and
// the two wrapper hooks cover the whole stack against a mock EventSource.
vi.mock("./use-live-sync", async () => {
  const { useState } = await import("react");
  return {
    useLiveSync: (url: string | undefined, onLiveSyncEvent?: (event: LiveSyncEvent) => void) => {
      const [status, setStatus] = useState<string>("reconnecting");
      channel.urls.push(url);
      channel.emit = (event) => onLiveSyncEvent?.(event as LiveSyncEvent);
      channel.setStatus = setStatus;
      return status;
    },
  };
});

const membershipChanged = { type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" };
const itineraryChanged = { type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" };

function connect(): void {
  act(() => channel.setStatus(SyncConnectionStatus.Connected));
}

function drop(): void {
  act(() => channel.setStatus(SyncConnectionStatus.Reconnecting));
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useLiveRefresh", () => {
  beforeEach(() => {
    channel.urls = [];
    mockRouterRefresh.mockClear();
  });

  it("subscribes to the url it is given", () => {
    renderHook(() => useLiveRefresh("/api/trips/trip-1/events", () => true));

    expect(channel.urls[0]).toBe("/api/trips/trip-1/events");
  });

  it("passes an absent url straight through so the channel's own default applies", () => {
    renderHook(() => useLiveRefresh(undefined, () => true));

    expect(channel.urls[0]).toBeUndefined();
  });

  it("refreshes only for events the predicate accepts", async () => {
    renderHook(() => useLiveRefresh("/channel", (event) => event.type === LiveSyncEventType.MembershipChanged));
    connect();
    await flushMicrotasks();

    act(() => channel.emit(itineraryChanged));
    await flushMicrotasks();
    expect(mockRouterRefresh).not.toHaveBeenCalled();

    act(() => channel.emit(membershipChanged));
    await flushMicrotasks();
    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("swallows the initial connect and resyncs on a later one", async () => {
    renderHook(() => useLiveRefresh("/channel", () => true));

    connect();
    await flushMicrotasks();
    expect(mockRouterRefresh).not.toHaveBeenCalled();

    drop();
    connect();
    await flushMicrotasks();
    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("collapses a burst of accepted events into one refresh", async () => {
    renderHook(() => useLiveRefresh("/channel", () => true));
    connect();
    await flushMicrotasks();

    act(() => {
      channel.emit(membershipChanged);
      channel.emit(membershipChanged);
      channel.emit(itineraryChanged);
    });
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("discards an in-flight trigger when the hook unmounts", async () => {
    const { unmount } = renderHook(() => useLiveRefresh("/channel", () => true));
    connect();
    await flushMicrotasks();

    act(() => channel.emit(membershipChanged));
    unmount();
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("treats a url change as a fresh channel: in-flight trigger discarded, next connect is initial", async () => {
    const { rerender } = renderHook(({ url }: { url: string }) => useLiveRefresh(url, () => true), {
      initialProps: { url: "/channel-a" },
    });
    connect();
    await flushMicrotasks();

    act(() => channel.emit(membershipChanged));
    rerender({ url: "/channel-b" });
    await flushMicrotasks();
    expect(mockRouterRefresh).not.toHaveBeenCalled();

    // The new channel's first Connected is an initial connect, not a reconnect — nothing was missed.
    drop();
    connect();
    await flushMicrotasks();
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });
});
