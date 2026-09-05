import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSyncEventType } from "@/data/types";
import { useTripLiveRefresh } from "./use-trip-live-refresh";

const { mockRouterRefresh } = vi.hoisted(() => ({
  mockRouterRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

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

  emitMessage(data: string): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  emitOpen(): void {
    this.onopen?.(new Event("open"));
  }
}

function currentSource(): MockEventSource {
  const source = MockEventSource.instances.at(-1);
  if (!source) throw new Error("No MockEventSource instance was created.");
  return source;
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useTripLiveRefresh", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    mockRouterRefresh.mockClear();
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the trip's SSE channel", () => {
    renderHook(() => useTripLiveRefresh("trip-1"));

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe("/api/trips/trip-1/events");
  });

  it("does not refresh on the initial connect", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));

    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("refreshes once when an itinerary-changed event arrives", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() =>
      currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" }))
    );
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("refreshes once when a membership-changed event arrives, naming any user", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() =>
      currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" }))
    );
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("refreshes once on reconnect after a drop, not on the initial connect", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => currentSource().emitOpen());
    await flushMicrotasks();
    expect(mockRouterRefresh).not.toHaveBeenCalled();

    act(() => currentSource().emitError());
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("does not refresh on a heartbeat frame", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() => currentSource().emitMessage('{"type":"heartbeat"}'));
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("ignores an unrecognized or malformed frame without throwing or refreshing", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    expect(() => act(() => currentSource().emitMessage('{"type":"something-unknown"}'))).not.toThrow();
    expect(() => act(() => currentSource().emitMessage("not json"))).not.toThrow();
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("does not refresh for a trip-deleted or membership-removed frame on the trip channel", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() => currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.TripDeleted, tripId: "trip-1" })));
    act(() =>
      currentSource().emitMessage(
        JSON.stringify({
          type: LiveSyncEventType.MembershipRemoved,
          removedUserId: "user-1",
          tripId: "trip-1",
          tripName: "Test Trip",
          removedByName: "Manager",
          removedByEmail: "manager@example.com",
        })
      )
    );
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("collapses a burst of quick-succession triggers into a single refresh for the latest generation", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() => {
      currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" }));
      currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" }));
    });
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("discards an in-flight trigger if the hook unmounts before it settles", async () => {
    const { unmount } = renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() =>
      currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" }))
    );
    unmount();
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("closes the EventSource and clears the watchdog on unmount", async () => {
    const { unmount } = renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => currentSource().emitOpen());
    await flushMicrotasks();
    const source = currentSource();

    unmount();

    expect(source.close).toHaveBeenCalledOnce();
  });

  it("discards a trigger from the old trip if tripId changes before it settles", async () => {
    const { rerender } = renderHook(({ tripId }: { tripId: string }) => useTripLiveRefresh(tripId), {
      initialProps: { tripId: "trip-1" },
    });
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() =>
      currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" }))
    );
    rerender({ tripId: "trip-2" });
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("closes the previous channel, opens a new one for the new tripId, and treats its connect as initial", async () => {
    const { rerender } = renderHook(({ tripId }: { tripId: string }) => useTripLiveRefresh(tripId), {
      initialProps: { tripId: "trip-1" },
    });
    act(() => currentSource().emitOpen());
    await flushMicrotasks();
    const firstSource = currentSource();

    rerender({ tripId: "trip-2" });

    expect(firstSource.close).toHaveBeenCalledOnce();
    expect(MockEventSource.instances).toHaveLength(2);
    expect(currentSource().url).toBe("/api/trips/trip-2/events");

    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("refreshes on a genuine reconnect for a new trip's channel, after switching trips while connected", async () => {
    const { rerender } = renderHook(({ tripId }: { tripId: string }) => useTripLiveRefresh(tripId), {
      initialProps: { tripId: "trip-1" },
    });
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    // Switch trips while trip-1's channel is still Connected.
    rerender({ tripId: "trip-2" });
    act(() => currentSource().emitOpen());
    await flushMicrotasks();
    expect(mockRouterRefresh).not.toHaveBeenCalled(); // trip-2's initial connect — no refresh yet.

    // A genuine drop and reconnect on trip-2's channel must still be detected as a reconnect, not
    // misread as another "initial connect" because status never visibly left Connected.
    act(() => currentSource().emitError());
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });
});
