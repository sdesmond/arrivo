"use client";

import { LiveSyncEventType } from "@/data/types";
import { useLiveRefresh } from "./use-live-refresh";

const REFRESH_EVENT_TYPES = new Set<LiveSyncEventType>([
  LiveSyncEventType.ItineraryChanged,
  LiveSyncEventType.MembershipChanged,
]);

/**
 * Opens a trip's SSE channel and keeps the trip page's server-fetched data current: an
 * `itinerary-changed` or `membership-changed` event, or a reconnect after a drop, triggers one
 * refresh, so itinerary/expenses/contributors and the viewer's `accessRole` all come back fresh
 * together. `membership-removed` / `trip-deleted` frames are left alone — those are 4.4/4.5
 * concerns. See `useLiveRefresh` for the generation-guard and reconnect-resync mechanics.
 */
export function useTripLiveRefresh(tripId: string): void {
  useLiveRefresh(`/api/trips/${tripId}/events`, (event) => REFRESH_EVENT_TYPES.has(event.type));
}
