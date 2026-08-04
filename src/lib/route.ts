import type { DayRouteSummary, GeoCoords, RouteResult, ScheduleConflict, TransitMode, TripEvent } from "@/data/types";
import { db } from "@/db";
import { routeCache } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export function resolveEffectiveMode(
  hopDistanceMeters: number,
  tripTransitMode: TransitMode,
  walkThresholdMeters: number | null | undefined
): TransitMode {
  if (
    walkThresholdMeters !== null &&
    walkThresholdMeters !== undefined &&
    Number.isFinite(hopDistanceMeters) &&
    hopDistanceMeters >= 0 &&
    hopDistanceMeters < walkThresholdMeters
  ) {
    return "walk";
  }

  return tripTransitMode;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DIRECTIONS_TIMEOUT_MS = 3000;
const ROUTE_CACHE_COORD_PRECISION = 6;

export function quantizeCoord(value: number): number {
  return Number(value.toFixed(ROUTE_CACHE_COORD_PRECISION));
}
const inFlightRouteRequests = new Map<string, Promise<RouteResult>>();

const MAPBOX_PROFILE: Record<TransitMode, string> = {
  walk: "walking",
  drive: "driving",
  transit: "mapbox/transit",
};

export async function getRouteDistanceTime(
  origin: GeoCoords,
  destination: GeoCoords,
  transitMode: TransitMode
): Promise<RouteResult> {
  const requestKey = `${origin.lat}:${origin.lng}:${destination.lat}:${destination.lng}:${transitMode}`;
  const existingRequest = inFlightRouteRequests.get(requestKey);
  if (existingRequest) return existingRequest;

  const request = lookupRouteDistanceTime(origin, destination, transitMode);
  inFlightRouteRequests.set(requestKey, request);

  try {
    return await request;
  } finally {
    if (inFlightRouteRequests.get(requestKey) === request) inFlightRouteRequests.delete(requestKey);
  }
}

async function lookupRouteDistanceTime(
  origin: GeoCoords,
  destination: GeoCoords,
  transitMode: TransitMode
): Promise<RouteResult> {
  const originLat = quantizeCoord(origin.lat);
  const originLng = quantizeCoord(origin.lng);
  const destLat = quantizeCoord(destination.lat);
  const destLng = quantizeCoord(destination.lng);

  try {
    const cached = await db
      .select()
      .from(routeCache)
      .where(
        and(
          eq(routeCache.originLat, originLat),
          eq(routeCache.originLng, originLng),
          eq(routeCache.destLat, destLat),
          eq(routeCache.destLng, destLng),
          eq(routeCache.transitMode, transitMode)
        )
      )
      .limit(1);

    const cachedEntry = cached[0];
    if (cachedEntry && Date.now() - cachedEntry.fetchedAt.getTime() < CACHE_TTL_MS) {
      return {
        status: "ready",
        distanceMeters: cachedEntry.distanceMeters,
        durationSeconds: cachedEntry.durationSeconds,
      };
    }

    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) {
      return { status: "unavailable" };
    }

    const profile = MAPBOX_PROFILE[transitMode];
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?access_token=${token}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(DIRECTIONS_TIMEOUT_MS) });
    if (!response.ok) {
      return { status: "unavailable" };
    }

    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) {
      return { status: "unavailable" };
    }

    const distanceMeters = Math.round(route.distance);
    const durationSeconds = Math.round(route.duration);

    await db
      .insert(routeCache)
      .values({
        originLat,
        originLng,
        destLat,
        destLng,
        transitMode,
        distanceMeters,
        durationSeconds,
      })
      .onConflictDoUpdate({
        target: [
          routeCache.originLat,
          routeCache.originLng,
          routeCache.destLat,
          routeCache.destLng,
          routeCache.transitMode,
        ],
        set: { distanceMeters, durationSeconds, fetchedAt: new Date() },
      });

    return { status: "ready", distanceMeters, durationSeconds };
  } catch {
    return { status: "unavailable" };
  }
}

