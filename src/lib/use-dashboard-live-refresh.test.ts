import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSyncEventType } from "@/data/types";
import { currentSource, flushMicrotasks, MockEventSource } from "./live-sync-test-helpers";
import { resetLiveSyncChannelsForTest, useLiveSync } from "./use-live-sync";
import { useDashboardLiveRefresh } from "./use-dashboard-live-refresh";

const { mockRouterRefresh } = vi.hoisted(() => ({
  mockRouterRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

describe("useDashboardLiveRefresh", () => {
  beforeEach(() => {
    resetLiveSyncChannelsForTest();
    MockEventSource.instances = [];
    mockRouterRefresh.mockClear();
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    resetLiveSyncChannelsForTest();
    vi.unstubAllGlobals();
  });

  it("joins the default personal SSE channel", () => {
    renderHook(() => useDashboardLiveRefresh());

    expect(MockEventSource.instances).toHaveLength(1);
    expect(currentSource().url).toBe("/api/users/me/events");
  });

  it("joins the personal channel the app shell already holds instead of opening a second one", async () => {
    // The sync indicator and revocation modal live in the app shell, so by the time the dashboard
    // mounts the personal channel is normally open and already Connected. Joining it must reuse that
    // one EventSource (the 4.4 connection-cap constraint) and must not read the adopted Connected
    // status as a reconnect.
    const appShell = renderHook(() => useLiveSync());
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    renderHook(() => useDashboardLiveRefresh());
    await flushMicrotasks();

    expect(MockEventSource.instances).toHaveLength(1);
    expect(mockRouterRefresh).not.toHaveBeenCalled();

    appShell.unmount();
  });

  it("keeps the shared channel open for other consumers when the dashboard unmounts", async () => {
    const appShell = renderHook(() => useLiveSync());
    const dashboard = renderHook(() => useDashboardLiveRefresh());
    act(() => currentSource().emitOpen());
    await flushMicrotasks();
    const source = currentSource();

    dashboard.unmount();

    expect(source.close).not.toHaveBeenCalled();

    appShell.unmount();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("does not refresh on the initial connect", async () => {
    renderHook(() => useDashboardLiveRefresh());

    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("refreshes once when membership changes", async () => {
    renderHook(() => useDashboardLiveRefresh());
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() =>
      currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" }))
    );
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("ignores removals, itinerary changes, heartbeat, and unknown frames", async () => {
    renderHook(() => useDashboardLiveRefresh());
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() => {
      currentSource().emitMessage(
        JSON.stringify({
          type: LiveSyncEventType.MembershipRemoved,
          removedUserId: "user-1",
          tripId: "trip-1",
          tripName: "Test Trip",
          removedByName: "Manager",
          removedByEmail: "manager@example.com",
        })
      );
      currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" }));
      currentSource().emitMessage('{"type":"heartbeat"}');
      currentSource().emitMessage('{"type":"something-unknown"}');
    });
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("refreshes once when a trip is deleted, dropping it from the list", async () => {
    renderHook(() => useDashboardLiveRefresh());
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() => currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.TripDeleted, tripId: "trip-1" })));
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("refreshes once when this user left a trip from another session, dropping it from the list", async () => {
    renderHook(() => useDashboardLiveRefresh());
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() =>
      currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipLeft, tripId: "trip-1" }))
    );
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("collapses a burst of membership changes into one refresh", async () => {
    renderHook(() => useDashboardLiveRefresh());
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() => {
      currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" }));
      currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipChanged, tripId: "trip-2" }));
    });
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("refreshes once on reconnect after a drop", async () => {
    renderHook(() => useDashboardLiveRefresh());
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() => currentSource().emitError());
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("invalidates an in-flight refresh when unmounted", async () => {
    const { unmount } = renderHook(() => useDashboardLiveRefresh());
    act(() => currentSource().emitOpen());
    await flushMicrotasks();

    act(() =>
      currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" }))
    );
    unmount();
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });
});
