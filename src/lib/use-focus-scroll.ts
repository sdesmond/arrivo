"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const SCROLL_SETTLE_DELAY_MS = 500;
const FOCUS_HIGHLIGHT_DURATION_MS = 1500;
const ELEMENT_POLL_INTERVAL_MS = 50;
const ELEMENT_POLL_TIMEOUT_MS = 2000;

export function useFocusScroll(): string | null {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const [highlightedFocusId, setHighlightedFocusId] = useState<string | null>(null);
  const [dismissedFocusId, setDismissedFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId) return;

    let cancelled = false;
    let elapsedMs = 0;

    // The target tab (e.g. Itinerary) may still be switching in when this runs — for example
    // navigating here from another tab sets the `tab` and `focus` params together, but the
    // `tab` state update commits after this effect's first pass. Poll briefly until the
    // element mounts instead of giving up on the first miss.
    function attemptScroll(): void {
      if (cancelled) return;
      const element = document.getElementById(`event-${focusId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.focus();
        return;
      }
      if (elapsedMs >= ELEMENT_POLL_TIMEOUT_MS) return;
      elapsedMs += ELEMENT_POLL_INTERVAL_MS;
      setTimeout(attemptScroll, ELEMENT_POLL_INTERVAL_MS);
    }

    attemptScroll();

    return () => {
      cancelled = true;
    };
  }, [focusId]);

  useEffect(() => {
    if (!focusId) return;
    const settleTimeoutId = setTimeout(() => setHighlightedFocusId(focusId), SCROLL_SETTLE_DELAY_MS);
    return () => clearTimeout(settleTimeoutId);
  }, [focusId]);

  useEffect(() => {
    if (!highlightedFocusId) return;
    const dismissTimeoutId = setTimeout(() => setDismissedFocusId(highlightedFocusId), FOCUS_HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(dismissTimeoutId);
  }, [highlightedFocusId]);

  return highlightedFocusId && highlightedFocusId !== dismissedFocusId ? highlightedFocusId : null;
}
