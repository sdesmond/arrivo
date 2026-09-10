import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSyncEventType } from "@/data/types";
import { flushMicrotasks, MockEventSource, personalSource, tripSource } from "./live-sync-test-helpers";
import { useTripLiveRefresh } from "./use-trip-live-refresh";

const { mockRouterPush, mockRouterRefresh, mockToastError } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockRouterRefresh: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, refresh: mockRouterRefresh }),
}));

vi.mock("sonner", () => ({
  toast: { error: mockToastError },
}));

describe("useTripLiveRefresh", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    mockRouterPush.mockClear();
    mockRouterRefresh.mockClear();
    mockToastError.mockClear();
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the trip's SSE channel and the personal channel", () => {
    renderHook(() => useTripLiveRefresh("trip-1"));

    expect(tripSource().url).toBe("/api/trips/trip-1/events");
    expect(personalSource().url).toBe("/api/users/me/events");
  });

  it("does not refresh on the initial connect", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));

    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("refreshes once when an itinerary-changed event arrives", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    act(() => tripSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" })));
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("refreshes once when a membership-changed event arrives, naming any user", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    act(() =>
      tripSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" }))
    );
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("refreshes once on reconnect after a drop, not on the initial connect", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => tripSource().emitOpen());
    await flushMicrotasks();
    expect(mockRouterRefresh).not.toHaveBeenCalled();

    act(() => tripSource().emitError());
    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("does not refresh on a heartbeat frame", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    act(() => tripSource().emitMessage('{"type":"heartbeat"}'));
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("ignores an unrecognized or malformed frame without throwing or refreshing", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    expect(() => act(() => tripSource().emitMessage('{"type":"something-unknown"}'))).not.toThrow();
    expect(() => act(() => tripSource().emitMessage("not json"))).not.toThrow();
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("does not refresh, redirect, or toast for a membership-removed frame on the trip channel", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    act(() =>
      tripSource().emitMessage(
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
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("redirects to the trips list and shows a toast when the trip is deleted, without refreshing", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    act(() => tripSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.TripDeleted, tripId: "trip-1" })));
    await flushMicrotasks();

    expect(mockToastError).toHaveBeenCalledWith("This trip was deleted.");
    expect(mockRouterPush).toHaveBeenCalledWith("/trips");
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("collapses a burst of quick-succession triggers into a single refresh for the latest generation", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    act(() => {
      tripSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" }));
      tripSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" }));
    });
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("discards an in-flight trigger if the hook unmounts before it settles", async () => {
    const { unmount } = renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    act(() => tripSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" })));
    unmount();
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("closes both the trip and personal EventSources and clears the watchdog on unmount", async () => {
    const { unmount } = renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => tripSource().emitOpen());
    await flushMicrotasks();
    const tripChannel = tripSource();
    const personalChannel = personalSource();

    unmount();

    expect(tripChannel.close).toHaveBeenCalledOnce();
    expect(personalChannel.close).toHaveBeenCalledOnce();
  });

  it("discards a trigger from the old trip if tripId changes before it settles", async () => {
    const { rerender } = renderHook(({ tripId }: { tripId: string }) => useTripLiveRefresh(tripId), {
      initialProps: { tripId: "trip-1" },
    });
    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    act(() => tripSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" })));
    rerender({ tripId: "trip-2" });
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("closes the previous channel, opens a new one for the new tripId, and treats its connect as initial", async () => {
    const { rerender } = renderHook(({ tripId }: { tripId: string }) => useTripLiveRefresh(tripId), {
      initialProps: { tripId: "trip-1" },
    });
    act(() => tripSource().emitOpen());
    await flushMicrotasks();
    const firstSource = tripSource();

    rerender({ tripId: "trip-2" });

    expect(firstSource.close).toHaveBeenCalledOnce();
    expect(tripSource().url).toBe("/api/trips/trip-2/events");

    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("refreshes on a genuine reconnect for a new trip's channel, after switching trips while connected", async () => {
    const { rerender } = renderHook(({ tripId }: { tripId: string }) => useTripLiveRefresh(tripId), {
      initialProps: { tripId: "trip-1" },
    });
    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    // Switch trips while trip-1's channel is still Connected.
    rerender({ tripId: "trip-2" });
    act(() => tripSource().emitOpen());
    await flushMicrotasks();
    expect(mockRouterRefresh).not.toHaveBeenCalled(); // trip-2's initial connect — no refresh yet.

    // A genuine drop and reconnect on trip-2's channel must still be detected as a reconnect, not
    // misread as another "initial connect" because status never visibly left Connected.
    act(() => tripSource().emitError());
    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("invokes onSelfRoleChanged for a personal-channel membership-changed event naming this trip", async () => {
    const onSelfRoleChanged = vi.fn();
    renderHook(() => useTripLiveRefresh("trip-1", onSelfRoleChanged));
    act(() => personalSource().emitOpen());
    await flushMicrotasks();

    act(() =>
      personalSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" }))
    );
    await flushMicrotasks();

    expect(onSelfRoleChanged).toHaveBeenCalledOnce();
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("does not invoke onSelfRoleChanged for a personal-channel membership-changed event naming a different trip", async () => {
    const onSelfRoleChanged = vi.fn();
    renderHook(() => useTripLiveRefresh("trip-1", onSelfRoleChanged));
    act(() => personalSource().emitOpen());
    await flushMicrotasks();

    act(() =>
      personalSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipChanged, tripId: "trip-2" }))
    );
    await flushMicrotasks();

    expect(onSelfRoleChanged).not.toHaveBeenCalled();
  });

  it("does not invoke onSelfRoleChanged for a membership-changed event on the trip channel", async () => {
    const onSelfRoleChanged = vi.fn();
    renderHook(() => useTripLiveRefresh("trip-1", onSelfRoleChanged));
    act(() => tripSource().emitOpen());
    await flushMicrotasks();

    act(() =>
      tripSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" }))
    );
    await flushMicrotasks();

    expect(onSelfRoleChanged).not.toHaveBeenCalled();
  });

  it("does not throw when a personal-channel membership-changed event arrives and onSelfRoleChanged is omitted", async () => {
    renderHook(() => useTripLiveRefresh("trip-1"));
    act(() => personalSource().emitOpen());
    await flushMicrotasks();

    expect(() =>
      act(() =>
        personalSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" }))
      )
    ).not.toThrow();
  });
});
