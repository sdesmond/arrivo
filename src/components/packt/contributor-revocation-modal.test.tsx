import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSyncEventType } from "@/data/types";
import { clearRevocationTicket, getRevocationTicket } from "@/lib/revocation-ticket";
import { currentSource, MockEventSource } from "@/lib/live-sync-test-helpers";
import { resetLiveSyncChannelsForTest } from "@/lib/use-live-sync";

const { mockRouterPush, mockRouterRefresh } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockRouterRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, refresh: mockRouterRefresh }),
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  AlertDialogContent: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogHeader: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogTitle: (props: { children: React.ReactNode }) => <h2>{props.children}</h2>,
  AlertDialogDescription: (props: { children: React.ReactNode }) => <p>{props.children}</p>,
  AlertDialogFooter: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import { ContributorRevocationModal } from "./contributor-revocation-modal";

const SELF_REMOVAL_EVENT = {
  type: LiveSyncEventType.MembershipRemoved,
  removedUserId: "user-1",
  tripId: "trip-1",
  tripName: "Tokyo Adventure",
  removedByName: "Alex Manager",
  removedByEmail: "alex@example.com",
};

describe("ContributorRevocationModal", () => {
  beforeEach(() => {
    // This suite drives the real useLiveSync, so its module-level channel registry has to be torn
    // down between tests or a leaked channel breaks the instance-count assertions below.
    resetLiveSyncChannelsForTest();
    MockEventSource.instances = [];
    mockRouterPush.mockClear();
    mockRouterRefresh.mockClear();
    clearRevocationTicket();
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    resetLiveSyncChannelsForTest();
    vi.unstubAllGlobals();
  });

  it("renders nothing when no revocation ticket has arrived", () => {
    render(<ContributorRevocationModal userId="user-1" />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("opens the personal channel", () => {
    render(<ContributorRevocationModal userId="user-1" />);

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe("/api/users/me/events");
  });

  it("renders naming the trip and the removing manager on a self-targeted removal", () => {
    render(<ContributorRevocationModal userId="user-1" />);

    act(() => currentSource().emitMessage(JSON.stringify(SELF_REMOVAL_EVENT)));

    expect(screen.getByText(/Tokyo Adventure/)).toBeInTheDocument();
    expect(screen.getByText(/Alex Manager/)).toBeInTheDocument();
    expect(screen.getByText(/alex@example.com/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
  });

  it("publishes the revocation ticket on a self-targeted removal", () => {
    render(<ContributorRevocationModal userId="user-1" />);

    act(() => currentSource().emitMessage(JSON.stringify(SELF_REMOVAL_EVENT)));

    expect(getRevocationTicket()).toEqual(SELF_REMOVAL_EVENT);
  });

  it("ignores a removal event naming a different user", () => {
    render(<ContributorRevocationModal userId="user-1" />);

    act(() => currentSource().emitMessage(JSON.stringify({ ...SELF_REMOVAL_EVENT, removedUserId: "someone-else" })));

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(getRevocationTicket()).toBeNull();
  });

  it("ignores unrelated live-sync events", () => {
    render(<ContributorRevocationModal userId="user-1" />);

    act(() =>
      currentSource().emitMessage(JSON.stringify({ type: LiveSyncEventType.ItineraryChanged, tripId: "trip-1" }))
    );

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(getRevocationTicket()).toBeNull();
  });

  it("clears the ticket and navigates to /trips when OK is clicked", async () => {
    const user = userEvent.setup();
    render(<ContributorRevocationModal userId="user-1" />);
    act(() => currentSource().emitMessage(JSON.stringify(SELF_REMOVAL_EVENT)));

    await user.click(screen.getByRole("button", { name: "OK" }));

    expect(mockRouterPush).toHaveBeenCalledWith("/trips");
    expect(getRevocationTicket()).toBeNull();
  });

  it("refreshes on OK so an already-open /trips list drops the revoked trip", async () => {
    const user = userEvent.setup();
    render(<ContributorRevocationModal userId="user-1" />);
    act(() => currentSource().emitMessage(JSON.stringify(SELF_REMOVAL_EVENT)));

    await user.click(screen.getByRole("button", { name: "OK" }));

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("keeps the first removal on screen when a second one arrives", () => {
    render(<ContributorRevocationModal userId="user-1" />);
    act(() => currentSource().emitMessage(JSON.stringify(SELF_REMOVAL_EVENT)));

    act(() =>
      currentSource().emitMessage(JSON.stringify({ ...SELF_REMOVAL_EVENT, tripId: "trip-2", tripName: "Kyoto Detour" }))
    );

    expect(screen.getByText(/Tokyo Adventure/)).toBeInTheDocument();
    expect(screen.queryByText(/Kyoto Detour/)).not.toBeInTheDocument();
  });

  it("clears the ticket on unmount", () => {
    const { unmount } = render(<ContributorRevocationModal userId="user-1" />);
    act(() => currentSource().emitMessage(JSON.stringify(SELF_REMOVAL_EVENT)));
    expect(getRevocationTicket()).not.toBeNull();

    unmount();

    expect(getRevocationTicket()).toBeNull();
  });
});
