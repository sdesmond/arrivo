"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LiveSyncEventType, SyncConnectionStatus } from "@/data/types";
import type { LiveSyncEvent } from "@/data/types";
import { useLiveSync } from "./use-live-sync";

const REFRESH_EVENT_TYPES = new Set<LiveSyncEventType>([
  LiveSyncEventType.ItineraryChanged,
  LiveSyncEventType.MembershipChanged,
]);

/**
 * Opens a trip's SSE channel and keeps the trip page's server-fetched data current. An
 * `itinerary-changed` or `membership-changed` event, or a reconnect after a drop, triggers one
 * `router.refresh()` (re-runs the page's RSC data fetch, so itinerary/expenses/contributors and the
 * viewer's `accessRole` all come back fresh together). `membership-removed` / `trip-deleted` frames
 * are left alone — those are 4.4/4.5 concerns.
 *
 * A monotonic generation counter means a burst of triggers landing close together (two edits in
 * quick succession, or a reconnect right after an event) collapses to a single refresh for the
 * latest generation: each trigger defers its `router.refresh()` call by one microtask and checks the
 * generation is still current before calling it, so an earlier, now-superseded trigger is a no-op by
 * the time its check runs. Unmounting or changing `tripId` also bumps the generation, so no trigger
 * fires after either.
 */
export function useTripLiveRefresh(tripId: string): void {
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
    if (REFRESH_EVENT_TYPES.has(event.type)) triggerRefresh();
  }

  const status = useLiveSync(`/api/trips/${tripId}/events`, handleLiveSyncEvent);

  // A fresh tripId means a fresh trip channel: the next Connected transition is an initial connect
  // again, and any trigger still in flight for the previous trip is invalidated.
  useEffect(() => {
    hasConnectedOnceRef.current = false;
    return () => {
      generationRef.current += 1;
    };
  }, [tripId]);

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
