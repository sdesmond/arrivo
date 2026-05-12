"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Search, Bell, Plus, ArrowUpDown, Filter, MoreHorizontal, Pencil, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NowCard } from "@/components/packt/now-card";
import { DayRibbon } from "@/components/packt/day-ribbon";
import { TripCard, NewTripCard } from "@/components/packt/trip-card";
import { TripCover } from "@/components/packt/trip-cover";
import { ThemeToggle } from "@/components/packt/theme-toggle";
import { TripEditSheet } from "@/components/packt/trip-edit-sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { type Trip, type TripEvent, type TripListEntry, type UpdateTripPatch } from "@/data/types";
import { isEventNow, isEventPast, getTripStatus, getActiveDayNumber, getTodayDisplay, getTripDays } from "@/lib/utils";
import { updateTripMetadata } from "./actions";

type MobileTab = "Active" | "Upcoming" | "Past";

// ─── Desktop topbar ──────────────────────────────────────────────────────────
interface TopbarProps {
  tripCount: number;
  pastCount: number;
  now: Date;
}
function Topbar({ tripCount, pastCount, now }: TopbarProps) {
  const todayFormatted = now.toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
  }).replace(/\//g, ".");

  return (
    <div
      className="flex items-center gap-3 px-6 py-4"
      style={{ borderBottom: "1px solid var(--line)" }}
    >
      <div>
        <div
          style={{
            fontFamily: "var(--font-heading-family, ui-sans-serif)",
            fontSize: 16, fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--fg)",
          }}
        >
          My trips
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: "10.5px",
            color: "var(--fg-3)",
            letterSpacing: "0.04em",
            marginTop: 2,
          }}
        >
          {todayFormatted} · {tripCount} trip{tripCount !== 1 ? "s" : ""} · {pastCount} past
        </div>
      </div>

      <span className="flex-1" />

      <div className="relative w-[280px] hidden md:block">
        <Search
          size={14} strokeWidth={1.5}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--fg-3)" }}
        />
        <Input
          placeholder="Search trips, places, docs…"
          className="pl-8"
          style={{ height: 34, fontSize: 13 }}
        />
      </div>

      <ThemeToggle />

      <Button variant="outline" size="icon-sm" title="Notifications">
        <Bell size={14} strokeWidth={1.5} />
      </Button>
      <Button size="sm">
        <Plus size={14} strokeWidth={1.5} />
        New trip
      </Button>
    </div>
  );
}

// ─── Section heading ─────────────────────────────────────────────────────────
interface SectionHeadProps {
  title: string;
  count?: string;
  children?: React.ReactNode;
}
function SectionHead({ title, count, children }: SectionHeadProps) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2
        style={{
          fontFamily: "var(--font-heading-family, ui-sans-serif)",
          fontSize: 18, fontWeight: 600,
          letterSpacing: "-0.01em", color: "var(--fg)",
        }}
      >
        {title}
      </h2>
      {count && (
        <span
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: "10.5px", fontWeight: 500,
            letterSpacing: "0.06em", textTransform: "uppercase",
            color: "var(--fg-4)",
          }}
        >
          {count}
        </span>
      )}
      <span className="flex-1" />
      {children}
    </div>
  );
}

