"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SyncConnectionStatus } from "@/data/types";
import type { LiveSyncEvent } from "@/data/types";
import { useLiveSync } from "./use-live-sync";

/**
 * Subscribes to an SSE channel and keeps the current route's server-fetched data current: every
 * event `shouldRefresh` accepts, plus every reconnect after a drop, triggers one `router.refresh()`
 * (re-running the route's RSC data fetch, so everything it derives comes back fresh together).
 * Callers decide which channel and which event types matter — see `useTripLiveRefresh` and
 * `useDashboardLiveRefresh`.
 *
 * A monotonic generation counter means a burst of triggers landing close together (two edits in
 * quick succession, or a reconnect right after an event) collapses to a single refresh for the
 * latest generation: each trigger defers its `router.refresh()` call by one microtask and checks the
 * generation is still current before calling it, so an earlier, now-superseded trigger is a no-op by
 * the time its check runs. Unmounting or changing `url` also bumps the generation, so no trigger
 * fires after either.
 *
 * The first Connected transition is swallowed — that is the initial connect, and the page it is
 * mounted on was just server-rendered. Only a *subsequent* Connected is a reconnect, where events
 * may have been missed while the channel was down, so it resyncs. A `url` change is a fresh channel
 * and therefore a fresh initial connect.
 *
 * Passing `url` as `undefined` falls through to `useLiveSync`'s default personal-channel URL, which
 * joins the ref-counted EventSource the app shell already holds rather than opening a second one.
 */
export function useLiveRefresh(url: string | undefined, shouldRefresh: (event: LiveSyncEvent) => boolean): void {
  const router = useRouter();
  const generationRef = useRef(0);
  const hasConnectedOnceRef = useRef(false);

  function triggerRefresh(): void {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    Promise.resolve().then(() => {
      if (generationRef.current !== generation) return;
      router.refresh();
    });
  }

  function handleLiveSyncEvent(event: LiveSyncEvent): void {
    if (shouldRefresh(event)) triggerRefresh();
  }

  const status = useLiveSync(url, handleLiveSyncEvent);

  // A fresh url means a fresh channel: the next Connected transition is an initial connect again,
  // and any trigger still in flight for the previous channel is invalidated.
  useEffect(() => {
    hasConnectedOnceRef.current = false;
    return () => {
      generationRef.current += 1;
    };
  }, [url]);

  useEffect(() => {
    if (status !== SyncConnectionStatus.Connected) return;
    if (!hasConnectedOnceRef.current) {
      hasConnectedOnceRef.current = true;
      return;
    }
    triggerRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- triggerRefresh is a fresh closure each render; only `status` transitions should re-run this.
  }, [status]);
}
