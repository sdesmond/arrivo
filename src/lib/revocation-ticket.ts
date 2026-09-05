"use client";

import type { LiveSyncEvent } from "@/data/types";

/**
 * Module-level handoff between `ContributorRevocationModal` (app-shell, mounted in
 * `(app)/layout.tsx`) and the open trip page (`page-client.tsx`), so both can react to the same
 * self-targeted `membership-removed` event without prop-drilling through a server-component
 * layout. The modal publishes the ticket the moment it self-matches an event and clears it on
 * OK/unmount; the trip page force-closes its dialogs whenever a published ticket names its own
 * `tripId`.
 *
 * First removal wins: `publishRevocationTicket` ignores an event while a ticket is already
 * outstanding, so a user removed from two trips in the same burst keeps looking at the modal for
 * the first one rather than having it silently swapped for the second mid-read. The trade-off is
 * that the second removal is never announced — acknowledging the first only clears the ticket, it
 * does not replay anything queued behind it. Access to the second trip is still revoked
 * server-side, so the user meets `assertTripAccess()`'s `notFound()` if they navigate to it.
 */

let ticket: LiveSyncEvent | null = null;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

export function getRevocationTicket(): LiveSyncEvent | null {
  return ticket;
}

/** `useSyncExternalStore`'s `getServerSnapshot` — no revocation ticket exists during SSR. */
export function getServerRevocationTicket(): LiveSyncEvent | null {
  return null;
}

export function subscribeRevocation(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function publishRevocationTicket(event: LiveSyncEvent): void {
  // First removal wins — see the module docstring. Replacing an outstanding ticket would swap the
  // trip name out from under a modal the user is already reading.
  if (ticket !== null) return;
  ticket = event;
  notifyListeners();
}

export function clearRevocationTicket(): void {
  if (ticket === null) return;
  ticket = null;
  notifyListeners();
}
