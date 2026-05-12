"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function useFocusScroll() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`event-${focusId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    (el as HTMLElement | null)?.focus();
  }, [focusId]);
}
