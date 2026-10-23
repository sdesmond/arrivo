"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { LiveSyncEventType } from "@/data/types";
import type { LiveSyncEvent } from "@/data/types";
import { useLiveSync } from "@/lib/use-live-sync";
import {
  clearRevocationTicket,
  getRevocationTicket,
  getServerRevocationTicket,
  publishRevocationTicket,
  subscribeRevocation,
} from "@/lib/revocation-ticket";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ContributorRevocationModalProps {
  userId: string;
}

/**
 * Mounted once in `(app)/layout.tsx`, alongside `SyncStatusIndicator`, so it is present on every
 * authenticated page. It opens its own connection to the signed-in user's personal SSE channel
 * (the same default `/api/users/me/events` the sync indicator uses) and watches for a
 * `membership-removed` event naming this user. When one arrives it publishes the revocation
 * ticket — which the open trip page (if any) consumes to force-close its dialogs — and renders a
 * non-dismissible confirmation naming the trip and the manager who removed access, built only
 * from the event's own payload fields. A refetch is never an option here: `assertTripAccess()`
 * would reject the very access this modal is announcing has been revoked.
 */
export function ContributorRevocationModal({ userId }: ContributorRevocationModalProps): ReactElement | null {
  const router = useRouter();
  const ticket = useSyncExternalStore(subscribeRevocation, getRevocationTicket, getServerRevocationTicket);

  function handleLiveSyncEvent(event: LiveSyncEvent): void {
    if (event.type !== LiveSyncEventType.MembershipRemoved) return;
    if (event.removedUserId !== userId) return;
    publishRevocationTicket(event);
  }

  useLiveSync(undefined, handleLiveSyncEvent);

  // Never leave a stale ticket behind if this (persistently-mounted) modal ever unmounts.
  useEffect(() => clearRevocationTicket, []);

  if (!ticket || ticket.type !== LiveSyncEventType.MembershipRemoved) return null;

  function handleOk(): void {
    clearRevocationTicket();
    router.push("/trips");
    // The modal is app-shell-wide, so the user may already be on /trips — where `push` resolves to
    // the current URL and is served from the client router cache, leaving the revoked trip listed.
    // `refresh` re-runs the route's server fetch either way.
    router.refresh();
  }

  return (
    <AlertDialog open>
      <AlertDialogContent size="default">
        <AlertDialogHeader>
          <AlertDialogTitle>Removed from {ticket.tripName}</AlertDialogTitle>
          <AlertDialogDescription>
            {ticket.removedByName} (@{ticket.removedByUsername}) removed you as a contributor on this trip. You no
            longer have access to it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleOk}>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
