"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search, Bell, Plus, ArrowUpDown, Filter, MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NowCard } from "@/components/packt/now-card";
import { DayRibbon } from "@/components/packt/day-ribbon";
import { TripCard, NewTripCard } from "@/components/packt/trip-card";
import { TripCover } from "@/components/packt/trip-cover";
import { ThemeToggle } from "@/components/packt/theme-toggle";
import {
  SAMPLE_ACTIVE_TRIP, SAMPLE_UPCOMING, SAMPLE_PAST,
} from "@/data/trips";
import { isEventNow } from "@/lib/utils";

// ─── Mobile tab types ───────────────────────────────────────────────────────
type MobileTab = "Active" | "Upcoming" | "Past";

// ─── Desktop topbar ──────────────────────────────────────────────────────────
function Topbar() {
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
          04.28.2026 · 4 trips · 5 past
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
function SectionHead({
  title, count, children,
}: { title: string; count?: string; children?: React.ReactNode }) {
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
function PastTripsList() {
  return (
    <div
      className="rounded-[14px] overflow-hidden"
      style={{ border: "1px solid var(--line)" }}
    >
      {SAMPLE_PAST.map((trip, i) => (
        <Link
          key={trip.id}
          href={`/trips/${trip.id}`}
          className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface"
          style={{
            borderTop: i > 0 ? "1px solid var(--line)" : undefined,
          }}
        >
          {/* Thumb */}
          <TripCover
            name={trip.name}
            showCity={false}
            style={{ width: 52, height: 40, borderRadius: 6, flexShrink: 0 }}
          />
          {/* Name */}
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>
              {trip.name}, {trip.country}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "10.5px", color: "var(--fg-3)",
                letterSpacing: "0.04em", textTransform: "uppercase", marginTop: 2,
              }}
            >
              {trip.country}
            </div>
          </div>
          {/* Date */}
          <span style={{ fontSize: 12.5, color: "var(--fg-3)", fontVariantNumeric: "tabular-nums" }}>
            {trip.startDate}
          </span>
          {/* Days */}
          <span
            style={{
              fontFamily: "var(--font-mono-family, ui-monospace)",
              fontSize: "10.5px", color: "var(--fg-4)",
              letterSpacing: "0.04em", textTransform: "uppercase",
              width: 52, textAlign: "right",
            }}
          >
            {trip.days} DAYS
          </span>
          <Badge variant="outline">Past</Badge>
          <button
            className="p-1 rounded-[6px] text-fg-4 hover:text-fg hover:bg-surface-2 transition-colors"
            title="More options"
            onClick={(e) => e.preventDefault()}
          >
            <MoreHorizontal size={14} strokeWidth={1.5} />
          </button>
        </Link>
      ))}
    </div>
  );
}

// ─── Mobile — Active tab ─────────────────────────────────────────────────────
function MobileActiveTab() {
  const trip = SAMPLE_ACTIVE_TRIP;
  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-[14px] overflow-hidden"
        style={{ border: "1px solid var(--line)" }}
      >
        <TripCover
          name={trip.name}
          country={`JPN · DAY ${trip.activeDayNumber} OF ${trip.dayTotal}`}
          metaTag="ACTIVE"
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
            Day {trip.activeDayNumber} of {trip.dayTotal} · 14:08 JST
          </div>
          <h2
            style={{
              fontFamily: "var(--font-heading-family, ui-sans-serif)",
              fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--fg)",
            }}
          >
            {trip.name}, {trip.country}
          </h2>
        </div>
      </div>

      {/* Today strip */}
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
            TODAY · APR 28
          </span>
          <span style={{ fontSize: 12.5, color: "var(--fg-3)" }}>5 stops</span>
        </div>
        {trip.events?.map((ev) => (
          <Link
            key={ev.id}
            href={`/trips/${trip.id}/days/${trip.activeDayNumber}?focus=${ev.id}`}
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface"
            style={{
              opacity: ev.status === "done" ? 0.5 : 1,
              background: isEventNow(ev) ? "var(--accent-soft)" : undefined,
              borderLeft: isEventNow(ev) ? "3px solid var(--accent-brand)" : undefined,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "10.5px", color: "var(--fg-3)",
                letterSpacing: "0.04em", width: 42, flexShrink: 0,
              }}
            >
              {ev.time}
            </span>
            <span
              style={{
                flex: 1, fontSize: 13.5, fontWeight: 500, color: "var(--fg)",
                textDecoration: ev.status === "done" ? "line-through" : undefined,
              }}
            >
              {ev.name}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>{ev.category}</span>
          </Link>
        ))}
      </div>

      <Link
        href={`/trips/${trip.id}`}
        className="w-full inline-flex items-center justify-center rounded-lg text-sm font-medium whitespace-nowrap transition-all h-7 px-2.5"
        style={{ border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
      >
        Open trip →
      </Link>
    </div>
  );
}

