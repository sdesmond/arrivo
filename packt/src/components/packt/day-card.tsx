"use client";

import { useState } from "react";
import { MapPin, Plus, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PlaceRow } from "./place-row";
import { type DayItinerary, type TripEvent } from "@/data/types";

interface DayCardProps {
  day: DayItinerary;
  onUpdateEvent: (event: TripEvent) => void;
  onDeleteEvent: (id: string) => void;
}

export function DayCard({ day: d, onUpdateEvent, onDeleteEvent }: DayCardProps) {
  const [open, setOpen] = useState(!!d.today);

  const scheduledEvents   = d.events.filter((e) => !!e.time);
  const unscheduledEvents = d.events.filter((e) => !e.time);

  return (
    <div
      className="rounded-[10px] overflow-hidden mb-4"
      style={{
        border: d.today ? "1.5px solid var(--accent-brand)" : "1px solid var(--line)",
        background: "var(--bg)",
      }}
    >
      {/* Day header — clickable toggle */}
      <button
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:opacity-90"
        style={{
          background: d.today ? "var(--accent-soft)" : "var(--surface)",
          borderBottom: open ? "1px solid var(--line)" : "none",
          cursor: "pointer",
        }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
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
            DAY {d.dayNumber}{d.today ? " · TODAY" : ""}
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
            {d.events.length} stops
          </span>
          {d.today && <Badge variant="soft">Active</Badge>}
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            style={{
              color: "var(--fg-4)",
              transform: open ? "rotate(180deg)" : undefined,
              transition: "transform 0.15s",
              flexShrink: 0,
            }}
          />
        </div>
      </button>

      {/* Collapsible body */}
      {open && (
        <div className="p-3 flex flex-col">
          {/* Day note */}
          {d.note && (
            <div
              className="rounded-[6px] px-3 py-2.5 mb-3"
              style={{
                fontSize: 12.5, color: "var(--fg-2)",
                background: "var(--surface-2)",
                borderLeft: "2px solid var(--accent-brand)",
              }}
            >
              <div style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "var(--fg-4)", marginBottom: 4,
              }}>
                DAY NOTES
              </div>
              {d.note}
            </div>
          )}

          {/* Unscheduled events */}
          {unscheduledEvents.length > 0 && (
            <div className="mb-2">
              <div style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "var(--fg-4)",
                marginBottom: 4, paddingLeft: 4,
              }}>
                Unscheduled
              </div>
              {unscheduledEvents.map((p, i) => (
                <PlaceRow
                  key={p.id ?? i}
                  place={p}
                  isLast={i === unscheduledEvents.length - 1 && scheduledEvents.length === 0}
                  onUpdate={e => onUpdateEvent({ ...e, date: e.date ?? d.date })}
                  onDelete={onDeleteEvent}
                />
              ))}
            </div>
          )}

          {/* Scheduled events */}
          {scheduledEvents.map((p, i) => (
            <PlaceRow
              key={p.id ?? i}
              place={p}
              isLast={i === scheduledEvents.length - 1}
              onUpdate={e => onUpdateEvent({ ...e, date: e.date ?? d.date })}
              onDelete={onDeleteEvent}
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
            Add a place to day {d.dayNumber}
          </button>
        </div>
      )}
    </div>
  );
}
