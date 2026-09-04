"use client";

import { useEffect, useState } from "react";
import { SyncConnectionStatus } from "@/data/types";
import type { SyncConnectionStatus as SyncConnectionStatusValue } from "@/data/types";
import { LIVE_SYNC_DEAD_CHANNEL_GRACE_MS, SSE_HEARTBEAT_INTERVAL_MS } from "./live-sync-constants";

const DEAD_CHANNEL_TIMEOUT_MS = SSE_HEARTBEAT_INTERVAL_MS + LIVE_SYNC_DEAD_CHANNEL_GRACE_MS;

export function useLiveSync(url = "/api/users/me/events"): SyncConnectionStatusValue {
  const [status, setStatus] = useState<SyncConnectionStatusValue>(SyncConnectionStatus.Reconnecting);

  useEffect(() => {
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
    eventSource.onmessage = markConnected;
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
