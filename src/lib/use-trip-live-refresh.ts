"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LiveSyncEventType } from "@/data/types";
import type { LiveSyncEvent } from "@/data/types";
import { useLiveRefresh } from "./use-live-refresh";

const REFRESH_EVENT_TYPES = new Set<LiveSyncEventType>([
  LiveSyncEventType.ItineraryChanged,
  LiveSyncEventType.MembershipChanged,
]);

/**
 * Opens a trip's SSE channel and keeps the trip page's server-fetched data current: an
 * `itinerary-changed` or `membership-changed` event, or a reconnect after a drop, triggers one
 * refresh, so itinerary/expenses/contributors and the viewer's `accessRole` all come back fresh
 * together. `membership-removed` is left alone — that's the revocation modal's concern
 * (`revocation-ticket.ts`). `trip-deleted` redirects to the trips list with a toast instead of
 * refreshing a page whose trip no longer exists. See `useLiveRefresh` for the generation-guard and
 * reconnect-resync mechanics.
 */
export function useTripLiveRefresh(tripId: string): void {
  const router = useRouter();

  function handleEvent(event: LiveSyncEvent): void {
    if (event.type !== LiveSyncEventType.TripDeleted) return;
    toast.error("This trip was deleted.");
    router.push("/trips");
  }

  useLiveRefresh(`/api/trips/${tripId}/events`, (event) => REFRESH_EVENT_TYPES.has(event.type), handleEvent);
}
