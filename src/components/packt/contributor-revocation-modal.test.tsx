import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSyncEventType } from "@/data/types";
import { clearRevocationTicket, getRevocationTicket } from "@/lib/revocation-ticket";

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
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

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly close = vi.fn();
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  emitMessage(data: string): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

function currentSource(): MockEventSource {
  const source = MockEventSource.instances.at(-1);
  if (!source) throw new Error("No MockEventSource instance was created.");
  return source;
}

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
    MockEventSource.instances = [];
    mockRouterPush.mockClear();
    clearRevocationTicket();
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
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

  it("clears the ticket on unmount", () => {
    const { unmount } = render(<ContributorRevocationModal userId="user-1" />);
    act(() => currentSource().emitMessage(JSON.stringify(SELF_REMOVAL_EVENT)));
    expect(getRevocationTicket()).not.toBeNull();

    unmount();

    expect(getRevocationTicket()).toBeNull();
  });
});
