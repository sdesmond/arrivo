"use client";

import { MapPin, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PlaceRow } from "./place-row";
import { type DayItinerary } from "@/data/tokyo";

interface DayCardProps {
  day: DayItinerary;
}

export function DayCard({ day: d }: DayCardProps) {
  return (
    <div
      className="rounded-[10px] overflow-hidden mb-4"
      style={{
        border: d.today ? "1.5px solid var(--accent-brand)" : "1px solid var(--line)",
        background: "var(--bg)",
      }}
    >
      {/* Day header */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{
          background: d.today ? "var(--accent-soft)" : "var(--surface)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono-family, ui-monospace)",
              fontSize: "10px", fontWeight: 600,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: d.today ? "var(--accent-brand)" : "var(--fg-3)",
            }}
          >
            DAY {d.n}{d.today ? " · TODAY" : ""}
          </div>
          <div
            style={{
              fontFamily: "var(--font-heading-family, ui-sans-serif)",
              fontSize: 14, fontWeight: 600,
              color: "var(--fg)", marginTop: 1,
            }}
          >
            {d.label} · {d.subtitle}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1"
            style={{ fontSize: 12, color: "var(--fg-3)" }}
          >
            <MapPin size={12} strokeWidth={1.5} />
            {d.places.length} stops
          </span>
          {d.today && <Badge variant="soft">Active</Badge>}
        </div>
      </div>

      {/* Places */}
      <div className="p-3 flex flex-col">
        {d.places.map((p, i) => (
          <PlaceRow
            key={p.id ?? i}
            place={p}
            isLast={i === d.places.length - 1}
          />
        ))}

        {/* Add place button */}
        <button
          className="flex items-center gap-2 px-3 py-2 mt-1 rounded-[6px] transition-colors hover:bg-surface"
          style={{ fontSize: 12.5, color: "var(--fg-4)", border: "none", background: "none" }}
        >
          <span
            className="flex items-center justify-center rounded-full"
            style={{ width: 18, height: 18, background: "var(--surface-2)" }}
          >
            <Plus size={11} strokeWidth={2} />
          </span>
          Add a place to day {d.n}
        </button>
      </div>
    </div>
  );
}
