"use client";

import Link from "next/link";
import { Share2, MapPin, CheckCircle, Pencil, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TripCover } from "./trip-cover";
import { AvatarStack } from "./avatar-stack";
import { type Trip } from "@/data/types";
import { cn } from "@/lib/utils";
import { getTripStatus, formatTripDate } from "@/lib/utils";
import { useNow } from "@/components/providers/mock-date-provider";

interface NowCardProps {
  trip: Trip;
  onEditTrip?: (trip: Trip) => void;
}

export function NowCard({ trip, onEditTrip }: NowCardProps) {
  const now = useNow();
  const status      = getTripStatus(trip.startDate, trip.endDate, now);
  const statusLabel = status === "active" ? "ACTIVE TRIP"
                    : status === "upcoming" ? "UPCOMING TRIP"
                    : "PAST TRIP";
  const sub = status === "upcoming" ? trip.startDate : status === "past" ? trip.endDate : "";

  const todayEvents = trip.events ?? [];

  const currentEvent = [...todayEvents].reverse().find((ev) => {
    if (!ev.time) return false;
    const [hours, minutes] = ev.time.split(":").map(Number);
    const eventTime = new Date(now); eventTime.setHours(hours, minutes, 0, 0);
    return eventTime <= now;
  }) ?? null;

  const nextEvent = todayEvents.find((ev) => {
    if (!ev.time) return false;
    const [hours, minutes] = ev.time.split(":").map(Number);
    const eventTime = new Date(now); eventTime.setHours(hours, minutes, 0, 0);
    return eventTime > now;
  }) ?? null;

  const displayEvent = currentEvent ?? nextEvent;
  const eventLabel   = currentEvent ? "Now" : "Next Event";

  return (
    <div
      className="rounded-[14px] overflow-hidden"
      style={{
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-2)",
        background: "var(--bg)",
      }}
    >
      {/* Cover */}
      <TripCover
        name={trip.name}
        country={sub}
        metaTag={statusLabel}
        showCity
        style={{ minHeight: 220 }}
      />

      {/* Body */}
      <div className="p-6">
        {/* Heading row */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div
              className="flex items-center gap-1.5 mb-1"
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "10.5px",
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
              }}
            >
              <span
                className={cn(status === "active" && "pulse", "rounded-full shrink-0")}
                style={{
                  width: 6, height: 6,
                  background: "var(--accent-brand)",
                  display: "inline-block",
                }}
              />
              {statusLabel}
            </div>
            <h2
              style={{
                fontFamily: "var(--font-heading-family, ui-sans-serif)",
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--fg)",
                lineHeight: 1.1,
              }}
            >
              {trip.name}
            </h2>
            <div style={{ color: "var(--fg-3)", fontSize: 13.5, marginTop: 4 }}>
              {formatTripDate(trip.startDate)} – {formatTripDate(trip.endDate)}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {onEditTrip && (
              <Button variant="outline" size="icon-sm" title="Edit trip" onClick={() => onEditTrip(trip)}>
                <Pencil size={13} strokeWidth={1.5} />
              </Button>
            )}
            <Button variant="outline" size="icon-sm" title="Share">
              <Share2 size={13} strokeWidth={1.5} />
            </Button>
            <Link
              href={`/trips/${trip.id}`}
              className="inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-all select-none h-7 gap-1 px-2.5"
              style={{ fontSize: "0.8rem", borderRadius: "min(var(--radius-md), 12px)", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--fg)" }}
            >
              Open trip
            </Link>
            <Link
              href={displayEvent ? `/trips/${trip.id}?focus=${displayEvent.id}` : `/trips/${trip.id}`}
              className="inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-all select-none h-7 gap-1 px-2.5"
              style={{ fontSize: "0.8rem", borderRadius: "min(var(--radius-md), 12px)", background: "var(--accent-brand)", color: "var(--accent-fg)" }}
            >
              <MapPin size={13} strokeWidth={1.5} />
              Today
            </Link>
          </div>
        </div>

        {/* Chips row */}
        <div className="flex items-center gap-2 mt-4">
          <span
            className="inline-flex items-center gap-1.5 rounded-full"
            style={{
              fontSize: 12,
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
              initials={trip.collaborators.map((c) => c.initials)}
              size="sm"
              aria-label={trip.collaborators.map((c) => c.name).join(", ")}
            />
          )}
        </div>

        {/* Current or next event */}
        {displayEvent && (
          <Link
            href={`/trips/${trip.id}?focus=${displayEvent.id}`}
            className="block mt-4 rounded-[8px] group"
            style={{
              background: "var(--accent-soft)",
              border: "1px solid var(--line)",
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "10.5px",
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
                  fontSize: 20,
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
                fontSize: 13,
                color: "var(--fg-3)",
                marginTop: 4,
              }}
            >
              {displayEvent.time}
              <span style={{ margin: "0 6px", color: "var(--line)" }}>·</span>
              —
              <span style={{ margin: "0 6px", color: "var(--line)" }}>·</span>
              — km
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
