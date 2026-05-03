"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Share2, Download, MoreHorizontal, Calendar, MapPin, FileText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TripCover } from "@/components/packt/trip-cover";
import { DayCard } from "@/components/packt/day-card";
import { MiniMapRail, DocsRail, PackingRail, CollaboratorsRail } from "@/components/packt/trip-rail";
import { TOKYO_DAYS, TOKYO_DOCS, TOKYO_PACKING, TOKYO_COLLAB } from "@/data/tokyo";

const TABS = [
  { id: "itin", label: "Itinerary" },
  { id: "map", label: "Map" },
  { id: "docs", label: "Documents" },
  { id: "pack", label: "Packing" },
  { id: "notes", label: "Notes" },
];

export default function TripDetailPage() {
  const [tab, setTab] = useState("itin");
  const [dayIdx, setDayIdx] = useState(4); // day 5 (today)

  const todayDay = TOKYO_DAYS.find((d) => d.today);

  return (
    <div className="flex flex-col min-h-full">
      {/* Crumb bar */}
      <div
        className="flex items-center gap-2 px-4 lg:px-6 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <Link
          href="/trips"
          className="inline-flex shrink-0 items-center gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium h-7 transition-colors hover:bg-muted"
          style={{ color: "var(--foreground)" }}
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
          Trips
        </Link>
        <span style={{ color: "var(--fg-4)", fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>Tokyo</span>
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Share2 size={13} strokeWidth={1.5} />
            Share
          </Button>
          <Button variant="outline" size="sm">
            <Download size={13} strokeWidth={1.5} />
            Offline
          </Button>
          <Button variant="outline" size="icon-sm">
            <MoreHorizontal size={13} strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {/* Hero */}
      <div className="relative shrink-0" style={{ minHeight: 260 }}>
        <TripCover
          name="Tokyo"
          country="JPN · DAY 5 OF 7"
          metaTag="ACTIVE TRIP · OFFLINE"
          showCity={false}
          style={{ minHeight: 260 }}
        />
        {/* Scrim */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)",
          }}
        />
        {/* Overlay info */}
        <div className="absolute bottom-0 left-0 right-0 p-5 lg:p-6">
          <div
            style={{
              fontFamily: "var(--font-mono-family, ui-monospace)",
              fontSize: "10.5px", fontWeight: 500,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: "rgba(255,255,255,0.65)",
              marginBottom: 6,
            }}
          >
            JAPAN · APR 24 — MAY 1, 2026
          </div>
          <h1
            style={{
              fontFamily: "var(--font-heading-family, ui-sans-serif)",
              fontSize: "clamp(28px, 5vw, 40px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "#fff",
              lineHeight: 1.05,
              marginBottom: 10,
            }}
          >
            Tokyo
          </h1>
          <div className="flex items-center gap-4 flex-wrap" style={{ color: "rgba(255,255,255,0.72)", fontSize: 12.5 }}>
            <span className="flex items-center gap-1.5"><Calendar size={13} strokeWidth={1.5} />7 days · day 5 today</span>
            <span className="flex items-center gap-1.5"><MapPin size={13} strokeWidth={1.5} />32 places</span>
            <span className="flex items-center gap-1.5"><FileText size={13} strokeWidth={1.5} />7 docs</span>
            <span className="flex items-center gap-1.5"><Users size={13} strokeWidth={1.5} />2 collaborators</span>
          </div>
        </div>
      </div>

      {/* Tab bar + day pager */}
      <div
        className="flex items-center gap-0 px-4 lg:px-6 shrink-0"
        style={{ borderBottom: "1px solid var(--line)", background: "var(--bg)" }}
      >
        <div className="flex items-center flex-1 gap-0 overflow-x-auto scroll-thin">
          {TABS.map((t) => (
            <button
              key={t.id}
              className="shrink-0 px-3.5 py-3 transition-colors relative"
              style={{
                fontSize: 13,
                fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? "var(--fg)" : "var(--fg-3)",
                background: "none",
                border: "none",
                borderBottom: tab === t.id ? "2px solid var(--accent-brand)" : "2px solid transparent",
                marginBottom: -1,
              }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Day pager */}
        <div
          className="flex items-center gap-2 shrink-0 ml-4"
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: "11px", color: "var(--fg-3)",
          }}
        >
          <button
            className="rounded-[6px] flex items-center justify-center transition-colors hover:bg-surface-2"
            style={{ width: 26, height: 26, color: "var(--fg-3)" }}
            onClick={() => setDayIdx((i) => Math.max(0, i - 1))}
            disabled={dayIdx === 0}
          >
            <ChevronLeft size={13} strokeWidth={1.5} />
          </button>
          <span style={{ letterSpacing: "0.04em" }}>
            DAY <strong style={{ color: "var(--fg)", fontWeight: 700 }}>{TOKYO_DAYS[dayIdx]?.n}</strong>
            {" · "}
            {TOKYO_DAYS[dayIdx]?.label.split("·")[0].trim()}
            {TOKYO_DAYS[dayIdx]?.today ? " · TODAY" : ""}
          </span>
          <button
            className="rounded-[6px] flex items-center justify-center transition-colors hover:bg-surface-2"
            style={{ width: 26, height: 26, color: "var(--fg-3)" }}
            onClick={() => setDayIdx((i) => Math.min(TOKYO_DAYS.length - 1, i + 1))}
            disabled={dayIdx === TOKYO_DAYS.length - 1}
          >
            <ChevronRight size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Itinerary — main column */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 min-w-0">
          {tab === "itin" && (
            <div>
              {TOKYO_DAYS.map((d) => (
                <DayCard key={d.n} day={d} />
              ))}
            </div>
          )}
          {tab === "docs" && (
            <div style={{ fontSize: 14, color: "var(--fg-2)" }}>
              Document view coming soon.
            </div>
          )}
          {tab === "map" && (
            <div style={{ fontSize: 14, color: "var(--fg-2)" }}>
              Map view coming soon.
            </div>
          )}
          {tab === "pack" && (
            <div style={{ fontSize: 14, color: "var(--fg-2)" }}>
              Packing list view coming soon.
            </div>
          )}
          {tab === "notes" && (
            <div style={{ fontSize: 14, color: "var(--fg-2)" }}>
              Notes coming soon.
            </div>
          )}
        </div>

        {/* Right rail — desktop only */}
        <aside
          className="hidden lg:flex flex-col overflow-y-auto shrink-0 p-4"
          style={{ width: 280, borderLeft: "1px solid var(--line)" }}
        >
          <MiniMapRail />
          <DocsRail docs={TOKYO_DOCS} />
          <PackingRail items={TOKYO_PACKING} />
          <CollaboratorsRail collaborators={TOKYO_COLLAB} />
        </aside>
      </div>
    </div>
  );
}
