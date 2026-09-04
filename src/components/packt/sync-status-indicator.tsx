"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { SyncConnectionStatus } from "@/data/types";
import type { SyncConnectionStatus as SyncConnectionStatusValue } from "@/data/types";
import { cn } from "@/lib/utils";
import { useLiveSync } from "@/lib/use-live-sync";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Global indicator deliberately accepts no overrides.
export interface SyncStatusIndicatorProps {}

interface SyncStatusContent {
  announcement: string;
  label: string;
  textClassName: string;
  dotClassName: string;
}

const STATUS_CONTENT: Record<SyncConnectionStatusValue, SyncStatusContent> = {
  [SyncConnectionStatus.Connected]: {
    announcement: "Connected",
    label: "Connected",
    textClassName: "text-fg-4",
    dotClassName: "bg-fg-4",
  },
  [SyncConnectionStatus.Reconnecting]: {
    announcement: "Reconnecting",
    label: "Reconnecting",
    textClassName: "text-warning",
    dotClassName: "bg-warning",
  },
  [SyncConnectionStatus.Offline]: {
    announcement: "You're offline. Changes from other people won't appear until you reconnect.",
    label: "You're offline. Changes from other people won't appear until you reconnect.",
    textClassName: "text-danger",
    dotClassName: "bg-danger",
  },
};

function subscribeToReducedMotion(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getReducedMotionPreference(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerReducedMotionPreference(): boolean {
  return false;
}

export function SyncStatusIndicator({}: SyncStatusIndicatorProps): ReactElement {
  const status = useLiveSync();
  const previousStatus = useRef<SyncConnectionStatusValue | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionPreference,
    getServerReducedMotionPreference
  );
  const content = STATUS_CONTENT[status];

  useEffect(() => {
    if (previousStatus.current !== null && previousStatus.current !== status) {
      setAnnouncement(content.announcement);
    }
    previousStatus.current = status;
  }, [content.announcement, status]);

  return (
    <div data-testid="sync-status-indicator" className="fixed bottom-0 right-0 z-50 pb-14 pr-4 lg:pb-4">
      <div
        aria-hidden="true"
        className="flex items-center gap-2 rounded-full bg-surface px-3 py-2 shadow-sm"
        style={{
          border: "1px solid var(--line)",
          fontSize: "calc(13px * var(--font-scale))",
          fontWeight: 600,
          maxWidth: "min(90vw, 22rem)",
        }}
      >
        <span
          aria-hidden="true"
          data-testid="sync-status-dot"
          className={cn(
            "size-2 shrink-0 rounded-full",
            content.dotClassName,
            status === SyncConnectionStatus.Reconnecting && !prefersReducedMotion && "animate-pulse"
          )}
        />
        <span className={content.textClassName}>{content.label}</span>
      </div>
      <span role="status" aria-live="polite" className="sr-only" data-testid="sync-status-announcement">
        {announcement}
      </span>
      <div aria-hidden="true" style={{ height: "env(safe-area-inset-bottom)" }} />
    </div>
  );
}
