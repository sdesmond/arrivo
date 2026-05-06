"use client";

import Link from "next/link";
import { Share2, MapPin, CheckCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TripCover } from "./trip-cover";
import { AvatarStack } from "./avatar-stack";
import { type Trip } from "@/data/trips";
import { getTripStatus, getActiveDayNumber } from "@/lib/utils";

interface NowCardProps {
  trip: Trip;
  onEditTrip?: (trip: Trip) => void;
}

export function NowCard({ trip, onEditTrip }: NowCardProps) {
  const status      = getTripStatus(trip.startDate, trip.endDate);
  const activeDayNum = status === "active" ? getActiveDayNumber(trip.startDate) : null;
  const statusLabel = status === "active" ? "ACTIVE TRIP"
                    : status === "upcoming" ? "UPCOMING TRIP"
                    : "PAST TRIP";
  const sub = activeDayNum != null
    ? `DAY ${activeDayNum} OF ${trip.dayTotal}`
    : status === "upcoming" ? trip.startDate : trip.endDate;

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
                className="pulse rounded-full shrink-0"
                style={{
                  width: 6, height: 6,
                  background: "var(--accent-brand)",
                  display: "inline-block",
                }}
              />
              {statusLabel}{activeDayNum != null ? ` · DAY ${activeDayNum} OF ${trip.dayTotal}` : ""}
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
              {trip.startDate} — {trip.endDate}
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
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem]"
              style={{ border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
            >
              Open trip
            </Link>
            <Link
              href={`/trips/${trip.id}`}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem]"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
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

        {/* Meta grid */}
        <div
          className="grid grid-cols-2 gap-4 mt-4 pt-4 min-[900px]:grid-cols-4"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          <MetaCell label="Where" value="Tokyo Bay area" sub="Hamarikyu now" />
          <MetaCell label="Weather" value="19°C clear" sub="light wind · 11 km/h" />
          <MetaCell label="Local time" value="14:08" sub="UTC+9 · JST" />
          <MetaCell label="Next event" value="17:30" sub="Shibuya Sky · 3.4 km" />
        </div>
      </div>
    </div>
  );
}

function MetaCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono-family, ui-monospace)",
          fontSize: "10.5px",
          fontWeight: 500,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--fg-3)",
          lineHeight: 1,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-heading-family, ui-sans-serif)",
          fontSize: 17,
          fontWeight: 600,
          color: "var(--fg)",
          marginTop: 4,
          lineHeight: 1.2,
        }}
      >
        {value}
        {sub && (
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-body, ui-sans-serif)",
              fontWeight: 400,
              fontSize: 12,
              color: "var(--fg-3)",
              marginTop: 2,
            }}
          >
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
