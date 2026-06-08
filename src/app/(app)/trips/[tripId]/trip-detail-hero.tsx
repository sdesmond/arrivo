"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { ChevronLeft, Share2, Download, Calendar, MapPin, FileText, Users, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TripCover } from "@/components/packt/trip-cover";
import type { TripDetailPayload } from "@/data/types";
import { getTripStatus, getTripDays, formatDate, pluralize } from "@/lib/utils";

interface TripDetailHeroProps {
  detail: TripDetailPayload;
  nowISO: string;
  dateFormat: string;
  onEdit: () => void;
}

export function TripDetailHero({ detail, nowISO, dateFormat, onEdit }: TripDetailHeroProps): ReactElement {
  const now = new Date(nowISO);
  const { trip, days, unscheduledEvents, docs, collaborators } = detail;

  const eventCount = days.reduce((count, day) => count + day.events.length, 0) + unscheduledEvents.length;
  const dayTotal = getTripDays(trip.startDate, trip.endDate);
  const dayN =
    trip.startDate && dayTotal > 0
      ? Math.max(1, Math.min(getTripDays(trip.startDate, nowISO.slice(0, 10)), dayTotal))
      : 0;
  const status = getTripStatus(trip.startDate, trip.endDate, now);
  const heroStatusLabel =
    trip.startDate && trip.endDate ? `${status.toUpperCase()} TRIP · OFFLINE` : "UNSCHEDULED TRIP · OFFLINE";
  const heroDateLine =
    trip.startDate && trip.endDate
      ? `${formatDate(trip.startDate, dateFormat)} — ${formatDate(trip.endDate, dateFormat)}`
      : "";

  return (
    <>
      {/* Crumb bar */}
      <div
        className="flex items-center gap-2 px-4 lg:px-6 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <Link
          href="/trips"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 font-medium h-7 transition-colors hover:bg-surface"
          style={{ fontSize: "0.8rem", color: "var(--fg)" }}
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
          Trips
        </Link>
        <span style={{ color: "var(--fg-4)", fontSize: "calc(13px * var(--font-scale))" }}>/</span>
        <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--fg)" }}>
          {trip.name}
        </span>
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
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
        </div>
      </div>

      {/* Hero */}
      <div className="relative shrink-0" style={{ minHeight: 260 }}>
        <TripCover
          name={trip.name}
          country=""
          metaTag={heroStatusLabel}
          showCity={false}
          style={{ minHeight: 260 }}
          coverImageUrl={trip.coverImageUrl}
          destinationCountry={trip.destinationCountry}
        />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--cover-scrim)" }} />
        <div className="absolute bottom-0 left-0 right-0 p-5 lg:p-6">
          <div
            style={{
              fontFamily: "var(--font-mono-family, ui-monospace)",
              fontSize: "calc(10.5px * var(--font-scale))",
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--cover-text-dim)",
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
              color: "var(--cover-text)",
              lineHeight: 1.05,
              marginBottom: 10,
            }}
          >
            {trip.name}
          </h1>
          <div
            className="flex items-center gap-4 flex-wrap"
            style={{ color: "var(--cover-text-sub)", fontSize: "calc(12.5px * var(--font-scale))" }}
          >
            <span className="flex items-center gap-1.5">
              <Calendar size={13} strokeWidth={1.5} />
              {dayTotal > 0
                ? `${dayTotal} ${pluralize(dayTotal, "day")}${status === "active" ? ` · day ${dayN} today` : ""}`
                : "0 days"}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin size={13} strokeWidth={1.5} />
              {eventCount} {pluralize(eventCount, "place")}
            </span>
            <span className="flex items-center gap-1.5">
              <FileText size={13} strokeWidth={1.5} />
              {docs.length} {pluralize(docs.length, "doc")}
            </span>
            <span className="flex items-center gap-1.5">
              <Users size={13} strokeWidth={1.5} />
              {collaborators.length} {pluralize(collaborators.length, "collaborator")}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
