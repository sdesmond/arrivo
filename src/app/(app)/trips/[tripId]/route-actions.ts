"use server";

import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import {
  getDayRouteSummary as getDaySummary,
  getRouteDistanceTime as getRoute,
  getDayScheduleConflicts as getConflicts,
} from "@/lib/route";
import type { DayRouteSummary, GeoCoords, RouteResult, ScheduleConflict, TransitMode, TripEvent } from "@/data/types";

export async function getRouteDistanceTime(
  tripId: string,
  origin: GeoCoords,
  destination: GeoCoords,
  transitMode: TransitMode
): Promise<RouteResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "viewer");
  return getRoute(origin, destination, transitMode);
}

export async function getDayRouteSummary(
  tripId: string,
  events: TripEvent[],
  transitMode: TransitMode,
  walkThresholdMeters: number | null | undefined
): Promise<DayRouteSummary> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "viewer");
  return getDaySummary(events, transitMode, walkThresholdMeters);
}

export async function getDayScheduleConflicts(
  tripId: string,
  events: TripEvent[],
  transitMode: TransitMode,
  walkThresholdMeters: number | null | undefined
): Promise<ScheduleConflict[]> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "viewer");
  return getConflicts(events, tripId, transitMode, walkThresholdMeters);
}
