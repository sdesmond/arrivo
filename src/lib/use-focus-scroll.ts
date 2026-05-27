"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function useFocusScroll() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");

  useEffect(() => {
    if (!focusId) return;
    const element = document.getElementById(`event-${focusId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    (element as HTMLElement | null)?.focus();
  }, [focusId]);
}
