"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PlaceRow } from "@/components/packt/place-row";
import type { Document, TripEvent } from "@/data/types";
import { formatDate, pluralize } from "@/lib/utils";

export interface UnscheduledEventsSectionProps {
  unscheduledEvents: TripEvent[];
  defaultExpenseCurrency?: string;
  dateFormat?: string;
  tripDocs?: Document[];
  onUpdateEvent: (event: TripEvent) => void;
  onDeleteEvent: (id: string) => void;
}

export function UnscheduledEventsSection({
  unscheduledEvents,
  defaultExpenseCurrency,
  dateFormat,
  tripDocs,
  onUpdateEvent,
  onDeleteEvent,
}: UnscheduledEventsSectionProps): ReactElement | null {
  const [unscheduledOpen, setUnscheduledOpen] = useState(true);

  const groupedUnscheduledEvents = unscheduledEvents.reduce<Record<string, TripEvent[]>>((groups, event) => {
    const groupKey = event.displacedDate ?? "no-date";
    groups[groupKey] = [...(groups[groupKey] ?? []), event];
    groups[groupKey].sort((first, second) => first.position - second.position);
    return groups;
  }, {});

  const groupedUnscheduledEntries: Array<[string, TripEvent[]]> = Object.entries(groupedUnscheduledEvents).sort(
    ([firstDate], [secondDate]) => {
      if (firstDate === "no-date") return 1;
      if (secondDate === "no-date") return -1;
      return firstDate.localeCompare(secondDate);
    }
  );

  if (unscheduledEvents.length === 0) {
    return null;
  }

  return (
    <div
      className="mb-4 overflow-hidden"
      style={{
        borderRadius: 14,
        border: "1px solid var(--line)",
        background: "var(--surface)",
      }}
    >
      <button
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setUnscheduledOpen((value) => !value)}
        title={unscheduledOpen ? "Collapse unscheduled events" : "Expand unscheduled events"}
        style={{ background: "none", border: "none" }}
      >
        <div>
          <div style={{ fontSize: "calc(15px * var(--font-scale))", fontWeight: 600, color: "var(--fg)" }}>
            Unscheduled Events
          </div>
          <div style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-3)" }}>
            Preserved from removed trip dates
          </div>
        </div>
        <div className="flex items-center gap-3" style={{ color: "var(--fg-3)" }}>
          <span style={{ fontSize: "calc(12px * var(--font-scale))" }}>
            {pluralize(unscheduledEvents.length, "event")}
          </span>
          {unscheduledOpen ? <ChevronDown size={16} strokeWidth={1.5} /> : <ChevronRight size={16} strokeWidth={1.5} />}
        </div>
      </button>

      {unscheduledOpen && (
        <div className="px-3 pb-3" style={{ borderTop: "1px solid var(--line)" }}>
          {groupedUnscheduledEntries.map(([dateKey, eventsForDate]) => (
            <div key={dateKey} className="pt-3">
              <div
                className="px-3 pb-2"
                style={{
                  fontSize: "calc(11px * var(--font-scale))",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--fg-3)",
                }}
              >
                {dateKey === "no-date" ? "Original date unavailable" : formatDate(dateKey, dateFormat ?? "MM/DD/YYYY")}
              </div>
              {eventsForDate.map((event, index) => (
                <PlaceRow
                  key={event.id}
                  id={`unscheduled-event-${event.id}`}
                  place={event}
                  defaultCurrency={defaultExpenseCurrency}
                  dayDate={event.startAt?.slice(0, 10) ?? event.displacedDate}
                  isLast={index === eventsForDate.length - 1}
                  onUpdate={onUpdateEvent}
                  onDelete={onDeleteEvent}
                  tripDocs={tripDocs}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
