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

type StatusListener = (status: SyncConnectionStatusValue) => void;
type EventListener = (event: LiveSyncEvent) => void;

interface SharedChannel {
  eventSource: EventSource;
  refCount: number;
  status: SyncConnectionStatusValue;
  watchdog: ReturnType<typeof setTimeout> | null;
  statusListeners: Set<StatusListener>;
  eventListeners: Set<EventListener>;
}

// Keyed by URL so every consumer of the same channel (e.g. SyncStatusIndicator and
// ContributorRevocationModal, both on the default personal-channel URL) shares one underlying
// EventSource instead of each opening its own. A page with several personal-channel consumers plus
// an open trip channel can otherwise approach the browser's per-origin HTTP/1.1 connection cap with
// just two open tabs, starving unrelated requests (navigations, server actions) of a socket.
const channels = new Map<string, SharedChannel>();

function broadcastStatus(channel: SharedChannel, status: SyncConnectionStatusValue): void {
  channel.status = status;
  channel.statusListeners.forEach((listener) => listener(status));
}

function resetWatchdog(channel: SharedChannel): void {
  if (channel.watchdog !== null) clearTimeout(channel.watchdog);
  channel.watchdog = setTimeout(() => broadcastStatus(channel, SyncConnectionStatus.Offline), DEAD_CHANNEL_TIMEOUT_MS);
}

function openChannel(url: string): SharedChannel {
  const eventSource = new EventSource(url);
  const channel: SharedChannel = {
    eventSource,
    refCount: 0,
    status: SyncConnectionStatus.Reconnecting,
    watchdog: null,
    statusListeners: new Set(),
    eventListeners: new Set(),
  };

  const markConnected = () => {
    broadcastStatus(channel, SyncConnectionStatus.Connected);
    resetWatchdog(channel);
  };

  eventSource.onopen = markConnected;
  eventSource.onmessage = (event) => {
    markConnected();
    const liveSyncEvent = parseLiveSyncEvent(event.data as string);
    if (liveSyncEvent) channel.eventListeners.forEach((listener) => listener(liveSyncEvent));
  };
  eventSource.onerror = () => {
    if (channel.status !== SyncConnectionStatus.Offline) broadcastStatus(channel, SyncConnectionStatus.Reconnecting);
  };
  resetWatchdog(channel);

  return channel;
}

function acquireChannel(url: string): { channel: SharedChannel; isNewChannel: boolean } {
  const existing = channels.get(url);
  if (existing) {
    existing.refCount += 1;
    return { channel: existing, isNewChannel: false };
  }

  const channel = openChannel(url);
  channel.refCount = 1;
  channels.set(url, channel);
  return { channel, isNewChannel: true };
}

/**
 * Releases the exact channel object the caller acquired — not whatever the shared map currently
 * holds at `url`. A stale effect cleanup (e.g. React StrictMode double-invoke ordering, or a
 * cleanup that runs after some other consumer's acquire/release cycle already replaced the map's
 * entry at this URL) must never decrement or close a *newer* channel it never opened.
 */
function releaseChannel(url: string, channel: SharedChannel): void {
  if (channels.get(url) !== channel) return;

  channel.refCount -= 1;
  if (channel.refCount > 0) return;

  if (channel.watchdog !== null) clearTimeout(channel.watchdog);
  channel.eventSource.close();
  channels.delete(url);
}

/**
 * Test-only teardown for the module-level registry above. `channels` outlives any single
 * `renderHook`, so a test that leaves a consumer mounted (or whose cleanup ordering shifts) would
 * otherwise leak a channel — and its watchdog timer — into the next test, where it reads as an
 * unrelated failure in an `EventSource` instance count. Call it from `beforeEach` in any suite that
 * drives the real hook.
 */
export function resetLiveSyncChannelsForTest(): void {
  for (const channel of channels.values()) {
    if (channel.watchdog !== null) clearTimeout(channel.watchdog);
    channel.eventSource.close();
  }
  channels.clear();
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
    const { channel, isNewChannel } = acquireChannel(url);

    // A brand-new channel always starts Reconnecting, so this is a no-op render. Joining an
    // already-open channel (a second consumer of the same URL, e.g. the revocation modal mounting
    // alongside SyncStatusIndicator) reflects its true current status immediately instead of lying
    // about a fresh Reconnecting state. Forcing Reconnecting only applies to a genuinely new
    // EventSource — see the reconnect-resync note below.
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate resync with the
       channel's current status on (re)acquire, not derivable state; see comment above. */
    setStatus(isNewChannel ? SyncConnectionStatus.Reconnecting : channel.status);

    // Per-consumer fan-out: each mounted consumer keeps its own listener pair on the shared
    // channel, so status and events reach every one of them rather than only the opener.
    //
    // Scope note on the forced Reconnecting above: it fires per *channel*, not per `url` change. A
    // consumer that switches `url` onto a channel some other consumer already holds Connected
    // therefore adopts Connected with no intervening transition, and an effect keyed on `status`
    // (e.g. useTripLiveRefresh's reconnect-resync watcher) would not see a fresh Connected edge.
    // No call site does that today — only useTripLiveRefresh opens trip channels, one at a time,
    // and its cleanup releases the old channel before the new one is acquired.
    const statusListener: StatusListener = (nextStatus) => setStatus(nextStatus);
    const eventListener: EventListener = (event) => onLiveSyncEventRef.current?.(event);
    channel.statusListeners.add(statusListener);
    channel.eventListeners.add(eventListener);

    return () => {
      channel.statusListeners.delete(statusListener);
      channel.eventListeners.delete(eventListener);
      releaseChannel(url, channel);
    };
  }, [url]);

  return status;
}
