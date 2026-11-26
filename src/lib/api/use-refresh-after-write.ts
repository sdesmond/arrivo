"use client";
import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { coordinateRefresh } from "@/lib/refresh-coordinator";

/**
 * Refreshes the route after a committed API write, queued behind any refresh already running. The trip page's live
 * refresh fires for the same write, and two overlapping refreshes abort one another, which makes Next fall back to a
 * full page load that discards open sections and dialogs.
 */
export function useRefreshAfterWrite(): () => void {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const waiters = useRef(new Set<() => void>());
  const mounted = useRef(false);

  useEffect(() => {
    if (pending) return;
    for (const resolve of waiters.current) resolve();
    waiters.current.clear();
  }, [pending]);

  useEffect(() => {
    const current = waiters.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const resolve of current) resolve();
      current.clear();
    };
  }, []);

  return () => {
    void coordinateRefresh(
      () =>
        new Promise<void>((resolve) => {
          // An unmounted component never re-renders, so nothing would release this waiter and the shared queue
          // would stall behind it.
          if (!mounted.current) {
            router.refresh();
            resolve();
            return;
          }
          waiters.current.add(resolve);
          try {
            startTransition(() => router.refresh());
          } catch {
            waiters.current.delete(resolve);
            resolve();
          }
        })
    ).catch(() => undefined);
  };
}