// ─── Past trips list ──────────────────────────────────────────────────────────
interface PastTripsListProps {
  trips: Trip[];
  onEditTrip: (trip: Trip) => void;
}
function PastTripsList({ trips, onEditTrip }: PastTripsListProps) {
  return (
    <div
      className="rounded-[14px] overflow-hidden"
      style={{ border: "1px solid var(--line)" }}
    >
      {trips.map((trip, i) => (
        <Link
          key={trip.id}
          href={`/trips/${trip.id}`}
          className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface"
          style={{
            borderTop: i > 0 ? "1px solid var(--line)" : undefined,
          }}
        >
          <TripCover
            name={trip.name}
            showCity={false}
            style={{ width: 52, height: 40, borderRadius: 6, flexShrink: 0 }}
          />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>
              {trip.name}
            </div>
          </div>
          <span style={{ fontSize: 12.5, color: "var(--fg-3)", fontVariantNumeric: "tabular-nums" }}>
            {trip.startDate}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono-family, ui-monospace)",
              fontSize: "10.5px", color: "var(--fg-4)",
              letterSpacing: "0.04em", textTransform: "uppercase",
              width: 52, textAlign: "right",
            }}
          >
            {getTripDays(trip.startDate, trip.endDate)} DAYS
          </span>
          <Badge variant="outline">Past</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger
              title="Trip options"
              className="p-1 rounded-[6px] text-fg-4 hover:text-fg hover:bg-surface-2 transition-colors"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <MoreHorizontal size={14} strokeWidth={1.5} />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditTrip(trip); }}>
                <Pencil size={13} strokeWidth={1.5} />
                Edit trip
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Link>
      ))}
    </div>
  );
}

