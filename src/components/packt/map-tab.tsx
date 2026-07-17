"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DayItinerary, LocatedItemPin, Reservation, TripEvent } from "@/data/types";
import { getLocatedItemPins, separateNearbyPins, transformMapboxUrl } from "@/lib/map-helpers";
import { openExternalMaps } from "@/lib/open-external-maps";

export interface MapTabProps {
  events: TripEvent[];
  reservations?: Reservation[];
  tripId: string;
  days?: DayItinerary[];
  unscheduledEvents?: TripEvent[];
  /** Initial day number for deep-linking; read once on mount when the URL has no day parameter. */
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

function parseDayNumber(value: string | null): number | null {
  if (value === null) return null;
  const dayNumber = Number(value);
  return Number.isFinite(dayNumber) ? dayNumber : null;
}

function noopSubscribe(): () => void {
  return () => {};
}

function readDayParam(): string | null {
  return new URLSearchParams(window.location.search).get("day");
}

function readServerDayParam(): string | null {
  return null;
}

export function MapTab({
  events,
  reservations = [],
  tripId,
  days,
  unscheduledEvents = [],
  dayFilter,
}: MapTabProps): ReactElement {
  const pins = useMemo(() => getLocatedItemPins(events, reservations), [events, reservations]);
  const dayParamFromUrl = useSyncExternalStore(noopSubscribe, readDayParam, readServerDayParam);
  // `undefined` = no user selection yet (derive from the URL day param, then dayFilter, then Whole Trip).
  // `null` = user explicitly chose Whole Trip. A number = user explicitly chose that day.
  const [selectedDayOverride, setSelectedDayOverride] = useState<number | null | undefined>(undefined);
  const selectedDayNumber =
    selectedDayOverride !== undefined ? selectedDayOverride : (parseDayNumber(dayParamFromUrl) ?? dayFilter ?? null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const selectorRef = useRef<HTMLDivElement>(null);
  const resultsRegionId = useId();
  const [selectedPin, setSelectedPin] = useState<LocatedItemPin | null>(null);

  const validSelectedDayNumber = useMemo(() => {
    if (selectedDayNumber === null) return null;
    const hasMatchingDay = (days ?? []).some((day) => day.dayNumber === selectedDayNumber);
    return hasMatchingDay ? selectedDayNumber : null;
  }, [days, selectedDayNumber]);

  const filteredPins = useMemo(() => {
    if (validSelectedDayNumber === null || !days) return pins;

    const selectedDay = days.find((day) => day.dayNumber === validSelectedDayNumber);
    const selectedEventIds = new Set(selectedDay?.events.map((event) => event.id));
    const scheduledEventIds = new Set(days.flatMap((day) => day.events.map((event) => event.id)));
    const unscheduledEventIds = new Set(unscheduledEvents.map((event) => event.id));

    return pins.filter((pin) => {
      if (scheduledEventIds.has(pin.id)) return selectedEventIds.has(pin.id);
      if (unscheduledEventIds.has(pin.id)) return false;
      return true;
    });
  }, [days, pins, validSelectedDayNumber, unscheduledEvents]);

  const scopeOptions = useMemo(
    () => [
      { dayNumber: null, label: "Whole Trip" },
      ...(days ?? []).map((day) => ({
        dayNumber: day.dayNumber,
        label: day.label.trim() ? day.label : `Day ${day.dayNumber}`,
      })),
    ],
    [days]
  );

  function selectScope(dayNumber: number | null): void {
    setSelectedDayOverride(dayNumber);
    setSelectedPin(null);

    const nextUrl = new URL(window.location.href);
    if (dayNumber === null) nextUrl.searchParams.delete("day");
    else nextUrl.searchParams.set("day", String(dayNumber));
    window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }

  function handleScopeKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const selectedIndex = scopeOptions.findIndex((option) => option.dayNumber === validSelectedDayNumber);
    let nextIndex = selectedIndex;

    if (event.key === "ArrowRight") nextIndex = (selectedIndex + 1) % scopeOptions.length;
    else if (event.key === "ArrowLeft") nextIndex = (selectedIndex - 1 + scopeOptions.length) % scopeOptions.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = scopeOptions.length - 1;
    else return;

    event.preventDefault();
    const nextOption = scopeOptions[nextIndex];
    selectScope(nextOption.dayNumber);
    selectorRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day-number="${nextOption.dayNumber ?? "whole-trip"}"]`)
      ?.focus();
  }

  useEffect(() => {
    if (filteredPins.length === 0) {
      if (mapRef.current) {
        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];
        mapRef.current.remove();
        mapRef.current = null;
      }
      return;
    }

    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: `${MAP_STYLE_URL}?access_token=${accessToken}`,
        center: [filteredPins[0].lng, filteredPins[0].lat],
        zoom: SINGLE_PIN_ZOOM,
        transformRequest: (url, resourceType) => transformMapboxUrl(url, resourceType, accessToken),
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    }

    const map = mapRef.current;

    if (filteredPins.length === 1) {
      map.jumpTo({ center: [filteredPins[0].lng, filteredPins[0].lat], zoom: SINGLE_PIN_ZOOM });
    } else {
      const bounds = filteredPins
        .slice(1)
        .reduce(
          (currentBounds, pin) => currentBounds.extend([pin.lng, pin.lat]),
          new maplibregl.LngLatBounds(
            [filteredPins[0].lng, filteredPins[0].lat],
            [filteredPins[0].lng, filteredPins[0].lat]
          )
        );
      map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING_PX, animate: !prefersReducedMotion() });
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = separateNearbyPins(filteredPins).map(({ pin, offset }) =>
      new maplibregl.Marker({ element: createMarkerElement(pin, setSelectedPin), offset })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map)
    );
  }, [filteredPins]);

  useEffect(() => {
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const daySelector = days && (
    <div
      ref={selectorRef}
      role="tablist"
      aria-label="Map scope"
      className="flex items-center gap-0 overflow-x-auto overflow-y-hidden scroll-thin"
      onKeyDown={handleScopeKeyDown}
    >
      {scopeOptions.map((option) => {
        const isSelected = validSelectedDayNumber === option.dayNumber;
        return (
          <button
            key={option.dayNumber ?? "whole-trip"}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={resultsRegionId}
            tabIndex={isSelected ? 0 : -1}
            data-day-number={option.dayNumber ?? "whole-trip"}
            className="shrink-0 inline-flex items-center px-3.5 transition-colors"
            style={{
              minHeight: 44,
              minWidth: 44,
              fontSize: "calc(13px * var(--font-scale))",
              fontWeight: isSelected ? 600 : 400,
              color: isSelected ? "var(--fg)" : "var(--fg-3)",
              background: "none",
              border: "none",
              borderBottom: isSelected ? "2px solid var(--accent-brand)" : "2px solid transparent",
              marginBottom: -1,
            }}
            onClick={() => selectScope(option.dayNumber)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  const resultsAnnouncementText =
    filteredPins.length === 1 ? "1 located stop shown" : `${filteredPins.length} located stops shown`;

  if (filteredPins.length === 0) {
    return (
      <div data-testid="map-tab" data-trip-id={tripId}>
        {daySelector}
        <span aria-live="polite" className="sr-only">
          {resultsAnnouncementText}
        </span>
        <div id={resultsRegionId} data-testid="map-tab-empty" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ color: "var(--fg-3)", fontSize: "calc(14px * var(--font-scale))" }}>No located stops yet</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="map-tab" data-trip-id={tripId}>
      {daySelector}
      <span aria-live="polite" className="sr-only">
        {resultsAnnouncementText}
      </span>
      <div id={resultsRegionId}>
        <div
          ref={mapContainerRef}
          role="application"
          aria-label="Trip map showing located stops"
          tabIndex={0}
          data-testid="map-tab-container"
          style={{ width: "100%", height: 420, borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)" }}
        />
        <ul aria-label="Located stops" className="mt-3 flex flex-col gap-1" style={{ listStyle: "none", padding: 0 }}>
          {filteredPins.map((pin) => (
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
                <p style={{ color: "var(--fg-3)", fontSize: "calc(13px * var(--font-scale))" }}>
                  {selectedPin.address}
                </p>
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
    </div>
  );
}
