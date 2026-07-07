import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useViewportClampedPanel } from "./use-viewport-clamped-panel";

function makeTriggerRef(rect: Partial<DOMRect>): { current: HTMLElement } {
  const element = document.createElement("button");
  element.getBoundingClientRect = () =>
    ({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect;
  return { current: element };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useViewportClampedPanel", () => {
  it("opens below with no clamp when there is plenty of room beneath the trigger", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
    const triggerRef = makeTriggerRef({ top: 100, bottom: 140 });

    const { result } = renderHook(() => useViewportClampedPanel(true, triggerRef, 320));

    expect(result.current).toEqual({ placement: "below", maxHeightPx: undefined, maxWidthPx: undefined });
  });

  it("clamps the height when there isn't enough room below but there's more room below than above", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(400);
    // ~244px below the trigger, ~84px above — below is tighter than preferred but still the larger side.
    const triggerRef = makeTriggerRef({ top: 100, bottom: 140 });

    const { result } = renderHook(() => useViewportClampedPanel(true, triggerRef, 320));

    expect(result.current.placement).toBe("below");
    expect(result.current.maxHeightPx).toBe(400 - 140 - 16);
  });

  it("flips above the trigger when there's more room above than below and below doesn't fit", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(500);
    // Trigger near the bottom of a short viewport: ~20px below, ~430px above.
    const triggerRef = makeTriggerRef({ top: 450, bottom: 480 });

    const { result } = renderHook(() => useViewportClampedPanel(true, triggerRef, 320));

    expect(result.current.placement).toBe("above");
    expect(result.current.maxHeightPx).toBeUndefined();
  });

  it("clamps the height when flipped above and even the space above is tight", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(220);
    const triggerRef = makeTriggerRef({ top: 150, bottom: 180 });

    const { result } = renderHook(() => useViewportClampedPanel(true, triggerRef, 320));

    expect(result.current.placement).toBe("above");
    expect(result.current.maxHeightPx).toBe(150 - 16);
  });

  it("does not recalculate while closed", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(500);
    const triggerRef = makeTriggerRef({ top: 450, bottom: 480 });

    const { result } = renderHook(() => useViewportClampedPanel(false, triggerRef, 320));

    expect(result.current).toEqual({ placement: "below", maxHeightPx: undefined, maxWidthPx: undefined });
  });

  it("recalculates on window resize while open", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
    const triggerRef = makeTriggerRef({ top: 100, bottom: 140 });

    const { result } = renderHook(() => useViewportClampedPanel(true, triggerRef, 320));
    expect(result.current.maxHeightPx).toBeUndefined();

    vi.spyOn(window, "innerHeight", "get").mockReturnValue(400);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.maxHeightPx).toBe(400 - 140 - 16);
  });

  it("leaves maxWidthPx undefined when no preferredWidth option is given", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(300);
    const triggerRef = makeTriggerRef({ top: 0, bottom: 36, left: 250 });

    const { result } = renderHook(() => useViewportClampedPanel(true, triggerRef, 320));

    expect(result.current.maxWidthPx).toBeUndefined();
  });

  it("leaves maxWidthPx undefined when there's enough room to the right of the trigger", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(800);
    const triggerRef = makeTriggerRef({ top: 0, bottom: 36, left: 10 });

    const { result } = renderHook(() => useViewportClampedPanel(true, triggerRef, 320, { preferredWidth: 320 }));

    expect(result.current.maxWidthPx).toBeUndefined();
  });

  it("clamps the width when there isn't enough room to the right of the trigger", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(300);
    // 300 - 20 (left) - 16 (margin) = 264px available, between the 240px floor and the 320px preference.
    const triggerRef = makeTriggerRef({ top: 0, bottom: 36, left: 20 });

    const { result } = renderHook(() => useViewportClampedPanel(true, triggerRef, 320, { preferredWidth: 320 }));

    expect(result.current.maxWidthPx).toBe(264);
  });

  it("floors the clamped width at the minimum panel width on very narrow viewports", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(300);
    const triggerRef = makeTriggerRef({ top: 0, bottom: 36, left: 250 });

    const { result } = renderHook(() => useViewportClampedPanel(true, triggerRef, 320, { preferredWidth: 320 }));

    expect(result.current.maxWidthPx).toBe(240);
  });
});
