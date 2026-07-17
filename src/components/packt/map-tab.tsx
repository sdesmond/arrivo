"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LocatedItemPin, Reservation, TripEvent } from "@/data/types";
import { getLocatedItemPins, separateNearbyPins, transformMapboxUrl } from "@/lib/map-helpers";
import { openExternalMaps } from "@/lib/open-external-maps";

export interface MapTabProps {
  events: TripEvent[];
  reservations?: Reservation[];
  tripId: string;
  dayFilter?: number | null;
}

// v11, not v12 — Mapbox's v12+ hosted styles use proprietary style-spec extensions (e.g. layer
// "slot" properties) that MapLibre GL JS's stricter open-spec validator rejects at runtime.
const MAP_STYLE_URL = "https://api.mapbox.com/styles/v1/mapbox/streets-v11";
const SINGLE_PIN_ZOOM = 14;
const FIT_BOUNDS_PADDING_PX = 56;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function createMarkerElement(pin: LocatedItemPin, onSelect: (pin: LocatedItemPin) => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.setAttribute("aria-label", pin.name);
  element.title = pin.name;
  element.style.width = "44px";
  element.style.height = "44px";
  element.style.borderRadius = "50%";
  element.style.border = "0";
  element.style.background = "radial-gradient(circle, var(--accent-brand) 0 7px, transparent 8px)";
  element.style.cursor = "pointer";
  element.style.padding = "0";
  element.addEventListener("click", () => onSelect(pin));
  return element;
}

export function MapTab({ events, reservations = [], tripId }: MapTabProps): ReactElement {
  const pins = useMemo(() => getLocatedItemPins(events, reservations), [events, reservations]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [selectedPin, setSelectedPin] = useState<LocatedItemPin | null>(null);

  useEffect(() => {
    if (pins.length === 0 || !mapContainerRef.current || mapRef.current) return;

    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: `${MAP_STYLE_URL}?access_token=${accessToken}`,
      center: [pins[0].lng, pins[0].lat],
      zoom: SINGLE_PIN_ZOOM,
      transformRequest: (url, resourceType) => transformMapboxUrl(url, resourceType, accessToken),
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

    if (pins.length === 1) {
      map.jumpTo({ center: [pins[0].lng, pins[0].lat], zoom: SINGLE_PIN_ZOOM });
    } else {
      const bounds = pins
        .slice(1)
        .reduce(
          (currentBounds, pin) => currentBounds.extend([pin.lng, pin.lat]),
          new maplibregl.LngLatBounds([pins[0].lng, pins[0].lat], [pins[0].lng, pins[0].lat])
        );
      map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING_PX, animate: !prefersReducedMotion() });
    }

    markersRef.current = separateNearbyPins(pins).map(({ pin, offset }) =>
      new maplibregl.Marker({ element: createMarkerElement(pin, setSelectedPin), offset })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map)
    );

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [pins]);

  if (pins.length === 0) {
    return (
      <div data-testid="map-tab-empty" style={{ textAlign: "center", padding: "48px 24px" }}>
        <p style={{ color: "var(--fg-3)", fontSize: "calc(14px * var(--font-scale))" }}>No located stops yet</p>
      </div>
    );
  }

  return (
    <div data-testid="map-tab" data-trip-id={tripId}>
      <div
        ref={mapContainerRef}
        role="application"
        aria-label="Trip map showing located stops"
        tabIndex={0}
        data-testid="map-tab-container"
        style={{ width: "100%", height: 420, borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)" }}
      />
      <ul aria-label="Located stops" className="mt-3 flex flex-col gap-1" style={{ listStyle: "none", padding: 0 }}>
        {pins.map((pin) => (
          <li key={pin.id}>
            <Button
              variant="ghost"
              size="lg"
              className="w-full justify-start gap-2"
              onClick={() => setSelectedPin(pin)}
            >
              <MapPin size={16} strokeWidth={1.5} aria-hidden="true" />
              {pin.name}
            </Button>
          </li>
        ))}
      </ul>
      {selectedPin && (
        <div
          data-testid="map-tab-pin-detail"
          className="mt-3 flex items-start justify-between gap-3"
          style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--bg)", padding: "12px 14px" }}
        >
          <div>
            <p style={{ color: "var(--fg)", fontWeight: 600, fontSize: "calc(14px * var(--font-scale))" }}>
              {selectedPin.name}
            </p>
            {selectedPin.address && (
              <p style={{ color: "var(--fg-3)", fontSize: "calc(13px * var(--font-scale))" }}>{selectedPin.address}</p>
            )}
            <Button
              variant="outline"
              size="lg"
              className="mt-2"
              onClick={() =>
                openExternalMaps({
                  address: selectedPin.address,
                  lat: selectedPin.lat,
                  lng: selectedPin.lng,
                  label: selectedPin.name,
                })
              }
            >
              Open External Maps
            </Button>
          </div>
          <Button variant="ghost" size="icon-lg" title="Close pin detail" onClick={() => setSelectedPin(null)}>
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
