"use client";

import type { ReactElement } from "react";
import type { DayRouteSummary, TransitMode } from "@/data/types";
import { cn, formatDistance } from "@/lib/utils";
import { ScheduleConflictBadge } from "./schedule-conflict-badge";

export interface DayRouteStripProps {
  summary: DayRouteSummary;
  tripId: string;
  dayNumber: number;
  tripTransitMode: TransitMode;
  totalHopCount: number;
  conflictCount?: number;
  conflictingEventNames?: string[];
  onConflictClick?: () => void;
}

function formatDuration(durationSeconds: number): string {
  const totalMinutes = Math.round(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} hr ${minutes} min` : `${totalMinutes} min`;
}

export function DayRouteStrip({
  summary,
  tripId,
  dayNumber,
  tripTransitMode,
  totalHopCount,
  conflictCount,
  conflictingEventNames,
  onConflictClick,
}: DayRouteStripProps): ReactElement {
  const isLoading = summary.status === "loading";
  const isUnavailable = summary.status === "unavailable";
  const isPartial = summary.status === "ready" && summary.hopCount < totalHopCount;
  const thumbnailLabel = isLoading
    ? "Route loading"
    : isUnavailable
      ? `Route unavailable for day ${dayNumber}`
      : `Route overview for day ${dayNumber}`;

  return (
    <div
      className="my-3 flex items-center gap-3"
      data-testid="day-route-strip"
      data-trip-id={tripId}
      style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--bg)", padding: "12px 14px" }}
    >
      <div
        aria-label={thumbnailLabel}
        className={cn("min-h-11 min-w-11 shrink-0 overflow-hidden", isLoading && "animate-pulse")}
        role="img"
        style={{ width: 44, height: 44, borderRadius: 8, background: "var(--surface-2)" }}
      >
        {!isLoading && (
          <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 44 44">
            {!isUnavailable && (
              <path d="M7 11 L17 27 L35 15" fill="none" stroke="var(--accent-brand)" strokeWidth="2" />
            )}
            <circle cx="7" cy="11" r="3" fill="var(--surface-3)" stroke="var(--line-strong)" strokeWidth="1.5" />
            <circle cx="17" cy="27" r="3" fill="var(--accent-brand)" stroke="var(--accent-brand)" strokeWidth="1.5" />
            <circle cx="35" cy="15" r="3" fill="var(--surface-3)" stroke="var(--line-strong)" strokeWidth="1.5" />
          </svg>
        )}
      </div>
      {summary.status === "ready" && (
        <p
          className="min-w-0 flex-1 truncate"
          style={{ color: "var(--fg-3)", fontSize: "calc(14px * var(--font-scale))" }}
        >
          <span style={{ color: "var(--fg)", fontWeight: 600 }}>
            {isPartial ? "~" : ""}
            {formatDistance(summary.totalDistanceMeters)}
          </span>
          {` · ${formatDuration(summary.totalDurationSeconds)} · ${tripTransitMode}`}
        </p>
      )}
      {isUnavailable && (
        <p
          className="min-w-0 flex-1 truncate"
          style={{ color: "var(--fg-3)", fontSize: "calc(14px * var(--font-scale))" }}
        >
          Route unavailable
        </p>
      )}
      {conflictCount != null && (
        <div className="ml-auto shrink-0">
          <ScheduleConflictBadge
            count={conflictCount}
            conflictingEventNames={conflictingEventNames}
            onClick={onConflictClick ?? (() => {})}
          />
        </div>
      )}
    </div>
  );
}
