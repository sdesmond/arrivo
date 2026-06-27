"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type PanelPlacement = "below" | "above";

export interface ViewportClampedPanel {
  placement: PanelPlacement;
  maxHeightPx: number | undefined;
  maxWidthPx: number | undefined;
}

export interface ViewportClampedPanelOptions {
  margin?: number;
  preferredWidth?: number;
}

const DEFAULT_MARGIN_PX = 16;
const MIN_PANEL_HEIGHT_PX = 96;
const MIN_PANEL_WIDTH_PX = 240;

/**
 * Keeps an absolutely-positioned dropdown panel on-screen. `position: absolute`
 * content isn't constrained by viewport edges — only by its own size — so a
 * panel anchored near the bottom or right edge of a narrow mobile screen can
 * render past the visible viewport with no way to scroll it into view (the
 * page itself doesn't scroll while a modal is open). Measures the trigger
 * against the viewport on open (and on resize/scroll) and reports whether the
 * panel should flip above the trigger, how tall it can be before it would run
 * off the bottom, and (when `preferredWidth` is given) how wide it can be
 * before it would run off the right edge.
 *
 * `maxHeightPx`/`maxWidthPx` of `undefined` means there's enough room for the
 * preferred size — callers should fall back to their own default in that case.
 */
export function useViewportClampedPanel(
  isOpen: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  preferredHeight: number,
  options: ViewportClampedPanelOptions = {}
): ViewportClampedPanel {
  const { margin = DEFAULT_MARGIN_PX, preferredWidth } = options;
  const [panel, setPanel] = useState<ViewportClampedPanel>({
    placement: "below",
    maxHeightPx: undefined,
    maxWidthPx: undefined,
  });
  const preferredHeightRef = useRef(preferredHeight);
  const preferredWidthRef = useRef(preferredWidth);
  useEffect(() => {
    preferredHeightRef.current = preferredHeight;
    preferredWidthRef.current = preferredWidth;
  }, [preferredHeight, preferredWidth]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function recalculate(): void {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const preferred = preferredHeightRef.current;
      const preferredPanelWidth = preferredWidthRef.current;
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const spaceRight = window.innerWidth - rect.left - margin;
      const maxWidthPx =
        preferredPanelWidth === undefined || spaceRight >= preferredPanelWidth
          ? undefined
          : Math.max(spaceRight, MIN_PANEL_WIDTH_PX);

      if (spaceBelow >= preferred || spaceBelow >= spaceAbove) {
        setPanel({
          placement: "below",
          maxHeightPx: spaceBelow >= preferred ? undefined : Math.max(spaceBelow, MIN_PANEL_HEIGHT_PX),
          maxWidthPx,
        });
        return;
      }

      setPanel({
        placement: "above",
        maxHeightPx: spaceAbove >= preferred ? undefined : Math.max(spaceAbove, MIN_PANEL_HEIGHT_PX),
        maxWidthPx,
      });
    }

    recalculate();
    window.addEventListener("resize", recalculate);
    window.addEventListener("scroll", recalculate, true);
    return () => {
      window.removeEventListener("resize", recalculate);
      window.removeEventListener("scroll", recalculate, true);
    };
  }, [isOpen, margin, triggerRef]);

  return panel;
}
