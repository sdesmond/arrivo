"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { TripCover } from "@/components/packt/trip-cover";
import { buildReservationsDeepLinkHref } from "@/app/(app)/trips/[tripId]/trip-detail-tabs";
import { type Trip, type TripEvent } from "@/data/types";
import { getActiveDayNumber, getTodayDisplay, getTripStatus, isEventNow, isEventPast, pluralize } from "@/lib/utils";

interface MobileActiveTabProps {
  trip: Trip | null;
  todayEvents: TripEvent[];
  now: Date;
}

function eventHref(tripId: string, fallbackHref: string, event: TripEvent): string {
  if (event.linkedReservationId) {
    return buildReservationsDeepLinkHref(`/trips/${tripId}`, new URLSearchParams(), {
      kind: "highlight",
      reservationId: event.linkedReservationId,
    });
  }
  return fallbackHref;
}

function getFloatingNow(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    )
  );
}

export function MobileActiveTab({ trip, todayEvents, now }: MobileActiveTabProps) {
  if (!trip) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ paddingTop: 64, color: "var(--fg-3)", fontSize: "calc(14px * var(--font-scale))" }}
      >
        No active trip right now
      </div>
    );
  }

  const status = getTripStatus(trip.startDate, trip.endDate, now);
  const floatingNow = getFloatingNow(now);
  const activeDayNum = status === "active" && trip.startDate ? getActiveDayNumber(trip.startDate, now) : null;
  const statusLabel = status === "active" ? "ACTIVE" : status === "upcoming" ? "UPCOMING" : "PAST";
  const { date: todayDate, month: todayMonth } = getTodayDisplay(now);

  const currentEvent =
    [...todayEvents].reverse().find((event) => {
      if (!event.startAt) return false;
      return new Date(event.startAt) <= floatingNow;
    }) ?? null;
  const nextEvent =
    todayEvents.find((event) => {
      if (!event.startAt) return false;
      return new Date(event.startAt) > floatingNow;
    }) ?? null;
  const displayEvent = currentEvent ?? nextEvent;
  const eventLabel = currentEvent ? "Now" : "Next Event";

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/trips/${trip.id}`}
        className="block overflow-hidden rounded-[14px]"
        style={{ border: "1px solid var(--line)" }}
      >
        <TripCover
          name={trip.name}
          country=""
          metaTag={statusLabel}
          showCity
          style={{ minHeight: 160 }}
          coverImageUrl={trip.coverImageUrl}
          destinationCountry={trip.destinationCountry}
        />
        <div className="p-4">
          <div
            className="mb-1 flex items-center gap-1.5"
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
              className="rounded-full"
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
              fontSize: "calc(22px * var(--font-scale))",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--fg)",
            }}
          >
            {trip.name}
          </h2>
        </div>
      </Link>

      {status === "active" && displayEvent ? (
        <Link
          href={eventHref(trip.id, `/trips/${trip.id}?focus=${displayEvent.id}`, displayEvent)}
          className="group rounded-[14px]"
          style={{
            background: "var(--accent-soft)",
            border: "1px solid var(--line)",
            padding: "14px 16px",
            display: "block",
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
          <div className="mt-1 flex items-center justify-between">
            <span
              style={{
                fontFamily: "var(--font-heading-family, ui-sans-serif)",
                fontSize: "calc(18px * var(--font-scale))",
                fontWeight: 700,
                color: "var(--fg)",
                letterSpacing: "-0.01em",
              }}
            >
              {displayEvent.name}
            </span>
            <ChevronRight
              size={16}
              strokeWidth={1.5}
              style={{ color: "var(--fg-3)" }}
              className="transition-transform group-hover:translate-x-0.5"
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
            {displayEvent.startAt
              ? new Date(displayEvent.startAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "UTC",
                })
              : "—"}
            <span style={{ margin: "0 6px", color: "var(--line)" }}>·</span>—
            <span style={{ margin: "0 6px", color: "var(--line)" }}>·</span>— km
          </div>
        </Link>
      ) : null}

      {status === "active" ? (
        <div
          className="overflow-hidden rounded-[14px]"
          style={{ border: "1px solid var(--line)", background: "var(--bg)" }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--line)" }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "calc(10.5px * var(--font-scale))",
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
              }}
            >
              TODAY · {todayMonth.toUpperCase()} {todayDate}
            </span>
            <span style={{ fontSize: "calc(12.5px * var(--font-scale))", color: "var(--fg-3)" }}>
              {pluralize(todayEvents.length, "stop")}
            </span>
          </div>
          {todayEvents.map((event) => (
            <Link
              key={event.id}
              href={eventHref(trip.id, `/trips/${trip.id}/days/${activeDayNum ?? 1}?focus=${event.id}`, event)}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface"
              style={{
                opacity: isEventPast(event, now) ? 0.5 : 1,
                background: isEventNow(event, now) ? "var(--accent-soft)" : undefined,
                borderLeft: isEventNow(event, now) ? "3px solid var(--accent-brand)" : undefined,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  fontSize: "calc(10.5px * var(--font-scale))",
                  color: "var(--fg-3)",
                  letterSpacing: "0.04em",
                  width: 42,
                  flexShrink: 0,
                }}
              >
                {event.startAt
                  ? new Date(event.startAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: "UTC",
                    })
                  : ""}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: "calc(13.5px * var(--font-scale))",
                  fontWeight: 500,
                  color: "var(--fg)",
                  textDecoration: isEventPast(event, now) ? "line-through" : undefined,
                }}
              >
                {event.name}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
