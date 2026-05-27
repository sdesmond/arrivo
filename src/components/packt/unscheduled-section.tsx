"use client";

import { CalendarOff } from "lucide-react";
import { SectionHead } from "@/components/packt/trips-section-head";
import { TripCard } from "@/components/packt/trip-card";
import { type Trip } from "@/data/types";

interface UnscheduledSectionProps {
  trips: Trip[];
  onEditTrip: (trip: Trip) => void;
  onDeleteTrip: (trip: Trip) => void;
  dateFormat: string;
}

export function UnscheduledSection({ trips, onEditTrip, onDeleteTrip, dateFormat }: UnscheduledSectionProps) {
  if (trips.length === 0) return null;

  return (
    <div>
      <SectionHead
        title="Unscheduled"
        count={`${trips.length} TRIP${trips.length !== 1 ? "S" : ""}`}
        titleColor="var(--fg-3)"
      >
        <CalendarOff size={14} strokeWidth={1.5} style={{ color: "var(--fg-3)" }} />
      </SectionHead>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {trips.map((trip) => (
          <TripCard
            key={trip.id}
            trip={trip}
            onEditTrip={onEditTrip}
            onDeleteTrip={onDeleteTrip}
            dateFormat={dateFormat}
          />
        ))}
      </div>
    </div>
  );
}
