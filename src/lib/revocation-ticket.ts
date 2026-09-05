"use client";

import type { LiveSyncEvent } from "@/data/types";

/**
 * Module-level handoff between `ContributorRevocationModal` (app-shell, mounted in
 * `(app)/layout.tsx`) and the open trip page (`page-client.tsx`), so both can react to the same
 * self-targeted `membership-removed` event without prop-drilling through a server-component
 * layout. The modal publishes the ticket the moment it self-matches an event and clears it on
 * OK/unmount; the trip page force-closes its dialogs whenever a published ticket names its own
 * `tripId`.
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
  ticket = event;
  notifyListeners();
}

export function clearRevocationTicket(): void {
  if (ticket === null) return;
  ticket = null;
  notifyListeners();
}
