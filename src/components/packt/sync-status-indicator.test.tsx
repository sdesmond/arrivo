import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("SyncStatusIndicator", () => {
  beforeEach(() => {
    connectionStatus = SyncConnectionStatus.Reconnecting;
    vi.spyOn(window, "matchMedia").mockReturnValue(mockMatchMedia(false));
  });

  it("renders reconnecting with a warning pulsing dot and no initial announcement", () => {
    render(<SyncStatusIndicator />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Reconnecting")).toHaveClass("text-warning");
    expect(screen.getByTestId("sync-status-dot")).toHaveClass("bg-warning", "animate-pulse");
    expect(screen.getByTestId("sync-status-announcement")).toBeEmptyDOMElement();
  });

  it("renders connected quietly with the muted token", () => {
    connectionStatus = SyncConnectionStatus.Connected;
    render(<SyncStatusIndicator />);

    expect(screen.getByText("Connected")).toHaveClass("text-fg-4");
    expect(screen.getByTestId("sync-status-dot")).toHaveClass("bg-fg-4");
  });

  it("renders offline microcopy with a static danger dot", () => {
    connectionStatus = SyncConnectionStatus.Offline;
    render(<SyncStatusIndicator />);

    expect(screen.getByText("You're offline. Changes from other people won't appear until you reconnect.")).toHaveClass(
      "text-danger"
    );
    expect(screen.getByTestId("sync-status-dot")).toHaveClass("bg-danger");
    expect(screen.getByTestId("sync-status-dot")).not.toHaveClass("animate-pulse");
  });

  it("announces state transitions but not initial mount", () => {
    const { rerender } = render(<SyncStatusIndicator />);
    expect(screen.getByTestId("sync-status-announcement")).toBeEmptyDOMElement();

    connectionStatus = SyncConnectionStatus.Connected;
    rerender(<SyncStatusIndicator />);

    expect(screen.getByTestId("sync-status-announcement")).toHaveTextContent("Connected");
  });

  it("keeps the reconnecting dot static when reduced motion is preferred", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(mockMatchMedia(true));

    render(<SyncStatusIndicator />);

    expect(screen.getByTestId("sync-status-dot")).not.toHaveClass("animate-pulse");
  });

  it("toggles the dot to static when the reduced-motion preference changes while mounted", () => {
    const mediaQuery = mockMatchMedia(false);
    vi.spyOn(window, "matchMedia").mockReturnValue(mediaQuery);

    render(<SyncStatusIndicator />);
    expect(screen.getByTestId("sync-status-dot")).toHaveClass("animate-pulse");

    const changeListener = (mediaQuery.addEventListener as ReturnType<typeof vi.fn>).mock.calls[0][1] as () => void;
    mediaQuery.matches = true;
    act(() => changeListener());

    expect(screen.getByTestId("sync-status-dot")).not.toHaveClass("animate-pulse");
  });

  it("removes the reduced-motion change listener on unmount", () => {
    const mediaQuery = mockMatchMedia(false);
    vi.spyOn(window, "matchMedia").mockReturnValue(mediaQuery);

    const { unmount } = render(<SyncStatusIndicator />);
    unmount();

    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
