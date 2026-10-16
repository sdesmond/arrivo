import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSyncEventType } from "@/data/types";
import { flushMicrotasks, MockEventSource, personalSource } from "@/lib/live-sync-test-helpers";
import { resetLiveSyncChannelsForTest } from "@/lib/use-live-sync";
import { InvitationLiveRefresh } from "./invitation-live-refresh";

const { mockRouterRefresh } = vi.hoisted(() => ({
  mockRouterRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

describe("InvitationLiveRefresh", () => {
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

  it("renders nothing and joins the personal channel", () => {
    const { container } = render(<InvitationLiveRefresh />);

    expect(container).toBeEmptyDOMElement();
    expect(personalSource().url).toBe("/api/users/me/events");
  });

  it("refreshes when an invitation addressed to this user changes", async () => {
    render(<InvitationLiveRefresh />);
    act(() => personalSource().emitOpen());

    act(() =>
      personalSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.InvitationChanged, tripId: "trip-1" }))
    );
    await flushMicrotasks();

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("ignores other personal-channel events and reconnects", async () => {
    render(<InvitationLiveRefresh />);
    act(() => personalSource().emitOpen());
    act(() => personalSource().emitError());
    act(() => personalSource().emitOpen());

    act(() =>
      personalSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.MembershipChanged, tripId: "trip-1" }))
    );
    await flushMicrotasks();

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });
});
