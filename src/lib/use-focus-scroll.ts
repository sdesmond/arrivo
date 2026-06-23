"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const SCROLL_SETTLE_DELAY_MS = 500;
const FOCUS_HIGHLIGHT_DURATION_MS = 1500;

export function useFocusScroll(): string | null {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const [highlightedFocusId, setHighlightedFocusId] = useState<string | null>(null);
  const [dismissedFocusId, setDismissedFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId) return;
    const element = document.getElementById(`event-${focusId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    (element as HTMLElement | null)?.focus();
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
