"use server";

import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { getRouteDistanceTime as getRoute } from "@/lib/route";
import type { GeoCoords, RouteResult, TransitMode } from "@/data/types";

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
