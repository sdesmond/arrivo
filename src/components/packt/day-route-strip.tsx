"use client";

import type { ReactElement } from "react";
import type { DayRouteSummary, TransitMode } from "@/data/types";
import { cn } from "@/lib/utils";

export interface DayRouteStripProps {
  summary: DayRouteSummary;
  tripId: string;
  dayNumber: number;
  tripTransitMode: TransitMode;
}

function formatDistance(distanceMeters: number): string {
  return distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)} km` : `${distanceMeters} m`;
}

function formatDuration(durationSeconds: number): string {
  const totalMinutes = Math.round(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} hr ${minutes} min` : `${totalMinutes} min`;
}

export function DayRouteStrip({ summary, tripId, dayNumber, tripTransitMode }: DayRouteStripProps): ReactElement {
  const isLoading = summary.status === "loading";
  const isUnavailable = summary.status === "unavailable";
  const thumbnailLabel = isLoading
    ? "Route loading"
    : isUnavailable
      ? `Route unavailable for day ${dayNumber}`
      : `Route overview for day ${dayNumber}`;

  return (
    <div
      className="my-3 flex items-center gap-3"
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
        <p style={{ color: "var(--fg-3)", fontSize: "calc(14px * var(--font-scale))" }}>
          <span style={{ color: "var(--fg)", fontWeight: 600 }}>{formatDistance(summary.totalDistanceMeters)}</span>
          {` · ${formatDuration(summary.totalDurationSeconds)} · ${tripTransitMode}`}
        </p>
      )}
      {isUnavailable && (
        <p style={{ color: "var(--fg-3)", fontSize: "calc(14px * var(--font-scale))" }}>Route unavailable</p>
      )}
    </div>
  );
}
