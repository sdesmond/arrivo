"use client";

import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OfflineSyncStatus } from "@/lib/offline/schema";

export interface PendingSyncBadgeProps {
  syncStatus: OfflineSyncStatus;
  className?: string;
}

export function PendingSyncBadge({ syncStatus, className }: PendingSyncBadgeProps) {
  if (syncStatus === "synced") {
    return null;
  }

  return (
    <span
      aria-label="Pending sync"
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium", className)}
      style={{
        background: "var(--accent-soft)",
        color: "var(--accent-ink)",
        fontSize: "11px",
      }}
    >
      <Clock3 size={12} strokeWidth={1.5} aria-hidden="true" />
      <span>Sync pending</span>
    </span>
  );
}
