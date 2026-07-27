"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LinkedEventBadge } from "./linked-event-badge";
import { RESERVATION_TYPE_META, formatAnchorDateTime } from "./reservation-type-badge";
import { DistanceTimePill } from "./distance-time-pill";
import { TransitMode, type GeoHintStatus, type RouteResult, type TripEvent } from "@/data/types";
import { cn } from "@/lib/utils";
import { formatCurrentSummaryEventTime, formatSummaryEventTime } from "./active-trip-summary-time";

export interface NowCardEventRowProps {
  tripId: string;
  event: TripEvent;
  eventLabel: string;
  floatingNow: Date;
  useEndTime?: boolean;
  rowClassName?: string;
  onLinkedEventTap?: (linkedReservationId: string) => void;
  transitMode?: TransitMode | null;
  routeResult?: RouteResult | null;
  onOpenMaps?: () => void;
  geolocationHint?: GeoHintStatus | null;
  onRequestGeolocation?: () => void;
}

export function NowCardEventRow({
  tripId,
  event,
  eventLabel,
  floatingNow,
  useEndTime = false,
  rowClassName,
  onLinkedEventTap,
  transitMode,
  routeResult,
  onOpenMaps,
  geolocationHint,
  onRequestGeolocation,
}: NowCardEventRowProps) {
  const isLinkedEvent = !!event.linkedReservationId && !!event.reservationType;
  const effectiveTransitMode = transitMode ?? TransitMode.Drive;
  const hasCoordinates = event.locationLat != null && event.locationLng != null;
  const LinkedIcon = event.reservationType ? RESERVATION_TYPE_META[event.reservationType]?.icon : undefined;
  const linkedSeparatorIndex = event.name.indexOf(" — ");
  const linkedAnchorLabel = linkedSeparatorIndex !== -1 ? event.name.slice(0, linkedSeparatorIndex) : "";
  const linkedProviderLabel = linkedSeparatorIndex !== -1 ? event.name.slice(linkedSeparatorIndex + 3) : "";
  const linkedAriaLabel = isLinkedEvent
    ? event.startAt
      ? linkedSeparatorIndex !== -1
        ? `${linkedAnchorLabel}: ${formatAnchorDateTime(event.startAt)} — ${linkedProviderLabel}, Linked, opens Reservations`
        : `${event.name}: ${formatAnchorDateTime(event.startAt)}, Linked, opens Reservations`
      : `${event.name}, time not set, Linked, opens Reservations`
    : undefined;
  const eventTimeLabel = useEndTime
    ? formatCurrentSummaryEventTime(event.endAt)
    : event.startAt
      ? formatSummaryEventTime(event.startAt, floatingNow)
      : "—";

  if (isLinkedEvent) {
    return (
      <button
        type="button"
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          if (event.linkedReservationId) onLinkedEventTap?.(event.linkedReservationId);
        }}
        aria-label={linkedAriaLabel}
        className={cn("block w-full rounded-[8px] group text-left", rowClassName)}
        style={{
          background: "var(--accent-soft)",
          border: "1px solid var(--line)",
          padding: "14px 16px",
          cursor: "pointer",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: "calc(10.5px * var(--font-scale))",
            fontWeight: 500,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--accent-brand)",
          }}
        >
          {eventLabel}
        </div>

        <div aria-hidden="true" className="flex items-center justify-between mt-1">
          <span className="flex items-center gap-2 min-w-0">
            {LinkedIcon && (
              <LinkedIcon size={18} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--fg-3)" }} />
            )}
            <span
              style={{
                fontFamily: "var(--font-heading-family, ui-sans-serif)",
                fontSize: "calc(20px * var(--font-scale))",
                fontWeight: 700,
                color: "var(--fg)",
                letterSpacing: "-0.01em",
              }}
            >
              {event.name}
            </span>
            <LinkedEventBadge />
          </span>
          <ChevronRight
            aria-hidden="true"
            size={18}
            strokeWidth={1.5}
            style={{ color: "var(--fg-3)" }}
            className="group-hover:translate-x-0.5 transition-transform"
          />
        </div>

        <div
          aria-hidden="true"
          style={{
            fontFamily: "var(--font-body, ui-sans-serif)",
            fontSize: "calc(13px * var(--font-scale))",
            color: "var(--fg-3)",
            marginTop: 4,
          }}
        >
          {eventTimeLabel}
        </div>
      </button>
    );
  }

  const shouldShowPill = hasCoordinates && !!(routeResult || geolocationHint);

  return (
    <div
      className={cn("flex items-start gap-2 rounded-[8px] group", rowClassName)}
      onClick={(clickEvent) => clickEvent.stopPropagation()}
      style={{
        background: "var(--accent-soft)",
        border: "1px solid var(--line)",
        padding: "14px 16px",
      }}
    >
      <Link href={`/trips/${tripId}?focus=${event.id}`} className="block flex-1 min-w-0">
        <div
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: "calc(10.5px * var(--font-scale))",
            fontWeight: 500,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--accent-brand)",
          }}
        >
          {eventLabel}
        </div>

        <div
          className="mt-1"
          style={{
            fontFamily: "var(--font-heading-family, ui-sans-serif)",
            fontSize: "calc(20px * var(--font-scale))",
            fontWeight: 700,
            color: "var(--fg)",
            letterSpacing: "-0.01em",
          }}
        >
          {event.name}
        </div>

        <div
          style={{
            fontFamily: "var(--font-body, ui-sans-serif)",
            fontSize: "calc(13px * var(--font-scale))",
            color: "var(--fg-3)",
            marginTop: 4,
          }}
        >
          {eventTimeLabel}
        </div>
      </Link>

      <span className="shrink-0 self-center">
        {shouldShowPill ? (
          <DistanceTimePill
            eventName={event.name}
            routeResult={routeResult ?? null}
            transitMode={effectiveTransitMode}
            onOpenMaps={onOpenMaps}
            geolocationHint={geolocationHint}
            onRequestGeolocation={onRequestGeolocation}
          />
        ) : (
          <ChevronRight
            data-testid="now-card-row-chevron"
            size={18}
            strokeWidth={1.5}
            style={{ color: "var(--fg-3)" }}
            className="group-hover:translate-x-0.5 transition-transform"
          />
        )}
      </span>
    </div>
  );
}
