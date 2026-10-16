"use client";

import { useRouter } from "next/navigation";
import { LiveSyncEventType } from "@/data/types";
import { useLiveSync } from "@/lib/use-live-sync";

/**
 * App-shell listener: an invitation addressed to this user was created, resent or rescinded, so
 * the server-rendered sidebar badge and dashboard list refresh wherever the user is. Joins the
 * ref-counted personal channel the shell already holds. Uses `useLiveSync` rather than
 * `useLiveRefresh` so a reconnect doesn't add a second refresh on top of the page's own.
 */
export function InvitationLiveRefresh() {
  const router = useRouter();
  useLiveSync(undefined, (event) => {
    if (event.type === LiveSyncEventType.InvitationChanged) router.refresh();
  });
  return null;
}
