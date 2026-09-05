"use client";

import { useEffect, useRef, useState } from "react";
import { LiveSyncEventType, SyncConnectionStatus } from "@/data/types";
import type { LiveSyncEvent, SyncConnectionStatus as SyncConnectionStatusValue } from "@/data/types";
import { LIVE_SYNC_DEAD_CHANNEL_GRACE_MS, SSE_HEARTBEAT_INTERVAL_MS } from "./live-sync-constants";

const DEAD_CHANNEL_TIMEOUT_MS = SSE_HEARTBEAT_INTERVAL_MS + LIVE_SYNC_DEAD_CHANNEL_GRACE_MS;

const KNOWN_LIVE_SYNC_EVENT_TYPES = new Set<string>(Object.values(LiveSyncEventType));

function parseLiveSyncEvent(rawData: string): LiveSyncEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) return null;

  const { type } = parsed as { type: unknown };
  if (typeof type !== "string" || type === "heartbeat" || !KNOWN_LIVE_SYNC_EVENT_TYPES.has(type)) return null;

  return parsed as LiveSyncEvent;
}

export function useLiveSync(
  url = "/api/users/me/events",
  onLiveSyncEvent?: (event: LiveSyncEvent) => void
): SyncConnectionStatusValue {
  const [status, setStatus] = useState<SyncConnectionStatusValue>(SyncConnectionStatus.Reconnecting);
  // Held in a ref so a new callback identity across renders never forces the effect below to tear
  // down and reopen the EventSource — only `url` changes should do that. Updated in an effect
  // (rather than during render) since mutating a ref's `.current` while rendering is disallowed.
  const onLiveSyncEventRef = useRef(onLiveSyncEvent);
  useEffect(() => {
    onLiveSyncEventRef.current = onLiveSyncEvent;
  });

  useEffect(() => {
    // Force a real transition out of Connected whenever this effect (re)runs for a new `url`. On
    // first mount `status` is already Reconnecting, so this is a no-op render. On a later `url`
    // change while still Connected, without this the new EventSource's `onopen` would call
    // `setStatus(Connected)` while state is already `"connected"` — React bails on the identical
    // value and skips the re-render, so a consumer's effect keyed on `status` (e.g.
    // useTripLiveRefresh's reconnect-resync watcher) never sees this as a fresh Connected
    // transition, and misreads the *next* genuine reconnect as the initial connect.
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate resync with the new
       `url`'s external EventSource identity, not derivable state; see comment above. */
    setStatus(SyncConnectionStatus.Reconnecting);

    let watchdog: ReturnType<typeof setTimeout> | null = null;

    const resetWatchdog = () => {
      if (watchdog !== null) clearTimeout(watchdog);
      watchdog = setTimeout(() => setStatus(SyncConnectionStatus.Offline), DEAD_CHANNEL_TIMEOUT_MS);
    };

    const eventSource = new EventSource(url);
    const markConnected = () => {
      setStatus(SyncConnectionStatus.Connected);
      resetWatchdog();
    };

    eventSource.onopen = markConnected;
    eventSource.onmessage = (event) => {
      markConnected();
      const liveSyncEvent = parseLiveSyncEvent(event.data as string);
      if (liveSyncEvent) onLiveSyncEventRef.current?.(liveSyncEvent);
    };
    eventSource.onerror = () =>
      setStatus((currentStatus) =>
        currentStatus === SyncConnectionStatus.Offline ? currentStatus : SyncConnectionStatus.Reconnecting
      );
    resetWatchdog();

    return () => {
      if (watchdog !== null) clearTimeout(watchdog);
      eventSource.close();
    };
  }, [url]);

  return status;
}
