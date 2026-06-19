"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle, ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TripCover } from "./trip-cover";
import { AvatarStack } from "./avatar-stack";
import { LinkedEventBadge } from "./linked-event-badge";
import { RESERVATION_TYPE_META, formatAnchorDateTime } from "./reservation-type-badge";
import { type Trip, type TripEvent } from "@/data/types";
import { cn, getTripStatus, formatDate } from "@/lib/utils";
import { useNow } from "@/components/providers/mock-date-provider";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface NowCardProps {
  trip: Trip;
  todayEvents: TripEvent[];
  onEditTrip?: (trip: Trip) => void;
  onDeleteTrip?: (trip: Trip) => void;
  onLinkedEventTap?: (linkedReservationId: string) => void;
  dateFormat: string;
}

export function NowCard({ trip, todayEvents, onEditTrip, onDeleteTrip, onLinkedEventTap, dateFormat }: NowCardProps) {
  const now = useNow();
  const router = useRouter();
  const status = getTripStatus(trip.startDate, trip.endDate, now);
  const statusLabel = status === "active" ? "ACTIVE TRIP" : status === "upcoming" ? "UPCOMING TRIP" : "PAST TRIP";
  const sub = status === "upcoming" ? (trip.startDate ?? "") : status === "past" ? (trip.endDate ?? "") : "";
  const dateLine =
    trip.startDate && trip.endDate
      ? `${formatDate(trip.startDate, dateFormat)} – ${formatDate(trip.endDate, dateFormat)}`
      : "No dates";

  const currentEvent =
    [...todayEvents].reverse().find((event) => {
      if (!event.startAt) return false;
      return new Date(event.startAt) <= now;
    }) ?? null;

  const nextEvent =
    todayEvents.find((event) => {
      if (!event.startAt) return false;
      return new Date(event.startAt) > now;
    }) ?? null;

  const displayEvent = currentEvent ?? nextEvent;
  const eventLabel = currentEvent ? "Now" : "Next Event";

  const isLinkedEvent = !!displayEvent?.linkedReservationId && !!displayEvent?.reservationType;
  const LinkedIcon = displayEvent?.reservationType
    ? RESERVATION_TYPE_META[displayEvent.reservationType]?.icon
    : undefined;
  const linkedSeparatorIndex = displayEvent ? displayEvent.name.indexOf(" — ") : -1;
  const linkedAnchorLabel =
    displayEvent && linkedSeparatorIndex !== -1 ? displayEvent.name.slice(0, linkedSeparatorIndex) : "";
  const linkedProviderLabel =
    displayEvent && linkedSeparatorIndex !== -1 ? displayEvent.name.slice(linkedSeparatorIndex + 3) : "";
  const linkedAriaLabel =
    isLinkedEvent && displayEvent?.startAt
      ? `${linkedAnchorLabel}: ${formatAnchorDateTime(displayEvent.startAt)} — ${linkedProviderLabel}, Linked, opens Reservations`
      : undefined;

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
            {onEditTrip && (
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
            {onDeleteTrip && (
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
          <span
            className="inline-flex items-center gap-1.5 rounded-full"
            style={{
              fontSize: "calc(12px * var(--font-scale))",
              fontWeight: 500,
              color: "var(--accent-brand)",
              padding: "4px 9px",
              background: "var(--accent-soft)",
            }}
          >
            <CheckCircle size={13} strokeWidth={1.5} />
            Offline
          </span>
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

        {/* Current or next event */}
        {displayEvent && isLinkedEvent && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (displayEvent.linkedReservationId) onLinkedEventTap?.(displayEvent.linkedReservationId);
            }}
            aria-label={linkedAriaLabel}
            className="block w-full mt-4 rounded-[8px] group text-left"
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
                  {displayEvent.name}
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
              {displayEvent.startAt ? fmtTime(displayEvent.startAt) : "—"}
              <span style={{ margin: "0 6px", color: "var(--line)" }}>·</span>—
              <span style={{ margin: "0 6px", color: "var(--line)" }}>·</span>— km
            </div>
          </button>
        )}
        {displayEvent && !isLinkedEvent && (
          <Link
            href={`/trips/${trip.id}?focus=${displayEvent.id}`}
            className="block mt-4 rounded-[8px] group"
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "var(--accent-soft)",
              border: "1px solid var(--line)",
              padding: "14px 16px",
            }}
          >
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

            <div className="flex items-center justify-between mt-1">
              <span
                style={{
                  fontFamily: "var(--font-heading-family, ui-sans-serif)",
                  fontSize: "calc(20px * var(--font-scale))",
                  fontWeight: 700,
                  color: "var(--fg)",
                  letterSpacing: "-0.01em",
                }}
              >
                {displayEvent.name}
              </span>
              <ChevronRight
                size={18}
                strokeWidth={1.5}
                style={{ color: "var(--fg-3)" }}
                className="group-hover:translate-x-0.5 transition-transform"
              />
            </div>

            <div
              style={{
                fontFamily: "var(--font-body, ui-sans-serif)",
                fontSize: "calc(13px * var(--font-scale))",
                color: "var(--fg-3)",
                marginTop: 4,
              }}
            >
              {displayEvent.startAt ? fmtTime(displayEvent.startAt) : "—"}
              <span style={{ margin: "0 6px", color: "var(--line)" }}>·</span>—
              <span style={{ margin: "0 6px", color: "var(--line)" }}>·</span>— km
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
