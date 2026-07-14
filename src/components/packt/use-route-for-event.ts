"use client";

import { useEffect, useRef, useState } from "react";
import type { RouteResult, TransitMode, TripEvent } from "@/data/types";
import { getRouteDistanceTime } from "@/app/(app)/trips/[tripId]/route-actions";

const REFRESH_INTERVAL_MS = 60_000;
const GEOLOCATION_TIMEOUT_MS = 3000;

interface RouteState {
  key: string;
  result: RouteResult | null;
}

function getRouteKey(event: TripEvent | undefined, tripId: string, transitMode: TransitMode): string {
  return [event?.id ?? "none", event?.locationLat ?? "none", event?.locationLng ?? "none", tripId, transitMode].join(
    ":"
  );
}

function getInitialRouteResult(event: TripEvent | undefined): RouteResult | null {
  if (event?.locationLat == null || event.locationLng == null) {
    return null;
  }

  return { status: "loading" };
}

export function useRouteForEvent(
  event: TripEvent | undefined,
  tripId: string,
  transitMode: TransitMode
): RouteResult | null {
  const routeKey = getRouteKey(event, tripId, transitMode);
  const initialRouteResult = getInitialRouteResult(event);
  const [routeState, setRouteState] = useState<RouteState>(() => ({ key: routeKey, result: initialRouteResult }));
  const latestRequestId = useRef(0);
  const routeResult = routeState.key === routeKey ? routeState.result : initialRouteResult;

  const locationLat = event?.locationLat;
  const locationLng = event?.locationLng;
  const eventId = event?.id;

  useEffect(() => {
    if (locationLat == null || locationLng == null) {
      return;
    }

    const destination = { lat: locationLat, lng: locationLng };
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    function publishResult(requestId: number, result: RouteResult | null) {
      if (!cancelled && requestId === latestRequestId.current) {
        setRouteState({ key: routeKey, result });
      }
    }

    function fetchRoute() {
      if (document.hidden) {
        return;
      }

      const requestId = ++latestRequestId.current;
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        publishResult(requestId, null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          getRouteDistanceTime(
            tripId,
            { lat: position.coords.latitude, lng: position.coords.longitude },
            destination,
            transitMode
          )
            .then((result) => publishResult(requestId, result))
            .catch(() => publishResult(requestId, { status: "unavailable" }));
        },
        () => publishResult(requestId, null),
        { timeout: GEOLOCATION_TIMEOUT_MS }
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
        fetchRoute();
        startInterval();
      }
    }

    if (!document.hidden) {
      fetchRoute();
      startInterval();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [eventId, locationLat, locationLng, routeKey, transitMode, tripId]);

  return routeResult;
}
