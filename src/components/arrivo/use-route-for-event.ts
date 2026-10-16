"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoHintStatus, RouteResult, TransitMode, TripEvent } from "@/data/types";
import { getRouteDistanceTime } from "@/app/(app)/trips/[tripId]/route-actions";

const REFRESH_INTERVAL_MS = 60_000;
const GEOLOCATION_TIMEOUT_MS = 3000;

export interface UseRouteForEventResult {
  routeResult: RouteResult | null;
  geolocationStatus: GeoHintStatus | null;
  markGeolocationGranted: () => void;
}

interface RouteState {
  key: string;
  result: RouteResult | null;
}

type GeoPermissionState = PermissionState | "unknown";

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

function toGeoHintStatus(permissionState: GeoPermissionState): GeoHintStatus | null {
  if (permissionState === "granted") {
    return null;
  }
  if (permissionState === "denied") {
    return { state: "denied" };
  }
  return { state: "prompt", permissionState: permissionState === "unknown" ? "unknown" : "prompt" };
}

export function useRouteForEvent(
  event: TripEvent | undefined,
  tripId: string,
  transitMode: TransitMode
): UseRouteForEventResult {
  const routeKey = getRouteKey(event, tripId, transitMode);
  const initialRouteResult = getInitialRouteResult(event);
  const [routeState, setRouteState] = useState<RouteState>(() => ({ key: routeKey, result: initialRouteResult }));
  const [geoPermission, setGeoPermission] = useState<GeoPermissionState | null>(null);
  const markGeolocationGranted = useCallback(() => {
    setGeoPermission("granted");
  }, []);
  const latestRequestId = useRef(0);
  const rawRouteResult = routeState.key === routeKey ? routeState.result : initialRouteResult;

  const locationLat = event?.locationLat;
  const locationLng = event?.locationLng;
  const eventId = event?.id;
  const hasCoordinates = locationLat != null && locationLng != null;

  useEffect(() => {
    if (!hasCoordinates) {
      return;
    }

    let cancelled = false;
    let permissionStatus: PermissionStatus | undefined;

    function handleChange() {
      if (cancelled || !permissionStatus) return;
      setGeoPermission(permissionStatus.state);
    }

    if (typeof navigator === "undefined" || !navigator.permissions) {
      // `navigator` is unavailable during SSR, so this branch can only be
      // evaluated client-side after mount. Computing it at render time would
      // make server/client output diverge and break hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGeoPermission("unknown");
      return;
    }

    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled) return;
        permissionStatus = status;
        setGeoPermission(status.state);
        status.addEventListener("change", handleChange);
      })
      .catch(() => {
        if (!cancelled) setGeoPermission("unknown");
      });

    return () => {
      cancelled = true;
      permissionStatus?.removeEventListener("change", handleChange);
    };
  }, [eventId, hasCoordinates]);

  useEffect(() => {
    if (locationLat == null || locationLng == null) {
      return;
    }
    if (geoPermission !== "granted") {
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
  }, [eventId, locationLat, locationLng, routeKey, transitMode, tripId, geoPermission]);

  if (!hasCoordinates) {
    return { routeResult: null, geolocationStatus: null, markGeolocationGranted };
  }

  if (geoPermission === "granted") {
    return { routeResult: rawRouteResult, geolocationStatus: null, markGeolocationGranted };
  }

  if (geoPermission == null) {
    return { routeResult: initialRouteResult, geolocationStatus: null, markGeolocationGranted };
  }

  return { routeResult: null, geolocationStatus: toGeoHintStatus(geoPermission), markGeolocationGranted };
}
