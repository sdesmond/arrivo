"use client";

import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { getTripStatus, getActiveDayNumber, getTodayDisplay } from "@/lib/utils";
import { useNow } from "@/components/providers/mock-date-provider";
import { type Trip, type TripEvent } from "@/data/types";
import { EventChip } from "@/components/packt/event-chip";

interface DayRibbonProps {
  trip: Trip;
  todayEvents: TripEvent[];
}

export function DayRibbon({ trip, todayEvents }: DayRibbonProps) {
  const now = useNow();
  const status       = getTripStatus(trip.startDate, trip.endDate, now);
  const activeDayNum = status === "active" ? getActiveDayNumber(trip.startDate, now) : null;
  const { date: todayDate, month: todayMonth } = getTodayDisplay(now);

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
        href={`/trips/${trip.id}`}
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
          {todayDate}
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
          {todayMonth}{activeDayNum != null ? ` · DAY ${activeDayNum}` : ""}
        </div>
      </Link>

      {/* Events — horizontally scrollable */}
      <div className="flex-1 flex items-center gap-1 overflow-x-auto scroll-thin min-w-0">
        {todayEvents.map((ev, i) => (
          <div key={ev.id} className="flex items-center gap-1 shrink-0">
            <EventChip ev={ev} tripId={trip.id!} now={now} />
            {i < todayEvents.length - 1 && (
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
