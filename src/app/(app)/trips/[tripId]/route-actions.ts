"use server";

import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import {
  getDayRouteSummary as getDaySummary,
  getRouteDistanceTime as getRoute,
  getDayScheduleConflicts as getConflicts,
} from "@/lib/route";
import type { DayRouteSummary, GeoCoords, RouteResult, ScheduleConflict, TransitMode, TripEvent } from "@/data/types";
import { and, eq, inArray } from "drizzle-orm";

async function assertEventsBelongToTrip(tripId: string, events: TripEvent[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  const eventIds = events.map((event) => event.id);
  const ownedEvents = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(eq(eventsTable.tripId, tripId), inArray(eventsTable.id, eventIds)));
  const ownedEventIds = new Set(ownedEvents.map((event) => event.id));

  if (eventIds.some((eventId) => !ownedEventIds.has(eventId))) {
    throw new Error("Event(s) do not belong to trip");
  }
}

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
  await assertEventsBelongToTrip(tripId, events);
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
  await assertEventsBelongToTrip(tripId, events);
  return getConflicts(events, tripId, transitMode, walkThresholdMeters);
}
