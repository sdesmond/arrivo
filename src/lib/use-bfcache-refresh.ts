"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * A back/forward-cache (bfcache) restoration replays the page's last-rendered DOM straight
 * from the browser cache — it skips React's mount cycle and, with it, the server data fetch
 * that runs `assertTripAccess()`. Without this hook, a contributor removed while their trip
 * page is bfcache-eligible could hit Back and briefly see the cached (now-stale) page again.
 *
 * `pageshow` fires on every navigation to this page, including a normal first load, but only
 * carries `persisted: true` when the page came from bfcache — so this only ever refreshes for
 * a genuine restoration, re-running the page's server fetch (and its access check) once.
 */
export function useBfcacheRefresh(): void {
  const router = useRouter();

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent): void {
      if (!event.persisted) return;
      router.refresh();
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);
}