// ─── Mobile — Active tab ─────────────────────────────────────────────────────
interface MobileActiveTabProps {
  trip: Trip | null;
  todayEvents: TripEvent[];
  now: Date;
}
function MobileActiveTab({ trip, todayEvents, now }: MobileActiveTabProps) {
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

      {/* Now / Next Event card */}
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

      {/* Today strip */}
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

interface MobileUpcomingTabProps {
  trips: Trip[];
  now: Date;
}
function MobileUpcomingTab({ trips, now }: MobileUpcomingTabProps) {
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

interface MobilePastTabProps {
  trips: Trip[];
}
function MobilePastTab({ trips }: MobilePastTabProps) {
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

// ─── Main client component ────────────────────────────────────────────────────
interface TripsPageClientProps {
  initialEntries: TripListEntry[];
  nowISO: string;
}

export function TripsPageClient({ initialEntries, nowISO }: TripsPageClientProps) {
  const now = new Date(nowISO);
  const [editingTrip, setEditingTrip] = useState<string | null>(null);

  const activeEntries   = initialEntries.filter(e => getTripStatus(e.trip.startDate, e.trip.endDate, now) === "active");
  const upcomingEntries = initialEntries.filter(e => getTripStatus(e.trip.startDate, e.trip.endDate, now) === "upcoming");
  const pastEntries     = initialEntries.filter(e => getTripStatus(e.trip.startDate, e.trip.endDate, now) === "past");

  const activeEntry    = activeEntries[0] ?? null;
  const upcomingTrips  = upcomingEntries.map(e => e.trip);
  const pastTrips      = pastEntries.map(e => e.trip);

  const [mobileTab, setMobileTab] = useState<MobileTab>(
    activeEntry !== null ? "Active" : "Upcoming"
  );

  const nextInDays = upcomingTrips.length > 0
    ? Math.min(...upcomingTrips.map(trip => {
        const today = new Date(now); today.setHours(0, 0, 0, 0);
        return Math.ceil((new Date(trip.startDate + "T00:00:00").getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }))
    : null;

  function handleTripSave(tripId: string, patch: UpdateTripPatch) {
    React.startTransition(() => {
      updateTripMetadata(tripId, patch);
    });
    setEditingTrip(null);
  }

  const editingEntry = editingTrip ? initialEntries.find(e => e.trip.id === editingTrip) ?? null : null;

  return (
    <>
      {/* ── Desktop layout ── */}
      <div className="hidden lg:flex lg:flex-col h-full">
        <Topbar tripCount={activeEntries.length + upcomingEntries.length} pastCount={pastEntries.length} now={now} />
        <div className="flex-1 overflow-y-auto scroll-thin">
          <div className="p-6 flex flex-col gap-6 max-w-[1200px]">
            {activeEntry !== null && (
              <>
                <NowCard trip={activeEntry.trip} todayEvents={activeEntry.todayEvents} onEditTrip={(t) => setEditingTrip(t.id)} />
                <DayRibbon trip={activeEntry.trip} todayEvents={activeEntry.todayEvents} />
              </>
            )}

            {/* Upcoming */}
            <div>
              <SectionHead
                title="Upcoming"
                count={`${upcomingTrips.length} TRIP${upcomingTrips.length !== 1 ? "S" : ""}${nextInDays != null ? ` · NEXT IN ${nextInDays} DAYS` : ""}`}
              >
                <div className="seg">
                  <button className="seg-item active">Cards</button>
                  <button className="seg-item">List</button>
                </div>
                <Button variant="ghost" size="sm">
                  <ArrowUpDown size={13} strokeWidth={1.5} />
                  Date
                </Button>
              </SectionHead>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {upcomingTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} onEditTrip={(t) => setEditingTrip(t.id)} />
                ))}
                <NewTripCard />
              </div>
            </div>

            {/* Past trips */}
            <div>
              <SectionHead title="Past trips" count={`${pastTrips.length} OF ${pastTrips.length}`}>
                <Button variant="ghost" size="sm">
                  <Filter size={13} strokeWidth={1.5} />
                  Filter
                </Button>
              </SectionHead>
              <PastTripsList trips={pastTrips} onEditTrip={(t) => setEditingTrip(t.id)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile layout ── */}
      <div className="flex flex-col lg:hidden min-h-screen">
        <div
          className="px-4 pt-12 pb-3"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div className="flex items-end justify-between">
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-heading-family, ui-sans-serif)",
                  fontSize: 26, fontWeight: 700,
                  letterSpacing: "-0.02em", color: "var(--fg)",
                }}
              >
                Trips
              </h1>
              <div
                style={{
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  fontSize: "10.5px", color: "var(--fg-3)",
                  letterSpacing: "0.04em", textTransform: "uppercase",
                  marginTop: 4,
                }}
              >
                <span
                  style={{
                    display: "inline-block", width: 6, height: 6,
                    borderRadius: "50%", background: "var(--accent-brand)",
                    marginRight: 6, verticalAlign: "middle",
                  }}
                />
                Synced offline · {initialEntries.length} trips
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle style={{ minHeight: 44, minWidth: 44 }} />
              <Button variant="ghost" size="icon-sm" title="Search trips" style={{ minHeight: 44, minWidth: 44 }}>
                <Search size={15} strokeWidth={1.5} />
              </Button>
              <Button size="icon-sm" title="New trip" style={{ minHeight: 44, minWidth: 44 }}>
                <Plus size={15} strokeWidth={1.5} />
              </Button>
            </div>
          </div>

          <div
            className="flex gap-0 mt-4"
            style={{ borderBottom: "2px solid var(--line)" }}
          >
            {(["Active", "Upcoming", "Past"] as MobileTab[]).filter(tab => tab !== "Active" || activeEntry !== null).map((tab) => (
              <button
                key={tab}
                onClick={() => setMobileTab(tab)}
                className="px-4 py-2 font-medium transition-colors"
                style={{
                  fontSize: 13,
                  minHeight: 44,
                  color: mobileTab === tab ? "var(--accent-brand)" : "var(--fg-3)",
                  borderBottom: mobileTab === tab
                    ? "2px solid var(--accent-brand)"
                    : "2px solid transparent",
                  marginBottom: -2,
                  background: "transparent",
                  cursor: "pointer",
                  paddingBottom: 8,
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scroll-thin p-4">
          {mobileTab === "Active" && (
            <MobileActiveTab
              trip={activeEntry?.trip ?? null}
              todayEvents={activeEntry?.todayEvents ?? []}
              now={now}
            />
          )}
          {mobileTab === "Upcoming" && <MobileUpcomingTab trips={upcomingTrips} now={now} />}
          {mobileTab === "Past"     && <MobilePastTab trips={pastTrips} />}
        </div>
      </div>

      <TripEditSheet
        key={editingTrip ?? "none"}
        trip={editingEntry?.trip ?? null}
        open={editingTrip !== null}
        onClose={() => setEditingTrip(null)}
        onSave={(patch) => editingTrip && handleTripSave(editingTrip, patch)}
      />
    </>
  );
}
