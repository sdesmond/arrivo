"use client";

import { Navigation } from "lucide-react";
import type { GeoCoords, RouteResult, TransitMode } from "@/data/types";

export interface DistanceTimePillProps {
  eventName: string;
  routeResult: RouteResult;
  transitMode: TransitMode;
  coordinates?: GeoCoords;
  onClick?: () => void;
}

const PILL_LAYOUT_CLASSNAME = "inline-flex items-center gap-1.5 h-11 min-w-11 px-3 rounded-full";
const PILL_TEXT_STYLE = { fontSize: "calc(13px * var(--font-scale))" } as const;

export function DistanceTimePill({ eventName, routeResult, transitMode, onClick }: DistanceTimePillProps) {
  if (routeResult.status === "loading") {
    return (
      <button
        type="button"
        disabled
        aria-label={`Getting directions to ${eventName}`}
        className={PILL_LAYOUT_CLASSNAME}
        style={{ background: "var(--surface-2)", color: "var(--fg-3)" }}
      >
        <Navigation size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    );
  }

  if (routeResult.status === "unavailable") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Couldn't get directions to ${eventName}`}
        className={PILL_LAYOUT_CLASSNAME}
        style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
      >
        <Navigation size={16} strokeWidth={1.5} aria-hidden="true" />
        <span style={PILL_TEXT_STYLE}>Couldn&apos;t get directions — try again.</span>
      </button>
    );
  }

  const durationMinutes = Math.round(routeResult.durationSeconds / 60);
  const timeLabel = `${durationMinutes} min ${transitMode}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open directions to ${eventName}, ${timeLabel}`}
      className={PILL_LAYOUT_CLASSNAME}
      style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
    >
      <Navigation size={16} strokeWidth={1.5} aria-hidden="true" />
      <span style={PILL_TEXT_STYLE}>{timeLabel}</span>
    </button>
  );
}
