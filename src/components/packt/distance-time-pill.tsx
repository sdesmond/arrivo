"use client";

import { Navigation } from "lucide-react";
import type { GeoHintStatus, RouteResult, TransitMode } from "@/data/types";
import { formatDistance } from "@/lib/utils";

export interface DistanceTimePillProps {
  eventName: string;
  routeResult: RouteResult | null;
  transitMode: TransitMode;
  onOpenMaps?: () => void;
  geolocationHint?: GeoHintStatus | null;
  onRequestGeolocation?: () => void;
}

const PILL_LAYOUT_CLASSNAME = "inline-flex items-center gap-1.5 h-11 min-w-11 px-3 rounded-full";
const PILL_TEXT_STYLE = { fontSize: "calc(13px * var(--font-scale))" } as const;
const PILL_ACTIVE_STYLE = {
  background: "var(--bg)",
  color: "var(--accent-ink)",
  border: "1px solid var(--accent-brand)",
} as const;
const PILL_NEUTRAL_STYLE = { background: "var(--surface-2)", color: "var(--fg-3)" } as const;

export function DistanceTimePill({
  eventName,
  routeResult,
  transitMode,
  onOpenMaps,
  geolocationHint,
  onRequestGeolocation,
}: DistanceTimePillProps) {
  if (routeResult == null) {
    if (!geolocationHint) {
      return null;
    }

    const isDenied = geolocationHint.state === "denied";
    const label = isDenied ? "Location blocked — enable it in your browser settings" : "Enable location for directions";
    const ariaLabel = isDenied
      ? `Location blocked for ${eventName} — enable in browser settings`
      : `Enable location for directions to ${eventName}`;

    return (
      <button
        type="button"
        onClick={() => onRequestGeolocation?.()}
        aria-label={ariaLabel}
        className={PILL_LAYOUT_CLASSNAME}
        style={PILL_NEUTRAL_STYLE}
      >
        <Navigation size={16} strokeWidth={1.5} aria-hidden="true" />
        <span style={PILL_TEXT_STYLE}>{label}</span>
      </button>
    );
  }

  if (routeResult.status === "loading") {
    if (onRequestGeolocation) {
      return (
        <button
          type="button"
          aria-label={`Getting directions to ${eventName}`}
          aria-busy="true"
          aria-disabled="true"
          className={PILL_LAYOUT_CLASSNAME}
          style={PILL_NEUTRAL_STYLE}
        >
          <Navigation size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      );
    }

    // Loading is genuinely status information, not yet interactive — stays a
    // status region regardless of onOpenMaps.
    return (
      <div
        role="status"
        aria-label={`Getting directions to ${eventName}`}
        className={PILL_LAYOUT_CLASSNAME}
        style={PILL_NEUTRAL_STYLE}
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
