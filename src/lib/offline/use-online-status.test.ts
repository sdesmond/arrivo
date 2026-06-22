import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnlineStatus } from "./use-online-status";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.spyOn(window.navigator, "onLine", "get").mockRestore();
});

describe("useOnlineStatus", () => {
  it("reflects navigator.onLine after the effect runs", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("defaults to true when navigator reports online", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("updates to false when an offline event fires", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);
  });

  it("updates to true when an online event fires", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
  });

  it("removes the online/offline listeners on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useOnlineStatus());
    unmount();
    const addedEvents = addSpy.mock.calls.map((call) => call[0]);
    const removedEvents = removeSpy.mock.calls.map((call) => call[0]);
    expect(addedEvents).toEqual(expect.arrayContaining(["online", "offline"]));
    expect(removedEvents).toEqual(expect.arrayContaining(["online", "offline"]));
  });
});
