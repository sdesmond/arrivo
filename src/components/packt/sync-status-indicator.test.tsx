import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncConnectionStatus } from "@/data/types";
import type { SyncConnectionStatus as SyncConnectionStatusValue } from "@/data/types";

let connectionStatus: SyncConnectionStatusValue = SyncConnectionStatus.Reconnecting;

interface MockMediaQueryList extends MediaQueryList {
  matches: boolean;
}

function mockMatchMedia(matches: boolean): MockMediaQueryList {
  return {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MockMediaQueryList;
}

vi.mock("@/lib/use-live-sync", () => ({
  useLiveSync: () => connectionStatus,
}));

import { SyncStatusIndicator } from "./sync-status-indicator";

// Matches PROBLEM_GRACE_MS: a problem only becomes visible once it outlives the handshake window.
const GRACE_MS = 2_000;

function elapseGraceWindow(): void {
  act(() => {
    vi.advanceTimersByTime(GRACE_MS);
  });
}

function focusTrigger(): HTMLElement {
  const trigger = screen.getByTestId("sync-status-trigger");
  act(() => trigger.focus());
  return trigger;
}

describe("SyncStatusIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    connectionStatus = SyncConnectionStatus.Reconnecting;
    vi.spyOn(window, "matchMedia").mockReturnValue(mockMatchMedia(false));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders no visible indicator or initial announcement when connected", () => {
    connectionStatus = SyncConnectionStatus.Connected;
    render(<SyncStatusIndicator />);

    expect(screen.queryByTestId("sync-status-trigger")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("sync-status-announcement")).toBeEmptyDOMElement();
  });

  it("stays quiet while a problem is still inside the handshake grace window", () => {
    render(<SyncStatusIndicator />);

    act(() => {
      vi.advanceTimersByTime(GRACE_MS - 1);
    });

    expect(screen.queryByTestId("sync-status-trigger")).not.toBeInTheDocument();
    expect(screen.getByTestId("sync-status-announcement")).toBeEmptyDOMElement();
  });

  it("never announces a problem that resolves inside the grace window", () => {
    const { rerender } = render(<SyncStatusIndicator />);

    connectionStatus = SyncConnectionStatus.Connected;
    rerender(<SyncStatusIndicator />);
    elapseGraceWindow();

    expect(screen.queryByTestId("sync-status-trigger")).not.toBeInTheDocument();
    expect(screen.getByTestId("sync-status-announcement")).toBeEmptyDOMElement();
  });

  it("renders a warning icon above the mobile tab bar once reconnecting outlives the grace window", () => {
    render(<SyncStatusIndicator />);
    elapseGraceWindow();

    const container = screen.getByTestId("sync-status-indicator");
    expect(container).toHaveClass("pointer-events-none", "fixed", "bottom-0", "left-4", "lg:left-64");
    expect(screen.getByTestId("sync-status-safe-area")).toHaveStyle({
      height: "calc(3.5rem + env(safe-area-inset-bottom))",
    });

    const trigger = screen.getByRole("button", { name: "Reconnecting" });
    expect(trigger).toHaveClass("size-11", "text-warning", "pointer-events-auto");
    expect(trigger).not.toHaveAttribute("title");
    expect(screen.getByTestId("sync-status-icon")).toHaveAttribute("data-icon", "refresh-cw");
    expect(screen.getByTestId("sync-status-icon")).toHaveClass("animate-pulse");
  });

  it("renders a static danger icon while offline", () => {
    connectionStatus = SyncConnectionStatus.Offline;
    render(<SyncStatusIndicator />);
    elapseGraceWindow();

    const trigger = screen.getByRole("button", { name: "Unable to sync" });
    expect(trigger).toHaveClass("text-danger");
    expect(screen.getByTestId("sync-status-icon")).toHaveAttribute("data-icon", "wifi-off");
    expect(screen.getByTestId("sync-status-icon")).not.toHaveClass("animate-pulse");
  });

  it("shows the reconnecting label in a tooltip on focus", () => {
    render(<SyncStatusIndicator />);
    elapseGraceWindow();

    expect(focusTrigger()).toHaveFocus();

    expect(screen.getByTestId("sync-status-tooltip")).toHaveTextContent("Reconnecting");
  });

  it("shows the offline label in a tooltip on tap", () => {
    connectionStatus = SyncConnectionStatus.Offline;
    render(<SyncStatusIndicator />);
    elapseGraceWindow();

    expect(screen.queryByTestId("sync-status-tooltip")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unable to sync" }));

    expect(screen.getByTestId("sync-status-tooltip")).toHaveTextContent("Unable to sync");
  });

  it("announces the problem, an escalation, and the recovery — but not the initial mount", () => {
    const { rerender } = render(<SyncStatusIndicator />);
    expect(screen.getByTestId("sync-status-announcement")).toBeEmptyDOMElement();

    elapseGraceWindow();
    expect(screen.getByTestId("sync-status-announcement")).toHaveTextContent("Reconnecting");

    connectionStatus = SyncConnectionStatus.Offline;
    rerender(<SyncStatusIndicator />);
    elapseGraceWindow();
    expect(screen.getByTestId("sync-status-announcement")).toHaveTextContent("Unable to sync");

    connectionStatus = SyncConnectionStatus.Connected;
    rerender(<SyncStatusIndicator />);
    elapseGraceWindow();
    expect(screen.queryByTestId("sync-status-trigger")).not.toBeInTheDocument();
    expect(screen.getByTestId("sync-status-announcement")).toHaveTextContent("Connected");
  });

  it("does not thrash the displayed status or announcement while the connection keeps flapping after a problem is already showing", () => {
    const { rerender } = render(<SyncStatusIndicator />);
    elapseGraceWindow();
    expect(screen.getByTestId("sync-status-announcement")).toHaveTextContent("Reconnecting");

    connectionStatus = SyncConnectionStatus.Connected;
    rerender(<SyncStatusIndicator />);
    act(() => vi.advanceTimersByTime(GRACE_MS / 2));

    connectionStatus = SyncConnectionStatus.Reconnecting;
    rerender(<SyncStatusIndicator />);
    act(() => vi.advanceTimersByTime(GRACE_MS / 2));

    connectionStatus = SyncConnectionStatus.Connected;
    rerender(<SyncStatusIndicator />);

    // None of the flaps above have had a full grace window to settle, so nothing has changed yet.
    expect(screen.getByRole("button", { name: "Reconnecting" })).toBeInTheDocument();
    expect(screen.getByTestId("sync-status-announcement")).toHaveTextContent("Reconnecting");

    elapseGraceWindow();

    // Only the final, settled status is shown/announced — not one update per flap.
    expect(screen.queryByTestId("sync-status-trigger")).not.toBeInTheDocument();
    expect(screen.getByTestId("sync-status-announcement")).toHaveTextContent("Connected");
  });

  it("does not announce anything when a rerender leaves the status unchanged", () => {
    connectionStatus = SyncConnectionStatus.Connected;
    const { rerender } = render(<SyncStatusIndicator />);

    rerender(<SyncStatusIndicator />);
    rerender(<SyncStatusIndicator />);
    elapseGraceWindow();

    expect(screen.getByTestId("sync-status-announcement")).toBeEmptyDOMElement();
  });

  it("hands focus to the main region when recovery unmounts the focused trigger", () => {
    const { rerender } = render(
      <>
        <main id="main-content" />
        <SyncStatusIndicator />
      </>
    );
    elapseGraceWindow();

    expect(focusTrigger()).toHaveFocus();

    connectionStatus = SyncConnectionStatus.Connected;
    rerender(
      <>
        <main id="main-content" />
        <SyncStatusIndicator />
      </>
    );
    elapseGraceWindow();

    expect(document.getElementById("main-content")).toHaveFocus();
  });

  it("keeps the reconnecting icon static when reduced motion is preferred", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(mockMatchMedia(true));

    render(<SyncStatusIndicator />);
    elapseGraceWindow();

    expect(screen.getByTestId("sync-status-icon")).not.toHaveClass("animate-pulse");
  });

  it("toggles the reconnecting icon to static when reduced-motion preference changes", () => {
    const mediaQuery = mockMatchMedia(false);
    vi.spyOn(window, "matchMedia").mockReturnValue(mediaQuery);

    render(<SyncStatusIndicator />);
    elapseGraceWindow();
    expect(screen.getByTestId("sync-status-icon")).toHaveClass("animate-pulse");

    const changeListener = (mediaQuery.addEventListener as ReturnType<typeof vi.fn>).mock.calls[0][1] as () => void;
    mediaQuery.matches = true;
    act(() => changeListener());

    expect(screen.getByTestId("sync-status-icon")).not.toHaveClass("animate-pulse");
  });

  it("removes the reduced-motion listener on unmount", () => {
    const mediaQuery = mockMatchMedia(false);
    vi.spyOn(window, "matchMedia").mockReturnValue(mediaQuery);

    const { unmount } = render(<SyncStatusIndicator />);
    unmount();

    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
