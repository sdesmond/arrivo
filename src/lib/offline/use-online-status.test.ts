import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderHook, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { useOnlineStatus } from "./use-online-status";

function StatusProbe() {
  const isOnline = useOnlineStatus();
  return createElement("span", null, isOnline ? "online" : "offline");
}

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
    let isOnline = true;
    vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => isOnline);
    const { result } = renderHook(() => useOnlineStatus());
    isOnline = false;
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);
  });

  it("updates to true when an online event fires", () => {
    let isOnline = false;
    vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => isOnline);
    const { result } = renderHook(() => useOnlineStatus());
    isOnline = true;
    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
  });

  it("hydrates without a server/client mismatch when navigator.onLine is false on mount", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const serverHtml = renderToString(createElement(StatusProbe));
    expect(serverHtml).toBe("<span>online</span>");

    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    act(() => {
      hydrateRoot(container, createElement(StatusProbe));
    });

    const hydrationMismatchCalled = consoleErrorSpy.mock.calls.some((call) => String(call[0]).includes("Hydration"));
    expect(hydrationMismatchCalled).toBe(false);
    expect(container.textContent).toBe("offline");

    document.body.removeChild(container);
    consoleErrorSpy.mockRestore();
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
