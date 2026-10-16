"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TripCover } from "./trip-cover";
import { AvatarStack } from "./avatar-stack";
import { NowCardEventRow } from "./now-card-event-row";
import { useRouteForEvent } from "./use-route-for-event";
import { openExternalMaps } from "@/lib/open-external-maps";
import { CollaboratorRole, TransitMode, type Trip, type TripEvent } from "@/data/types";
import { cn, getTripStatus, formatDate } from "@/lib/utils";
import { useNow } from "@/components/providers/mock-date-provider";
import { getActiveTripSummarySelection } from "./active-trip-summary-events";

interface NowCardProps {
  trip: Trip;
  todayEvents: TripEvent[];
  summaryEvents?: TripEvent[];
  onEditTrip?: (trip: Trip) => void;
  onDeleteTrip?: (trip: Trip) => void;
  onLinkedEventTap?: (linkedReservationId: string) => void;
  dateFormat: string;
}

export function NowCard({
  trip,
  todayEvents,
  summaryEvents = todayEvents,
  onEditTrip,
  onDeleteTrip,
  onLinkedEventTap,
  dateFormat,
}: NowCardProps) {
  const now = useNow();
  const router = useRouter();
  const canManage = trip.accessRole === CollaboratorRole.Manager;
  const canEdit = trip.accessRole !== CollaboratorRole.Viewer;
  const status = getTripStatus(trip.startDate, trip.endDate, now);
  const statusLabel = status === "active" ? "ACTIVE TRIP" : status === "upcoming" ? "UPCOMING TRIP" : "PAST TRIP";
  const sub = status === "upcoming" ? (trip.startDate ?? "") : status === "past" ? (trip.endDate ?? "") : "";
  const dateLine =
    trip.startDate && trip.endDate
      ? `${formatDate(trip.startDate, dateFormat)} – ${formatDate(trip.endDate, dateFormat)}`
      : "No dates";

  const { currentEvent, nextEvent, undatedLinkedEvent, floatingNow } = getActiveTripSummarySelection({
    summaryEvents,
    todayEvents,
    now,
    preferManualCurrent: true,
  });
  const effectiveTransitMode = trip.transitMode ?? TransitMode.Drive;
  const nextEventForRoute =
    nextEvent && !nextEvent.linkedReservationId && !nextEvent.reservationType ? nextEvent : undefined;
  const {
    routeResult: nextEventRouteResult,
    geolocationStatus,
    markGeolocationGranted,
  } = useRouteForEvent(nextEventForRoute, trip.id, effectiveTransitMode);
  const hasNextEventCoordinates = nextEventForRoute?.locationLat != null && nextEventForRoute.locationLng != null;
  const nextEventPillResult =
    nextEventRouteResult ?? (hasNextEventCoordinates && !geolocationStatus ? { status: "unavailable" } : null);
  const handleOpenMaps = useCallback(() => {
    if (!nextEventForRoute) return;
    openExternalMaps({
      address: nextEventForRoute.locationAddress,
      lat: nextEventForRoute.locationLat,
      lng: nextEventForRoute.locationLng,
      label: nextEventForRoute.locationName,
    });
  }, [nextEventForRoute]);
  const handleRequestGeolocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => {
        // Permission granted — the hook's permission listener detects the
        // transition when available; this also covers browsers without the
        // Permissions API.
        markGeolocationGranted?.();
      },
      () => {
        // Permission denied or error — the hook's permission listener
        // detects the transition to "denied" and updates the pill label.
      },
      { timeout: 3000 }
    );
  }, [markGeolocationGranted]);
  const summaryRows = [
    currentEvent ? { event: currentEvent, label: "Now" } : null,
    nextEvent ? { event: nextEvent, label: "Next Event" } : null,
    !currentEvent && !nextEvent && undatedLinkedEvent ? { event: undatedLinkedEvent, label: "Linked Event" } : null,
  ].filter((row): row is { event: TripEvent; label: string } => row !== null);

  return (
    <div
      data-testid="now-card"
      className="relative rounded-[14px] overflow-hidden cursor-pointer"
      style={{
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-2)",
        background: "var(--bg)",
      }}
      onClick={() => router.push(`/trips/${trip.id}`)}
    >
      {/* Overflow menu — upper-right */}
      <div className="absolute top-2 right-2 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            title="Trip options"
            className="rounded-[6px] p-2 bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/45"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <MoreHorizontal size={18} strokeWidth={1.5} />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end">
            {onEditTrip && canEdit && (
              <DropdownMenuItem
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onEditTrip(trip);
                }}
              >
                <Pencil size={13} strokeWidth={1.5} />
                Edit trip
              </DropdownMenuItem>
            )}
            {onDeleteTrip && canManage && (
              <DropdownMenuItem
                variant="destructive"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onDeleteTrip(trip);
                }}
              >
                <Trash2 size={13} strokeWidth={1.5} />
                Delete trip
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Cover */}
      <TripCover
        name={trip.name}
        country={sub}
        metaTag={statusLabel}
        showCity
        style={{ minHeight: 220 }}
        coverImageUrl={trip.coverImageUrl}
        destinationCountry={trip.destinationCountry}
      />

      {/* Body */}
      <div className="relative p-6">
        {/* Heading row */}
        <div>
          <div
            className="flex items-center gap-1.5 mb-1"
            style={{
              fontFamily: "var(--font-mono-family, ui-monospace)",
              fontSize: "calc(10.5px * var(--font-scale))",
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
            }}
          >
            <span
              className={cn(status === "active" && "pulse", "rounded-full shrink-0")}
              style={{
                width: 6,
                height: 6,
                background: "var(--accent-brand)",
                display: "inline-block",
              }}
            />
            {statusLabel}
          </div>
          <h2
            style={{
              fontFamily: "var(--font-heading-family, ui-sans-serif)",
              fontSize: "calc(28px * var(--font-scale))",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--fg)",
              lineHeight: 1.1,
            }}
          >
            {trip.name}
          </h2>
          <div style={{ color: "var(--fg-3)", fontSize: "calc(13.5px * var(--font-scale))", marginTop: 4 }}>
            {dateLine}
          </div>
        </div>

        {/* Chips row */}
        <div className="flex items-center gap-2 mt-4">
          <Badge variant="muted">9 places</Badge>
          <Badge variant="muted">12 docs</Badge>
          <span className="flex-1" />
          {trip.collaborators && (
            <AvatarStack
              initials={trip.collaborators.map((collaborator) => collaborator.initials)}
              size="sm"
              aria-label={trip.collaborators.map((collaborator) => collaborator.name).join(", ")}
            />
          )}
        </div>

        {summaryRows.map((row, index) => (
          <NowCardEventRow
            key={`${row.label}-${row.event.id}`}
            tripId={trip.id}
            event={row.event}
            eventLabel={row.label}
            floatingNow={floatingNow}
            useEndTime={row.label === "Now"}
            rowClassName={index === 0 ? "mt-4" : "mt-3"}
            onLinkedEventTap={onLinkedEventTap}
            transitMode={trip.transitMode}
            routeResult={row.label === "Next Event" ? nextEventPillResult : undefined}
            onOpenMaps={row.label === "Next Event" ? handleOpenMaps : undefined}
            geolocationHint={row.label === "Next Event" ? geolocationStatus : undefined}
            onRequestGeolocation={row.label === "Next Event" ? handleRequestGeolocation : undefined}
          />
        ))}
      </div>
    </div>
  );
}
