"use client";

import { Navigation } from "lucide-react";
import type { RouteResult, TransitMode } from "@/data/types";

export interface DistanceTimePillProps {
  eventName: string;
  routeResult: RouteResult;
  transitMode: TransitMode;
  onOpenMaps?: () => void;
}

const PILL_LAYOUT_CLASSNAME = "inline-flex items-center gap-1.5 h-11 min-w-11 px-3 rounded-full";
const PILL_TEXT_STYLE = { fontSize: "calc(13px * var(--font-scale))" } as const;
const PILL_ACTIVE_STYLE = { background: "var(--accent-soft)", color: "var(--accent-ink)" } as const;

function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${distanceMeters} m`;
  }

  const distanceKilometers = distanceMeters / 1000;
  const maximumFractionDigits = distanceKilometers < 10 ? 1 : 0;
  return `${distanceKilometers.toLocaleString(undefined, { maximumFractionDigits })} km`;
}

export function DistanceTimePill({ eventName, routeResult, transitMode, onOpenMaps }: DistanceTimePillProps) {
  if (routeResult.status === "loading") {
    // Loading is genuinely status information, not yet interactive — stays a
    // status region regardless of onOpenMaps.
    return (
      <div
        role="status"
        aria-label={`Getting directions to ${eventName}`}
        className={PILL_LAYOUT_CLASSNAME}
        style={{ background: "var(--surface-2)", color: "var(--fg-3)" }}
      >
        <Navigation size={16} strokeWidth={1.5} aria-hidden="true" />
      </div>
    );
  }

  if (routeResult.status === "unavailable") {
    const content = (
      <>
        <Navigation size={16} strokeWidth={1.5} aria-hidden="true" />
        <span style={PILL_TEXT_STYLE}>Couldn&apos;t get directions — try again.</span>
      </>
    );

    // The estimate failed but the maps action is never removed — tapping still
    // opens External Maps directly (AC 3).
    if (onOpenMaps) {
      return (
        <button
          type="button"
          onClick={onOpenMaps}
          aria-label={`Open maps for ${eventName}`}
          className={PILL_LAYOUT_CLASSNAME}
          style={PILL_ACTIVE_STYLE}
        >
          {content}
        </button>
      );
    }

    return (
      <div
        role="status"
        aria-label={`Couldn't get directions to ${eventName}`}
        className={PILL_LAYOUT_CLASSNAME}
        style={PILL_ACTIVE_STYLE}
      >
        {content}
      </div>
    );
  }

  const durationMinutes = Math.round(routeResult.durationSeconds / 60);
  const distanceTimeLabel = `${formatDistance(routeResult.distanceMeters)} · ${durationMinutes} min ${transitMode}`;
  const content = (
    <>
      <Navigation size={16} strokeWidth={1.5} aria-hidden="true" />
      <span style={PILL_TEXT_STYLE}>{distanceTimeLabel}</span>
    </>
  );

  if (onOpenMaps) {
    return (
      <button
        type="button"
        onClick={onOpenMaps}
        aria-label={`Open directions to ${eventName}, ${durationMinutes} min ${transitMode}`}
        className={PILL_LAYOUT_CLASSNAME}
        style={PILL_ACTIVE_STYLE}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      role="status"
      aria-label={`Directions to ${eventName}, ${distanceTimeLabel}`}
      className={PILL_LAYOUT_CLASSNAME}
      style={PILL_ACTIVE_STYLE}
    >
      {content}
    </div>
  );
}
