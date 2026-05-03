"use client";

import Link from "next/link";
import { Share2, Download, MoreHorizontal, Calendar, MapPin, FileText, Users, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TripCover } from "./trip-cover";

interface TripHeroProps {
  name: string;
  country: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  dayN: number;
  dayTotal: number;
  places: number;
  docs: number;
  collaborators: number;
}

export function TripHero({
  name, country, countryCode, startDate, endDate,
  dayN, dayTotal, places, docs, collaborators,
}: TripHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-t-none">
      {/* Cover */}
      <div className="relative" style={{ minHeight: 260 }}>
        <TripCover
          name={name}
          country={`${countryCode} · DAY ${dayN} OF ${dayTotal}`}
          metaTag="ACTIVE TRIP · OFFLINE"
          showCity={false}
          style={{ minHeight: 260 }}
        />
        {/* Gradient scrim for text legibility */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.12) 55%, transparent 100%)",
          }}
        />
        {/* Info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  fontSize: "10.5px",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.7)",
                  marginBottom: 6,
                }}
              >
                {countryCode} · {startDate} — {endDate}
              </div>
              <h1
                style={{
                  fontFamily: "var(--font-heading-family, ui-sans-serif)",
                  fontSize: 36,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: "#fff",
                  lineHeight: 1.05,
                  marginBottom: 10,
                }}
              >
                {name}
              </h1>
              <div className="flex items-center gap-4" style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
                <span className="flex items-center gap-1.5">
                  <Calendar size={13} strokeWidth={1.5} />
                  {dayTotal} days · day {dayN} today
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} strokeWidth={1.5} />
                  {places} places
                </span>
                <span className="flex items-center gap-1.5">
                  <FileText size={13} strokeWidth={1.5} />
                  {docs} docs
                </span>
                <span className="flex items-center gap-1.5">
                  <Users size={13} strokeWidth={1.5} />
                  {collaborators} collaborators
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TripDetailCrumb({ tripName }: { tripName: string }) {
  return (
    <div
      className="flex items-center gap-2 px-6 py-3"
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
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{tripName}</span>
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
  );
}
