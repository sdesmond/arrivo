"use client";

import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { cn, isEventNow } from "@/lib/utils";
import { type Trip, type TripEvent } from "@/data/trips";

const CAT_COLORS: Record<string, string> = {
  StreetFood:  "var(--accent-brand)",
  Restaurant:  "#c05621",
  Cafe:        "#c05621",
  Museum:      "#8b6cf0",
  Gallery:     "#8b6cf0",
  HistoricSite:"#8b6cf0",
  Show:        "#8b6cf0",
  Park:        "#1c8a5b",
  Garden:      "#1c8a5b",
  Viewpoint:   "#0e7ab5",
  Hotel:       "#7a5c3a",
  default:     "var(--fg-3)",
};

interface DayRibbonProps {
  trip: Trip;
}

export function DayRibbon({ trip }: DayRibbonProps) {
  return (
    <div
      className="flex items-stretch gap-3 p-3 rounded-[10px] mt-3"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
      }}
    >
      {/* Date tile */}
      <Link
        href={`/trips/${trip.id}/days/${trip.dayN}`}
        className="shrink-0 rounded-[8px] flex flex-col items-center justify-center gap-0.5 transition-colors hover:opacity-80"
        style={{
          width: 72, minHeight: 72,
          background: "var(--accent-soft)",
          padding: "8px 6px",
        }}
        title="Open day planner"
      >
        <div
          style={{
            fontFamily: "var(--font-heading-family, ui-sans-serif)",
            fontSize: 28, fontWeight: 700, lineHeight: 1,
            color: "var(--accent-brand)",
          }}
        >
          {trip.todayDate}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--accent-ink)",
            textAlign: "center",
            lineHeight: 1.3,
          }}
        >
          {trip.todayMonth} · DAY {trip.dayN}
        </div>
      </Link>

      {/* Events — horizontally scrollable */}
      <div className="flex-1 flex items-center gap-1 overflow-x-auto scroll-thin min-w-0">
        {(trip.events ?? []).map((ev, i) => (
          <div key={ev.id} className="flex items-center gap-1 shrink-0">
            <EventChip ev={ev} tripId={trip.id!} />
            {i < (trip.events?.length ?? 0) - 1 && (
              <ChevronRight
                size={12}
                strokeWidth={1.5}
                style={{ color: "var(--fg-4)", flexShrink: 0 }}
              />
            )}
          </div>
        ))}

        {/* Add button */}
        <button
          className="shrink-0 rounded-[6px] flex items-center justify-center transition-colors hover:bg-surface-2"
          style={{ width: 28, height: 28, color: "var(--fg-3)", marginLeft: 4 }}
          title="Add event"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

function EventChip({ ev, tripId }: { ev: TripEvent; tripId: string }) {
  const isNow = isEventNow(ev);
  const isDone = ev.status === "done";
  const catColor = CAT_COLORS[ev.cat] ?? CAT_COLORS.default;

  return (
    <Link
      href={`/trips/${tripId}/days/5?focus=${ev.id}`}
      className={cn(
        "flex flex-col gap-0.5 px-2.5 py-2 rounded-[8px] transition-colors min-w-[88px]",
        "hover:bg-surface-2",
        isNow && "border-[1.5px]"
      )}
      style={{
        opacity: isDone ? 0.55 : 1,
        background: isNow ? "var(--accent-soft)" : undefined,
        borderColor: isNow ? "var(--accent-brand)" : undefined,
      }}
      title={`Open ${ev.name} in day planner`}
    >
      <div
        style={{
          fontFamily: "var(--font-mono-family, ui-monospace)",
          fontSize: "10px",
          fontWeight: 500,
          letterSpacing: "0.04em",
          color: isNow ? "var(--accent-brand)" : "var(--fg-3)",
          textTransform: "uppercase",
        }}
      >
        {ev.time}{isNow ? " · NOW" : isDone ? " · DONE" : ""}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--fg)", lineHeight: 1.2 }}>
        {ev.name}
      </div>
      <div style={{ fontSize: 11, color: catColor }}>
        {ev.cat}
      </div>
    </Link>
  );
}
