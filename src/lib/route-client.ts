import type { DayRouteSummary, GeoCoords, RouteResult, ScheduleConflict, TransitMode, TripEvent } from "@/data/types";

// Read-only routing lookups go through route handlers, not server actions: server actions share the
// router's one-at-a-time queue, and one that finishes after a navigation can restore the pre-navigation
// URL (for example bouncing "View in Itinerary" back to the Map tab).
async function postRouting<T>(tripId: string, endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/routing/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Routing request failed (${response.status})`);
  return (await response.json()) as T;
}

export function getRouteDistanceTime(
  tripId: string,
  origin: GeoCoords,
  destination: GeoCoords,
  transitMode: TransitMode
): Promise<RouteResult> {
  return postRouting(tripId, "distance", { origin, destination, transitMode });
}

export function getDayRouteSummary(
  tripId: string,
  events: TripEvent[],
  transitMode: TransitMode,
  walkThresholdMeters: number | null | undefined
): Promise<DayRouteSummary> {
  return postRouting(tripId, "day-summary", { events, transitMode, walkThresholdMeters: walkThresholdMeters ?? null });
}

export function getDayScheduleConflicts(
  tripId: string,
  events: TripEvent[],
  transitMode: TransitMode,
  walkThresholdMeters: number | null | undefined
): Promise<ScheduleConflict[]> {
  return postRouting(tripId, "conflicts", { events, transitMode, walkThresholdMeters: walkThresholdMeters ?? null });
}