function MobileUpcomingTab() {
  return (
    <div className="flex flex-col gap-3">
      {SAMPLE_UPCOMING.map((trip) => (
        <Link
          key={trip.id}
          href={`/trips/${trip.id}`}
          className="flex rounded-[14px] overflow-hidden"
          style={{ border: "1px solid var(--line)", background: "var(--bg)" }}
        >
          <TripCover name={trip.name} showCity={false} style={{ width: 100, minHeight: 100 }} />
          <div className="flex flex-col gap-1.5 p-3 flex-1 min-w-0">
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
              {trip.name}, {trip.country}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "10.5px", color: "var(--fg-3)",
                letterSpacing: "0.04em", textTransform: "uppercase",
              }}
            >
              {trip.country} · {trip.days} DAYS
            </div>
            <div style={{ fontSize: 12.5, color: "var(--fg-3)" }}>
              {trip.startDate} — {trip.endDate}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge variant="soft">in {trip.inDays}d</Badge>
              {(trip.docs?.length ?? 0) > 0
                ? <Badge variant="success">{trip.docs!.length} docs</Badge>
                : <Badge variant="warning">no docs</Badge>
              }
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function MobilePastTab() {
  return (
    <div className="flex flex-col gap-3">
      {SAMPLE_PAST.map((trip) => (
        <Link
          key={trip.id}
          href={`/trips/${trip.id}`}
          className="flex rounded-[14px] overflow-hidden"
          style={{ border: "1px solid var(--line)", background: "var(--bg)" }}
        >
          <TripCover name={trip.name} showCity={false} style={{ width: 80, minHeight: 80 }} />
          <div className="flex flex-col gap-1 p-3 flex-1 min-w-0">
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
              {trip.name}, {trip.country}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--fg-3)" }}>{trip.startDate} · {trip.days} days</div>
            <Badge variant="outline" className="w-fit mt-1">Past</Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TripsPage() {
  const [mobileTab, setMobileTab] = useState<MobileTab>("Active");

  return (
    <>
      {/* ── Desktop layout ── */}
      <div className="hidden lg:flex lg:flex-col h-full">
        <Topbar />
        <div className="flex-1 overflow-y-auto scroll-thin">
          <div className="p-6 flex flex-col gap-6 max-w-[1200px]">
            {/* Active trip */}
            <NowCard trip={SAMPLE_ACTIVE_TRIP} />
            <DayRibbon trip={SAMPLE_ACTIVE_TRIP} />

            {/* Upcoming */}
            <div>
              <SectionHead title="Upcoming" count="3 TRIPS · NEXT IN 21 DAYS">
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
                {SAMPLE_UPCOMING.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
                <NewTripCard />
              </div>
            </div>

            {/* Past trips */}
            <div>
              <SectionHead title="Past trips" count="5 OF 5">
                <Button variant="ghost" size="sm">
                  <Filter size={13} strokeWidth={1.5} />
                  Filter
                </Button>
              </SectionHead>
              <PastTripsList />
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile layout ── */}
      <div className="flex flex-col lg:hidden min-h-screen">
        {/* Mobile header */}
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
                    borderRadius: "50%", background: "#1c8a5b",
                    marginRight: 6, verticalAlign: "middle",
                  }}
                />
                Synced offline · 4 trips
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost" size="icon-sm">
                <Search size={15} strokeWidth={1.5} />
              </Button>
              <Button size="icon-sm">
                <Plus size={15} strokeWidth={1.5} />
              </Button>
            </div>
          </div>

          {/* Tab switcher */}
          <div
            className="flex gap-0 mt-4"
            style={{ borderBottom: "2px solid var(--line)" }}
          >
            {(["Active", "Upcoming", "Past"] as MobileTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setMobileTab(tab)}
                className="px-4 py-2 text-[13px] font-medium transition-colors"
                style={{
                  color: mobileTab === tab ? "var(--accent-brand)" : "var(--fg-3)",
                  borderBottom: mobileTab === tab
                    ? "2px solid var(--accent-brand)"
                    : "2px solid transparent",
                  marginBottom: -2,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  paddingBottom: 8,
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile tab content */}
        <div className="flex-1 overflow-y-auto scroll-thin p-4">
          {mobileTab === "Active"   && <MobileActiveTab />}
          {mobileTab === "Upcoming" && <MobileUpcomingTab />}
          {mobileTab === "Past"     && <MobilePastTab />}
        </div>
      </div>
    </>
  );
}
