"use client";

import { useEffect, useRef, useState } from "react";
import type { DayRouteSummary, TransitMode, TripEvent } from "@/data/types";
import { getDayRouteSummary } from "@/app/(app)/trips/[tripId]/route-actions";

interface RouteSummaryState {
  key: string;
  summary: DayRouteSummary;
}

export interface UseDayRouteSummaryResult {
  routeSummary: DayRouteSummary;
  locatedEvents: TripEvent[];
}

function hasLocation(event: TripEvent): boolean {
  return (
    event.locationLat !== null &&
    event.locationLat !== undefined &&
    event.locationLng !== null &&
    event.locationLng !== undefined
  );
}

function getRouteSummaryKey(
  locatedEvents: TripEvent[],
  tripId: string | undefined,
  tripTransitMode: TransitMode | null | undefined,
  walkThresholdMeters: number | null | undefined
): string {
  return [
    tripId ?? "none",
    tripTransitMode ?? "none",
    walkThresholdMeters ?? "none",
    ...locatedEvents.map((event) => `${event.id}:${event.locationLat}:${event.locationLng}:${event.position}`),
  ].join("|");
}

export function useDayRouteSummary(
  events: TripEvent[],
  tripId: string | undefined,
  tripTransitMode: TransitMode | null | undefined,
  walkThresholdMeters: number | null | undefined
): UseDayRouteSummaryResult {
  const locatedEvents = events.filter(hasLocation);
  const routeSummaryKey = getRouteSummaryKey(locatedEvents, tripId, tripTransitMode, walkThresholdMeters);

  // Effects must depend on the stable primitive key, never on `locatedEvents` itself (a new array
  // reference every render) — otherwise a content-identical parent re-render would refetch. Track the
  // latest events in a ref (kept in sync by its own effect) so the fetch effect can read current data
  // without adding the array reference to its own dependency list.
  const locatedEventsRef = useRef<TripEvent[]>(locatedEvents);
  useEffect(() => {
    locatedEventsRef.current = locatedEvents;
  }, [locatedEvents]);

  const [routeSummaryState, setRouteSummaryState] = useState<RouteSummaryState>(() => ({
    key: routeSummaryKey,
    summary: { status: "loading" },
  }));
  const routeSummary: DayRouteSummary =
    routeSummaryState.key === routeSummaryKey ? routeSummaryState.summary : { status: "loading" };

  useEffect(() => {
    if (locatedEventsRef.current.length < 2 || !tripId || !tripTransitMode) return;
    let active = true;
    void getDayRouteSummary(tripId, locatedEventsRef.current, tripTransitMode, walkThresholdMeters)
      .then((summary) => {
        if (active) setRouteSummaryState({ key: routeSummaryKey, summary });
      })
      .catch(() => {
        if (active) setRouteSummaryState({ key: routeSummaryKey, summary: { status: "unavailable" } });
      });
    return () => {
      active = false;
    };
  }, [routeSummaryKey, tripId, tripTransitMode, walkThresholdMeters]);

  return { routeSummary, locatedEvents };
}
