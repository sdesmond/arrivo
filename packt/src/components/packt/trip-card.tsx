"use client";

import Link from "next/link";
import { Calendar, FileText, Users, Plus, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TripCover } from "./trip-cover";
import { AvatarStack } from "./avatar-stack";
import { type Trip } from "@/data/trips";

interface TripCardProps {
  trip: Trip;
  onEditTrip?: (trip: Trip) => void;
}

export function TripCard({ trip, onEditTrip }: TripCardProps) {
  const sub = `${trip.country?.toUpperCase()} · ${trip.days} DAYS`;

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="flex flex-col rounded-[14px] overflow-hidden transition-shadow hover:shadow-2"
      style={{
        border: "1px solid var(--line)",
        background: "var(--bg)",
      }}
    >
      {/* Cover */}
      <TripCover
        name={trip.name}
        country={sub}
        metaTag="UPCOMING"
        showCity
        style={{ minHeight: 160 }}
      />

      {/* Body */}
      <div className="flex flex-col gap-2.5 p-4">
        {/* Heading */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div
              style={{
                fontSize: 15, fontWeight: 600,
                fontFamily: "var(--font-heading-family, ui-sans-serif)",
                letterSpacing: "-0.01em",
                color: "var(--fg)",
                lineHeight: 1.2,
              }}
            >
              {trip.name}, {trip.country}
            </div>
            <div
              style={{
                fontSize: 12.5, color: "var(--fg-3)", marginTop: 3,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {trip.startDate} — {trip.endDate}
            </div>
          </div>
          <Badge variant="soft" className="shrink-0 mt-0.5">
            in {trip.inDays}d
          </Badge>
        </div>

        {/* Meta row */}
        <div
          className="flex items-center gap-3"
          style={{ fontSize: 12.5, color: "var(--fg-3)" }}
        >
          <span className="flex items-center gap-1">
            <Calendar size={13} strokeWidth={1.5} />
            {trip.days} days
          </span>
          <span className="flex items-center gap-1">
            <FileText size={13} strokeWidth={1.5} />
            {trip.docs?.length ?? 0} docs
          </span>
          <span className="flex items-center gap-1">
            <Users size={13} strokeWidth={1.5} />
            {trip.collaborators?.length ?? 0}
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-0.5">
          {trip.collaborators && (
            <AvatarStack initials={trip.collaborators.map((c) => c.initials)} size="sm" />
          )}
          <div className="flex items-center gap-1.5">
            {onEditTrip && (
              <button
                className="p-1 rounded-[6px] text-fg-4 hover:text-fg hover:bg-surface-2 transition-colors"
                title="Edit trip"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEditTrip(trip); }}
              >
                <Pencil size={13} strokeWidth={1.5} />
              </button>
            )}
            <span
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: 11, color: "var(--fg-4)",
              }}
            >
              Open →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function NewTripCard() {
  return (
    <button
      className="flex flex-col items-center justify-center gap-2 rounded-[14px] p-6 transition-colors"
      style={{
        border: "1.5px dashed var(--line-strong)",
        background: "transparent",
        minHeight: 280,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = "var(--accent-brand)";
        el.style.background = "var(--accent-soft)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = "var(--line-strong)";
        el.style.background = "transparent";
      }}
    >
      <span
        className="rounded-full flex items-center justify-center"
        style={{
          width: 32, height: 32,
          background: "var(--surface-2)",
          color: "var(--fg-3)",
        }}
      >
        <Plus size={18} strokeWidth={1.5} />
      </span>
      <span
        style={{
          fontSize: 14, fontWeight: 600,
          color: "var(--fg-2)",
          fontFamily: "var(--font-heading-family, ui-sans-serif)",
          letterSpacing: "-0.01em",
        }}
      >
        Start a new trip
      </span>
      <span style={{ fontSize: 12.5, color: "var(--fg-4)", textAlign: "center", lineHeight: 1.5 }}>
        A blank itinerary, ready when you are.
      </span>
    </button>
  );
}
