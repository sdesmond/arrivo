"use client";

import { useEffect, useState } from "react";
import type { ScheduleConflict, TransitMode, TripEvent } from "@/data/types";
import { getDayScheduleConflicts } from "@/app/(app)/trips/[tripId]/route-actions";

interface ConflictState {
  key: string;
  conflicts: ScheduleConflict[];
}

function getConflictsKey(
  events: TripEvent[],
  tripId: string | undefined,
  tripTransitMode: TransitMode | null | undefined,
  walkThresholdMeters: number | null | undefined
): string {
  return [
    tripId ?? "none",
    tripTransitMode ?? "none",
    walkThresholdMeters ?? "none",
    ...events.map(
      (event) =>
        `${event.id}:${event.locationLat}:${event.locationLng}:${event.position}:${event.startAt}:${event.endAt}`
    ),
  ].join("|");
}

export function useScheduleConflicts(
  events: TripEvent[],
  locatedEventCount: number,
  tripId: string | undefined,
  tripTransitMode: TransitMode | null | undefined,
  walkThresholdMeters: number | null | undefined
): ScheduleConflict[] {
  const conflictsKey = getConflictsKey(events, tripId, tripTransitMode, walkThresholdMeters);
  const [conflictState, setConflictState] = useState<ConflictState>(() => ({ key: conflictsKey, conflicts: [] }));

  useEffect(() => {
    if (locatedEventCount < 2 || !tripId || !tripTransitMode) return;
    let active = true;
    void getDayScheduleConflicts(tripId, events, tripTransitMode, walkThresholdMeters)
      .then((result) => {
        if (active) setConflictState({ key: conflictsKey, conflicts: result });
      })
      .catch(() => {
        if (active) setConflictState({ key: conflictsKey, conflicts: [] });
      });
    return () => {
      active = false;
    };
  }, [events, locatedEventCount, conflictsKey, tripId, tripTransitMode, walkThresholdMeters]);

  return conflictState.key === conflictsKey ? conflictState.conflicts : [];
}
