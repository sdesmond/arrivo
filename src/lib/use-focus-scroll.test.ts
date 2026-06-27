import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mockGet }),
}));

import { useFocusScroll } from "./use-focus-scroll";

beforeEach(() => {
  mockGet.mockReset();
});

describe("useFocusScroll", () => {
  it("does not scroll when no focus param", () => {
    mockGet.mockReturnValue(null);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderHook(() => useFocusScroll());
    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
  });

  it("calls scrollIntoView when focus param is set and element exists", () => {
    mockGet.mockReturnValue("ev-123");
    const element = document.createElement("div");
    element.id = "event-ev-123";
    const scrollIntoView = vi.fn();
    element.scrollIntoView = scrollIntoView;
    document.body.appendChild(element);

    renderHook(() => useFocusScroll());

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    document.body.removeChild(element);
  });

  it("retries until the target element mounts (e.g. after a tab switch) and then scrolls", () => {
    vi.useFakeTimers();
    mockGet.mockReturnValue("ev-123");

    renderHook(() => useFocusScroll());

    // The element isn't in the DOM yet — simulates the target tab still switching in.
    act(() => {
      vi.advanceTimersByTime(100);
    });

    const element = document.createElement("div");
    element.id = "event-ev-123";
    const scrollIntoView = vi.fn();
    element.scrollIntoView = scrollIntoView;
    document.body.appendChild(element);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    document.body.removeChild(element);
    vi.useRealTimers();
  });

  it("gives up retrying once the poll timeout elapses without the element mounting", () => {
    vi.useFakeTimers();
    mockGet.mockReturnValue("ev-123");

    renderHook(() => useFocusScroll());

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(document.getElementById("event-ev-123")).toBeNull();
    vi.useRealTimers();
  });

  it("returns null when no focus param is set", () => {
    mockGet.mockReturnValue(null);
    const { result } = renderHook(() => useFocusScroll());
    expect(result.current).toBeNull();
  });

  it("does not highlight immediately, so the pulse waits for the scroll to settle", () => {
    vi.useFakeTimers();
    mockGet.mockReturnValue("ev-123");

    const { result } = renderHook(() => useFocusScroll());
    expect(result.current).toBeNull();

    vi.useRealTimers();
  });

  it("returns the focused event id once the scroll-settle delay elapses", () => {
    vi.useFakeTimers();
    mockGet.mockReturnValue("ev-123");

    const { result } = renderHook(() => useFocusScroll());

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe("ev-123");
    vi.useRealTimers();
  });

  it("clears the highlighted event id after the pulse duration elapses", () => {
    vi.useFakeTimers();
    mockGet.mockReturnValue("ev-123");

    const { result } = renderHook(() => useFocusScroll());

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe("ev-123");

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current).toBeNull();
    vi.useRealTimers();
  });
});
