"use client";

import { useEffect, useState } from "react";
import type { RouteResult, TransitMode, TripEvent } from "@/data/types";
import { getRouteDistanceTime } from "@/app/(app)/trips/[tripId]/route-actions";

const REFRESH_INTERVAL_MS = 60_000;

export function useRouteForEvent(event: TripEvent, tripId: string, transitMode: TransitMode): RouteResult {
  const locationLat = event.locationLat;
  const locationLng = event.locationLng;
  const hasCoordinates = locationLat != null && locationLng != null;

  const [routeResult, setRouteResult] = useState<RouteResult>(
    hasCoordinates ? { status: "loading" } : { status: "unavailable" }
  );

  const eventId = event.id;

  useEffect(() => {
    if (locationLat == null || locationLng == null) {
      return;
    }

    const destination = { lat: locationLat, lng: locationLng };

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    function fetchRoute() {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        if (!cancelled) setRouteResult({ status: "unavailable" });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          getRouteDistanceTime(
            tripId,
            { lat: position.coords.latitude, lng: position.coords.longitude },
            destination,
            transitMode
          )
            .then((result) => {
              if (!cancelled) setRouteResult(result);
            })
            .catch(() => {
              if (!cancelled) setRouteResult({ status: "unavailable" });
            });
        },
        () => {
          if (!cancelled) setRouteResult({ status: "unavailable" });
        }
      );
    }

    function startInterval() {
      intervalId = setInterval(fetchRoute, REFRESH_INTERVAL_MS);
    }

    function stopInterval() {
      clearInterval(intervalId);
      intervalId = undefined;
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stopInterval();
      } else {
        startInterval();
      }
    }

    fetchRoute();
    if (!document.hidden) startInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [eventId, locationLat, locationLng, tripId, transitMode]);

  return hasCoordinates ? routeResult : { status: "unavailable" };
}
