import type { GeoCoords, RouteResult, TransitMode } from "@/data/types";
import { db } from "@/db";
import { routeCache } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export function resolveEffectiveMode(
  hopDistanceMeters: number,
  tripTransitMode: TransitMode,
  walkThresholdMeters: number | null | undefined
): TransitMode {
  if (walkThresholdMeters !== null && walkThresholdMeters !== undefined && hopDistanceMeters < walkThresholdMeters) {
    return "walk";
  }

  return tripTransitMode;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DIRECTIONS_TIMEOUT_MS = 3000;

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
  const cached = await db
    .select()
    .from(routeCache)
    .where(
      and(
        eq(routeCache.originLat, origin.lat),
        eq(routeCache.originLng, origin.lng),
        eq(routeCache.destLat, destination.lat),
        eq(routeCache.destLng, destination.lng),
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

  try {
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
        originLat: origin.lat,
        originLng: origin.lng,
        destLat: destination.lat,
        destLng: destination.lng,
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
