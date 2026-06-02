import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-is-mobile";

type ChangeHandler = (e: MediaQueryListEvent) => void;

function makeMql(matches: boolean) {
  const handlers: ChangeHandler[] = [];
  const mql = {
    matches,
    media: "",
    addEventListener: vi.fn((_: string, handler: ChangeHandler) => handlers.push(handler)),
    removeEventListener: vi.fn((_: string, handler: ChangeHandler) => {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    }),
    fire(newMatches: boolean) {
      handlers.forEach((handler) => handler({ matches: newMatches } as MediaQueryListEvent));
    },
  };
  return mql;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("useIsMobile", () => {
  it("returns true after effect runs when matchMedia reports a match", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(makeMql(true) as unknown as MediaQueryList);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false after effect runs when matchMedia reports no match", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(makeMql(false) as unknown as MediaQueryList);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("updates to true when a change event fires with matches=true", () => {
    const mql = makeMql(false);
    vi.spyOn(window, "matchMedia").mockReturnValue(mql as unknown as MediaQueryList);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => mql.fire(true));
    expect(result.current).toBe(true);
  });

  it("updates to false when a change event fires with matches=false", () => {
    const mql = makeMql(true);
    vi.spyOn(window, "matchMedia").mockReturnValue(mql as unknown as MediaQueryList);
    const { result } = renderHook(() => useIsMobile());
    act(() => mql.fire(false));
    expect(result.current).toBe(false);
  });

  it("calls matchMedia with the correct query for the default breakpoint", () => {
    const spy = vi.spyOn(window, "matchMedia").mockReturnValue(makeMql(false) as unknown as MediaQueryList);
    renderHook(() => useIsMobile());
    expect(spy).toHaveBeenCalledWith("(max-width: 639px)");
  });

  it("calls matchMedia with the correct query for a custom breakpoint", () => {
    const spy = vi.spyOn(window, "matchMedia").mockReturnValue(makeMql(false) as unknown as MediaQueryList);
    renderHook(() => useIsMobile(768));
    expect(spy).toHaveBeenCalledWith("(max-width: 767px)");
  });

  it("removes the change listener on unmount", () => {
    const mql = makeMql(false);
    vi.spyOn(window, "matchMedia").mockReturnValue(mql as unknown as MediaQueryList);
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledOnce();
  });
});
