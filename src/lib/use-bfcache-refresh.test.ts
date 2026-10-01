import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBfcacheRefresh } from "./use-bfcache-refresh";

const { mockRouterRefresh } = vi.hoisted(() => ({
  mockRouterRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

function emitPageShow(persisted: boolean): void {
  const event = new Event("pageshow") as PageTransitionEvent;
  Object.defineProperty(event, "persisted", { value: persisted });
  window.dispatchEvent(event);
}

describe("useBfcacheRefresh", () => {
  beforeEach(() => {
    mockRouterRefresh.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes once when pageshow fires with persisted true", () => {
    renderHook(() => useBfcacheRefresh());

    act(() => emitPageShow(true));

    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it("does not refresh when pageshow fires with persisted false (a normal load)", () => {
    renderHook(() => useBfcacheRefresh());

    act(() => emitPageShow(false));

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("removes its listener on unmount, so a later pageshow does not refresh", () => {
    const { unmount } = renderHook(() => useBfcacheRefresh());
    unmount();

    act(() => emitPageShow(true));

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("refreshes again on a second persisted pageshow", () => {
    renderHook(() => useBfcacheRefresh());

    act(() => emitPageShow(true));
    act(() => emitPageShow(true));

    expect(mockRouterRefresh).toHaveBeenCalledTimes(2);
  });
});