function getStraightLineDistanceMeters(origin: GeoCoords, destination: GeoCoords): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDeltaRadians = ((destination.lat - origin.lat) * Math.PI) / 180;
  const longitudeDeltaRadians = ((destination.lng - origin.lng) * Math.PI) / 180;
  const originLatitudeRadians = (origin.lat * Math.PI) / 180;
  const destinationLatitudeRadians = (destination.lat * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDeltaRadians / 2) ** 2 +
    Math.cos(originLatitudeRadians) * Math.cos(destinationLatitudeRadians) * Math.sin(longitudeDeltaRadians / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

async function resolveHopRoute(
  origin: GeoCoords,
  destination: GeoCoords,
  tripTransitMode: TransitMode,
  walkThresholdMeters: number | null | undefined
): Promise<RouteResult> {
  const firstRoute = await getRouteDistanceTime(origin, destination, tripTransitMode);
  if (firstRoute.status !== "ready") return firstRoute;
  if (walkThresholdMeters === null || walkThresholdMeters === undefined) return firstRoute;
  if (getStraightLineDistanceMeters(origin, destination) >= walkThresholdMeters) return firstRoute;

  const effectiveMode = resolveEffectiveMode(firstRoute.distanceMeters, tripTransitMode, walkThresholdMeters);
  if (effectiveMode === tripTransitMode) return firstRoute;

  return getRouteDistanceTime(origin, destination, effectiveMode);
}

export async function getDayRouteSummary(
  events: TripEvent[],
  tripTransitMode: TransitMode,
  walkThresholdMeters: number | null | undefined
): Promise<DayRouteSummary> {
  const locatedEvents = events
    .filter(
      (event) =>
        event.locationLat !== null &&
        event.locationLat !== undefined &&
        event.locationLng !== null &&
        event.locationLng !== undefined
    )
    .sort((first, second) => first.position - second.position);

  if (locatedEvents.length < 2) return { status: "unavailable" };

  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;
  let hopCount = 0;

  for (let index = 0; index < locatedEvents.length - 1; index += 1) {
    const originEvent = locatedEvents[index];
    const destinationEvent = locatedEvents[index + 1];
    const origin = { lat: originEvent.locationLat!, lng: originEvent.locationLng! };
    const destination = { lat: destinationEvent.locationLat!, lng: destinationEvent.locationLng! };
    const route = await resolveHopRoute(origin, destination, tripTransitMode, walkThresholdMeters);
    if (route.status !== "ready") continue;
    totalDistanceMeters += route.distanceMeters;
    totalDurationSeconds += route.durationSeconds;
    hopCount += 1;
  }

  return hopCount === 0
    ? { status: "unavailable" }
    : { status: "ready", totalDistanceMeters, totalDurationSeconds, hopCount };
}

const SCHEDULE_CONFLICT_BUFFER_SECONDS = 600;

export async function getDayScheduleConflicts(
  events: TripEvent[],
  tripId: string,
  tripTransitMode: TransitMode,
  walkThresholdMeters?: number | null
): Promise<ScheduleConflict[]> {
  const timedLocatedEvents = events
    .filter(
      (event) =>
        event.locationLat !== null &&
        event.locationLat !== undefined &&
        event.locationLng !== null &&
        event.locationLng !== undefined &&
        event.startAt !== null &&
        event.startAt !== undefined &&
        event.endAt !== null &&
        event.endAt !== undefined
    )
    .sort((first, second) => first.position - second.position);

  const conflicts: ScheduleConflict[] = [];

  for (let index = 1; index < timedLocatedEvents.length; index += 1) {
    const previousEvent = timedLocatedEvents[index - 1];
    const currentEvent = timedLocatedEvents[index];
    const origin = { lat: previousEvent.locationLat!, lng: previousEvent.locationLng! };
    const destination = { lat: currentEvent.locationLat!, lng: currentEvent.locationLng! };
    const route = await resolveHopRoute(origin, destination, tripTransitMode, walkThresholdMeters);
    if (route.status !== "ready") continue;

    const scheduledGapSeconds =
      (new Date(currentEvent.startAt!).getTime() - new Date(previousEvent.endAt!).getTime()) / 1000;

    if (route.durationSeconds + SCHEDULE_CONFLICT_BUFFER_SECONDS > scheduledGapSeconds) {
      conflicts.push({
        eventIndex: index,
        previousEventId: previousEvent.id,
        currentEventId: currentEvent.id,
        travelTimeSeconds: route.durationSeconds,
        scheduledGapSeconds,
      });
    }
  }

  return conflicts;
}
