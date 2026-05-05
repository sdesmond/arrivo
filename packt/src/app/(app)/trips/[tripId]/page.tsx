"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Share2, Download, MoreHorizontal, Calendar, MapPin, FileText, Users, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TripCover } from "@/components/packt/trip-cover";
import { DayCard } from "@/components/packt/day-card";
import { getTripById, TRIP_DATA } from "@/data/trips"
import { EventEditSheet } from "@/components/packt/event-edit-sheet"
import { TripEditSheet } from "@/components/packt/trip-edit-sheet"
import { type Trip, type TripEvent, type DayItinerary } from "@/data/types";

function formatTripHeader(country: string, start: string, end: string) {
  const MONTH_ABBREVIATIONS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const [, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  return `${country.toUpperCase()} · ${MONTH_ABBREVIATIONS[startMonth-1]} ${startDay} — ${MONTH_ABBREVIATIONS[endMonth-1]} ${endDay}, ${endYear}`;
}

const TABS = [
  { id: "itin", label: "Itinerary" },
  { id: "map", label: "Map" },
  { id: "docs", label: "Documents" },
  { id: "pack", label: "Packing" },
  { id: "notes", label: "Notes" },
];

export default function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [activeTab, setActiveTab] = useState("itin");
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [editingEvent, setEditingEvent] = useState<TripEvent | null>(null);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);

  const [trip, setTrip] = useState<Trip | undefined>(getTripById(tripId));
  const rawData = TRIP_DATA[tripId] ?? { days: [], docs: [], collaborators: [] };
  const [days, setDays] = useState<DayItinerary[]>(rawData.days);
  const { docs, collaborators } = rawData;

  function handleEventSave(updated: TripEvent) {
    setDays(prev => prev.map(day => ({
      ...day,
      events: day.events.map(e => e.id === updated.id ? updated : e),
    })));
    setEditingEvent(null);
  }

  function handleTripSave(updated: Trip) {
    setTrip(updated);
    setEditingTrip(null);
  }

  if (!trip) return <div style={{ padding: 24, color: "var(--fg-2)" }}>Trip not found.</div>;

  const eventCount = days.reduce((count, day) => count + day.events.length, 0);
  const dayTotal = trip.dayTotal ?? trip.days ?? 0;
  const tripCoverCountry = trip.countryCode
    ? (trip.activeDayNumber != null ? `${trip.countryCode} · DAY ${trip.activeDayNumber} OF ${dayTotal}` : trip.countryCode)
    : trip.country.toUpperCase();
  const heroDateLine = formatTripHeader(trip.country, trip.startDate, trip.endDate);

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
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{trip.name}</span>
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditingTrip(trip ?? null)}>
            <Pencil size={13} strokeWidth={1.5} />
            Edit
          </Button>
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
          name={trip.name}
          country={tripCoverCountry}
          metaTag={`${trip.status.toUpperCase()} TRIP · OFFLINE`}
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
            {heroDateLine}
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
            {trip.name}
          </h1>
          <div className="flex items-center gap-4 flex-wrap" style={{ color: "rgba(255,255,255,0.72)", fontSize: 12.5 }}>
            <span className="flex items-center gap-1.5"><Calendar size={13} strokeWidth={1.5} />{dayTotal} days{trip.activeDayNumber != null ? ` · day ${trip.activeDayNumber} today` : ""}</span>
            <span className="flex items-center gap-1.5"><MapPin size={13} strokeWidth={1.5} />{eventCount} places</span>
            <span className="flex items-center gap-1.5"><FileText size={13} strokeWidth={1.5} />{docs.length} docs</span>
            <span className="flex items-center gap-1.5"><Users size={13} strokeWidth={1.5} />{collaborators.length} collaborators</span>
          </div>
        </div>
      </div>

      {/* Tab bar + day pager */}
      <div
        className="flex items-center gap-0 px-4 lg:px-6 shrink-0"
        style={{ borderBottom: "1px solid var(--line)", background: "var(--bg)" }}
      >
        <div className="flex items-center flex-1 gap-0 overflow-x-auto overflow-y-hidden scroll-thin">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              className="shrink-0 px-3.5 py-3 transition-colors relative"
              style={{
                fontSize: 13,
                fontWeight: activeTab === tabItem.id ? 600 : 400,
                color: activeTab === tabItem.id ? "var(--fg)" : "var(--fg-3)",
                background: "none",
                border: "none",
                borderBottom: activeTab === tabItem.id ? "2px solid var(--accent-brand)" : "2px solid transparent",
                marginBottom: -1,
              }}
              onClick={() => setActiveTab(tabItem.id)}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
        {/* Day pager — only shown when there are days */}
        {days.length > 0 && (
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
              onClick={() => setSelectedDayIndex((prevIndex) => Math.max(0, prevIndex - 1))}
              disabled={selectedDayIndex === 0}
            >
              <ChevronLeft size={13} strokeWidth={1.5} />
            </button>
            <span style={{ letterSpacing: "0.04em" }}>
              DAY <strong style={{ color: "var(--fg)", fontWeight: 700 }}>{days[selectedDayIndex]?.dayNumber}</strong>
              {" · "}
              {days[selectedDayIndex]?.label.split("·")[0].trim()}
              {days[selectedDayIndex]?.today ? " · TODAY" : ""}
            </span>
            <button
              className="rounded-[6px] flex items-center justify-center transition-colors hover:bg-surface-2"
              style={{ width: 26, height: 26, color: "var(--fg-3)" }}
              onClick={() => setSelectedDayIndex((prevIndex) => Math.min(days.length - 1, prevIndex + 1))}
              disabled={selectedDayIndex === days.length - 1}
            >
              <ChevronRight size={13} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Itinerary — main column */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 min-w-0">
          {activeTab === "itin" && (
            <div>
              {days.length > 0
                ? days.map((day) => <DayCard key={day.dayNumber} day={day} onEditEvent={setEditingEvent} />)
                : <div style={{ fontSize: 14, color: "var(--fg-2)" }}>No itinerary yet.</div>
              }
            </div>
          )}
          {activeTab === "docs" && (
            <div style={{ fontSize: 14, color: "var(--fg-2)" }}>
              Document view coming soon.
            </div>
          )}
          {activeTab === "map" && (
            <div style={{ fontSize: 14, color: "var(--fg-2)" }}>
              Map view coming soon.
            </div>
          )}
          {activeTab === "pack" && (
            <div style={{ fontSize: 14, color: "var(--fg-2)" }}>
              Packing list view coming soon.
            </div>
          )}
          {activeTab === "notes" && (
            <div style={{ fontSize: 14, color: "var(--fg-2)" }}>
              Notes coming soon.
            </div>
          )}
        </div>

      </div>

      <EventEditSheet
        event={editingEvent}
        open={editingEvent !== null}
        onClose={() => setEditingEvent(null)}
        onSave={handleEventSave}
      />
      <TripEditSheet
        trip={editingTrip}
        open={editingTrip !== null}
        onClose={() => setEditingTrip(null)}
        onSave={handleTripSave}
      />
    </div>
  );
}
