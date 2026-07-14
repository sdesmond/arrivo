"use client";

import { Navigation } from "lucide-react";
import type { RouteResult, TransitMode } from "@/data/types";

export interface DistanceTimePillProps {
  eventName: string;
  routeResult: RouteResult;
  transitMode: TransitMode;
}

const PILL_LAYOUT_CLASSNAME = "inline-flex items-center gap-1.5 h-11 min-w-11 px-3 rounded-full";
const PILL_TEXT_STYLE = { fontSize: "calc(13px * var(--font-scale))" } as const;

function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${distanceMeters} m`;
  }

  const distanceKilometers = distanceMeters / 1000;
  const maximumFractionDigits = distanceKilometers < 10 ? 1 : 0;
  return `${distanceKilometers.toLocaleString(undefined, { maximumFractionDigits })} km`;
}

export function DistanceTimePill({ eventName, routeResult, transitMode }: DistanceTimePillProps) {
  if (routeResult.status === "loading") {
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
    return (
      <div
        role="status"
        aria-label={`Couldn't get directions to ${eventName}`}
        className={PILL_LAYOUT_CLASSNAME}
        style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
      >
        <Navigation size={16} strokeWidth={1.5} aria-hidden="true" />
        <span style={PILL_TEXT_STYLE}>Couldn&apos;t get directions — try again.</span>
      </div>
    );
  }

  const durationMinutes = Math.round(routeResult.durationSeconds / 60);
  const distanceTimeLabel = `${formatDistance(routeResult.distanceMeters)} · ${durationMinutes} min ${transitMode}`;

  return (
    <div
      role="status"
      aria-label={`Directions to ${eventName}, ${distanceTimeLabel}`}
      className={PILL_LAYOUT_CLASSNAME}
      style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
    >
      <Navigation size={16} strokeWidth={1.5} aria-hidden="true" />
      <span style={PILL_TEXT_STYLE}>{distanceTimeLabel}</span>
    </div>
  );
}
