"use client";

import { Calendar, MapPin, FileText, Users } from "lucide-react";
import { TripCover } from "./trip-cover";
import { formatDate } from "@/lib/utils";

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
  dateFormat: string;
  coverImageUrl?: string;
}

export function TripHero({
  name,
  countryCode,
  startDate,
  endDate,
  dayN,
  dayTotal,
  places,
  docs,
  collaborators,
  dateFormat,
  coverImageUrl,
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
          coverImageUrl={coverImageUrl}
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
                  fontSize: "calc(10.5px * var(--font-scale))",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.7)",
                  marginBottom: 6,
                }}
              >
                {countryCode} · {formatDate(startDate, dateFormat)} — {formatDate(endDate, dateFormat)}
              </div>
              <h1
                style={{
                  fontFamily: "var(--font-heading-family, ui-sans-serif)",
                  fontSize: "calc(36px * var(--font-scale))",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: "#fff",
                  lineHeight: 1.05,
                  marginBottom: 10,
                }}
              >
                {name}
              </h1>
              <div
                className="flex items-center gap-4"
                style={{ color: "rgba(255,255,255,0.75)", fontSize: "calc(13px * var(--font-scale))" }}
              >
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
