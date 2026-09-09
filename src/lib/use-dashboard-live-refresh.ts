"use client";

import { LiveSyncEventType } from "@/data/types";
import { useLiveRefresh } from "./use-live-refresh";

/**
 * Keeps the dashboard's trip list current while it is open. A `membership-changed` frame on the
 * personal channel — published by `saveContributorChanges` to each role-changed user, and by
 * `acceptInvitation` / `declineInvitation` to the acting user — triggers one refresh, re-running
 * `listTripsForUser` so roles, budget visibility and the trip set come back fresh together.
 * `trip-deleted` triggers the same refresh, so a trip deleted by another collaborator drops out of
 * the list live rather than waiting for a manual reload.
 *
 * `membership-removed` is deliberately NOT in the refresh map: the app-shell revocation modal owns
 * the removal UX wherever it fires, including here, so refreshing on arrival would only repaint a
 * list hidden behind the modal and double-refresh on OK.
 *
 * Passing no url joins the ref-counted personal EventSource the app shell already holds
 * (`SyncStatusIndicator` / `ContributorRevocationModal`) rather than opening a second connection,
 * per the 4.4 connection-cap constraint.
 */
export function useDashboardLiveRefresh(): void {
  useLiveRefresh(
    undefined,
    (event) => event.type === LiveSyncEventType.MembershipChanged || event.type === LiveSyncEventType.TripDeleted
  );
}
