"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TripCover } from "@/components/packt/trip-cover";
import { type Trip, type TripEvent } from "@/data/types";
import {
  isEventNow,
  isEventPast,
  getTripStatus,
  getActiveDayNumber,
  getTodayDisplay,
  getTripDays,
} from "@/lib/utils";

// ─── Active tab ───────────────────────────────────────────────────────────────

interface MobileActiveTabProps {
  trip: Trip | null;
  todayEvents: TripEvent[];
  now: Date;
}

export function MobileActiveTab({ trip, todayEvents, now }: MobileActiveTabProps) {
  if (!trip) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ paddingTop: 64, color: "var(--fg-3)", fontSize: 14 }}
      >
        No active trip right now
      </div>
    );
  }
  const status       = getTripStatus(trip.startDate, trip.endDate, now);
  const activeDayNum = status === "active" ? getActiveDayNumber(trip.startDate, now) : null;
  const statusLabel  = status === "active" ? "ACTIVE" : status === "upcoming" ? "UPCOMING" : "PAST";
  const { date: todayDate, month: todayMonth } = getTodayDisplay(now);

  const currentEvent = [...todayEvents].reverse().find((ev) => {
    if (!ev.startAt) return false;
    return new Date(ev.startAt) <= now;
  }) ?? null;
  const nextEvent = todayEvents.find((ev) => {
    if (!ev.startAt) return false;
    return new Date(ev.startAt) > now;
  }) ?? null;
  const displayEvent = currentEvent ?? nextEvent;
  const eventLabel   = currentEvent ? "Now" : "Next Event";

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-[14px] overflow-hidden"
        style={{ border: "1px solid var(--line)" }}
      >
        <TripCover
          name={trip.name}
          country=""
          metaTag={statusLabel}
          showCity
          style={{ minHeight: 160 }}
        />
        <div className="p-4">
          <div
            className="flex items-center gap-1.5 mb-1"
            style={{
              fontFamily: "var(--font-mono-family, ui-monospace)",
              fontSize: "10.5px", fontWeight: 500,
              letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fg-3)",
            }}
          >
            <span
              className="rounded-full"
              style={{ width: 6, height: 6, background: "var(--accent-brand)", display: "inline-block" }}
            />
            {statusLabel}
          </div>
          <h2
            style={{
              fontFamily: "var(--font-heading-family, ui-sans-serif)",
              fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--fg)",
            }}
          >
            {trip.name}
          </h2>
        </div>
      </div>

      {status === "active" && displayEvent && (
        <Link
          href={`/trips/${trip.id}?focus=${displayEvent.id}`}
          className="rounded-[14px] group"
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
              fontSize: "10.5px", fontWeight: 500,
              letterSpacing: "0.06em", textTransform: "uppercase",
              color: "var(--accent-brand)",
            }}
          >
            {eventLabel}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span
              style={{
                fontFamily: "var(--font-heading-family, ui-sans-serif)",
                fontSize: 18, fontWeight: 700,
                color: "var(--fg)", letterSpacing: "-0.01em",
              }}
            >
              {displayEvent.name}
            </span>
            <ChevronRight size={16} strokeWidth={1.5} style={{ color: "var(--fg-3)" }}
              className="group-hover:translate-x-0.5 transition-transform"
            />
          </div>
          <div style={{ fontFamily: "var(--font-body, ui-sans-serif)", fontSize: 13, color: "var(--fg-3)", marginTop: 4 }}>
            {displayEvent.startAt
              ? new Date(displayEvent.startAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              : "—"}
            <span style={{ margin: "0 6px", color: "var(--line)" }}>·</span>
            —
            <span style={{ margin: "0 6px", color: "var(--line)" }}>·</span>
            — km
          </div>
        </Link>
      )}

      {status === "active" && (
        <div
          className="rounded-[14px] overflow-hidden"
          style={{ border: "1px solid var(--line)", background: "var(--bg)" }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--line)" }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "10.5px", fontWeight: 500,
                letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fg-3)",
              }}
            >
              TODAY · {todayMonth.toUpperCase()} {todayDate}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--fg-3)" }}>{todayEvents.length} stops</span>
          </div>
          {todayEvents.map((ev) => (
            <Link
              key={ev.id}
              href={`/trips/${trip.id}/days/${activeDayNum ?? 1}?focus=${ev.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface"
              style={{
                opacity: isEventPast(ev, now) ? 0.5 : 1,
                background: isEventNow(ev, now) ? "var(--accent-soft)" : undefined,
                borderLeft: isEventNow(ev, now) ? "3px solid var(--accent-brand)" : undefined,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  fontSize: "10.5px", color: "var(--fg-3)",
                  letterSpacing: "0.04em", width: 42, flexShrink: 0,
                }}
              >
                {ev.startAt
                  ? new Date(ev.startAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                  : ""}
              </span>
              <span
                style={{
                  flex: 1, fontSize: 13.5, fontWeight: 500, color: "var(--fg)",
                  textDecoration: isEventPast(ev, now) ? "line-through" : undefined,
                }}
              >
                {ev.name}
              </span>
            </Link>
          ))}
        </div>
      )}

      <Link
        href={`/trips/${trip.id}`}
        className="w-full inline-flex items-center justify-center rounded-lg text-sm font-medium whitespace-nowrap transition-all h-11 px-2.5"
        style={{ border: "1px solid var(--line)", background: "var(--bg)", color: "var(--fg)" }}
      >
        Open trip →
      </Link>
    </div>
  );
}

// ─── Upcoming tab ─────────────────────────────────────────────────────────────

interface MobileUpcomingTabProps {
  trips: Trip[];
  now: Date;
}

export function MobileUpcomingTab({ trips, now }: MobileUpcomingTabProps) {
  return (
    <div className="flex flex-col gap-3">
      {trips.map((trip) => {
        const today = new Date(now); today.setHours(0, 0, 0, 0);
        const inDays = Math.ceil((new Date(trip.startDate + "T00:00:00").getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return (
          <Link
            key={trip.id}
            href={`/trips/${trip.id}`}
            className="flex rounded-[14px] overflow-hidden"
            style={{ border: "1px solid var(--line)", background: "var(--bg)" }}
          >
            <TripCover name={trip.name} showCity={false} style={{ width: 100, minHeight: 100 }} />
            <div className="flex flex-col gap-1.5 p-3 flex-1 min-w-0">
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
                {trip.name}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  fontSize: "10.5px", color: "var(--fg-3)",
                  letterSpacing: "0.04em", textTransform: "uppercase",
                }}
              >
                {getTripDays(trip.startDate, trip.endDate)} DAYS
              </div>
              <div style={{ fontSize: 12.5, color: "var(--fg-3)" }}>
                {trip.startDate} — {trip.endDate}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant="soft">in {inDays}d</Badge>
                {(trip.docs?.length ?? 0) > 0
                  ? <Badge variant="success">{trip.docs!.length} docs</Badge>
                  : <Badge variant="warning">no docs</Badge>
                }
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Past tab ─────────────────────────────────────────────────────────────────

interface MobilePastTabProps {
  trips: Trip[];
}

export function MobilePastTab({ trips }: MobilePastTabProps) {
  return (
    <div className="flex flex-col gap-3">
      {trips.map((trip) => (
        <Link
          key={trip.id}
          href={`/trips/${trip.id}`}
          className="flex rounded-[14px] overflow-hidden"
          style={{ border: "1px solid var(--line)", background: "var(--bg)" }}
        >
          <TripCover name={trip.name} showCity={false} style={{ width: 80, minHeight: 80 }} />
          <div className="flex flex-col gap-1 p-3 flex-1 min-w-0">
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
              {trip.name}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--fg-3)" }}>{trip.startDate} · {getTripDays(trip.startDate, trip.endDate)} days</div>
            <Badge variant="outline" className="w-fit mt-1">Past</Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}
