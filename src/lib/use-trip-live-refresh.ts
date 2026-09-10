"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LiveSyncEventType } from "@/data/types";
import type { LiveSyncEvent } from "@/data/types";
import { useLiveRefresh } from "./use-live-refresh";
import { useLiveSync } from "./use-live-sync";

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
 *
 * Also joins the signed-in user's personal channel (ref-counted alongside any other consumer, e.g.
 * `ContributorRevocationModal` — see `use-live-sync.ts`) to watch for a `membership-changed` event
 * naming this trip. Unlike the trip-channel `membership-changed` above (broadcast to every
 * collaborator, used only to trigger a refresh), a personal-channel `membership-changed` is
 * inherently self-targeted — `saveContributorChanges` publishes it only to the affected user's own
 * channel — so `onSelfRoleChanged`, when given, fires immediately rather than waiting for the
 * refresh's round trip to correct role-gated UI.
 */
export function useTripLiveRefresh(tripId: string, onSelfRoleChanged?: () => void): void {
  const router = useRouter();
  const onSelfRoleChangedRef = useRef(onSelfRoleChanged);
  useEffect(() => {
    onSelfRoleChangedRef.current = onSelfRoleChanged;
  });

  function handleEvent(event: LiveSyncEvent): void {
    if (event.type !== LiveSyncEventType.TripDeleted) return;
    toast.error("This trip was deleted.");
    router.push("/trips");
  }

  useLiveRefresh(`/api/trips/${tripId}/events`, (event) => REFRESH_EVENT_TYPES.has(event.type), handleEvent);

  useLiveSync(undefined, (event) => {
    if (event.type === LiveSyncEventType.MembershipChanged && event.tripId === tripId) {
      onSelfRoleChangedRef.current?.();
    }
  });
}
