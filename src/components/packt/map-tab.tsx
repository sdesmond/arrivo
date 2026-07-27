"use client";

import { createElement, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DayItinerary, LocatedItemPin, Reservation, TripEvent } from "@/data/types";
import { getLocatedItemPins, separateNearbyPins, transformMapboxUrl } from "@/lib/map-helpers";
import { openExternalMaps } from "@/lib/open-external-maps";
import { RESERVATION_TYPE_META } from "@/components/packt/reservation-type-badge";

export interface MapTabProps {
  events: TripEvent[];
  reservations?: Reservation[];
  tripId: string;
  days?: DayItinerary[];
  unscheduledEvents?: TripEvent[];
  /** Initial day number for deep-linking; read once on mount when the URL has no day parameter. */
  dayFilter?: number | null;
}

interface SelectedDayOverride {
  dayNumber: number | null;
  dayParam: string | null;
}

// v11, not v12 — Mapbox's v12+ hosted styles use proprietary style-spec extensions (e.g. layer
// "slot" properties) that MapLibre GL JS's stricter open-spec validator rejects at runtime.
const MAP_STYLE_URL = "https://api.mapbox.com/styles/v1/mapbox/streets-v11";
const SINGLE_PIN_ZOOM = 14;
const FIT_BOUNDS_PADDING_PX = 56;
// Half the docked detail card's height, so the camera nudge on selection keeps the tapped pin
// visible above the card instead of centering it behind that card.
const SELECTED_PIN_VERTICAL_OFFSET_PX = 60;
const SELECTED_PIN_EASE_DURATION_MS = 300;

// Stable references for the optional-prop defaults below: `= []` in a default parameter creates a
// brand-new array on every render, which would make `pins`/`filteredPins` change identity on every
// render and force the marker-build effect to tear down and recreate every marker on every
// selection change, not just on real data changes.
const EMPTY_RESERVATIONS: Reservation[] = [];
const EMPTY_UNSCHEDULED_EVENTS: TripEvent[] = [];

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function createMarkerElement(
  pin: LocatedItemPin,
  onSelect: (pin: LocatedItemPin) => void,
  sequenceNumber: number | null
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.dataset.pinId = pin.id;
  const reservationMeta = pin.reservationType ? RESERVATION_TYPE_META[pin.reservationType] : null;
  const accessibleName =
    sequenceNumber !== null
      ? `${sequenceNumber}. ${pin.name}`
      : reservationMeta
        ? `${reservationMeta.label} · ${pin.name}`
        : pin.name;
  element.setAttribute("aria-label", accessibleName);
  element.title = accessibleName;
  element.style.width = "44px";
  element.style.height = "44px";
  element.style.border = "0";
  element.style.padding = "0";
  element.style.cursor = "pointer";
  element.style.display = "flex";
  element.style.alignItems = "center";
  element.style.justifyContent = "center";

  if (sequenceNumber !== null) {
    element.style.background = "transparent";
    const badge = document.createElement("span");
    badge.dataset.markerVisual = "true";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = String(sequenceNumber);
    badge.style.width = "28px";
    badge.style.height = "28px";
    badge.style.borderRadius = "50%";
    badge.style.background = "var(--accent-brand)";
    badge.style.color = "var(--accent-fg)";
    badge.style.display = "flex";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.style.fontWeight = "700";
    badge.style.fontSize = "calc(12px * var(--font-scale))";
    badge.style.lineHeight = "1";
    element.appendChild(badge);
  } else if (reservationMeta) {
    element.style.background = "transparent";
    const badge = document.createElement("span");
    badge.dataset.markerVisual = "true";
    badge.style.width = "28px";
    badge.style.height = "28px";
    badge.style.borderRadius = "50%";
    badge.style.background = "var(--surface-2)";
    badge.style.color = "var(--fg-3)";
    badge.style.display = "flex";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.innerHTML = renderToStaticMarkup(createElement(reservationMeta.icon, { size: 14, strokeWidth: 1.5 }));
    element.appendChild(badge);
  } else {
    element.style.background = "transparent";
    const dot = document.createElement("span");
    dot.dataset.markerVisual = "true";
    dot.style.width = "14px";
    dot.style.height = "14px";
    dot.style.borderRadius = "50%";
    dot.style.background = "var(--accent-brand)";
    element.appendChild(dot);
  }

  element.addEventListener("click", () => onSelect(pin));
  return element;
}

function parseDayNumber(value: string | null): number | null {
  if (value === null) return null;
  const dayNumber = Number(value);
  return Number.isFinite(dayNumber) ? dayNumber : null;
}

function subscribeToDayParam(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function readDayParam(): string | null {
  return new URLSearchParams(window.location.search).get("day");
}

function readServerDayParam(): string | null {
  return null;
}

export function MapTab({
  events,
  reservations = EMPTY_RESERVATIONS,
  tripId,
  days,
  unscheduledEvents = EMPTY_UNSCHEDULED_EVENTS,
  dayFilter,
}: MapTabProps): ReactElement {
  const pins = useMemo(() => getLocatedItemPins(events, reservations), [events, reservations]);
  const dayParamFromUrl = useSyncExternalStore(subscribeToDayParam, readDayParam, readServerDayParam);
  // `undefined` = no user selection yet (derive from the URL day param, then dayFilter, then Whole Trip).
  // `null` = user explicitly chose Whole Trip. A number = user explicitly chose that day.
  const [selectedDayOverride, setSelectedDayOverride] = useState<SelectedDayOverride | null>(null);
  const hasCurrentDayOverride = selectedDayOverride?.dayParam === dayParamFromUrl;
  const selectedDayNumber = hasCurrentDayOverride
    ? selectedDayOverride.dayNumber
    : (parseDayNumber(dayParamFromUrl) ?? dayFilter ?? null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const selectorRef = useRef<HTMLDivElement>(null);
  const resultsRegionId = useId();
  const [selectedPin, setSelectedPin] = useState<LocatedItemPin | null>(null);
  const router = useRouter();

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

  useEffect(() => {
    if (selectedPin && !filteredPins.some((pin) => pin.id === selectedPin.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- selection is invalid after refreshed pins remove it.
      setSelectedPin(null);
    }
  }, [filteredPins, selectedPin]);

  const scheduledEventIds = useMemo(
    () => (days ? new Set(days.flatMap((day) => day.events.map((event) => event.id))) : null),
    [days]
  );

  const pinSequenceNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    let nextNumber = 1;
    for (const pin of filteredPins) {
      if (pin.reservationType !== undefined) continue;
      const isScheduled = scheduledEventIds === null || scheduledEventIds.has(pin.id);
      if (isScheduled) numbers.set(pin.id, nextNumber++);
    }
    return numbers;
  }, [filteredPins, scheduledEventIds]);

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

  function handleSelectPin(pin: LocatedItemPin): void {
    setSelectedPin(pin);
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [pin.lng, pin.lat],
      zoom: Math.max(map.getZoom(), SINGLE_PIN_ZOOM),
      offset: [0, -SELECTED_PIN_VERTICAL_OFFSET_PX],
      duration: prefersReducedMotion() ? 0 : SELECTED_PIN_EASE_DURATION_MS,
    });
  }

  function handleViewInItinerary(eventId: string): void {
    router.push(`?tab=itin&focus=${eventId}`, { scroll: false });
  }

  function selectScope(dayNumber: number | null): void {
    const dayParam = dayNumber === null ? null : String(dayNumber);
    setSelectedDayOverride({ dayNumber, dayParam });
    setSelectedPin(null);

    const nextUrl = new URL(window.location.href);
    if (dayParam === null) nextUrl.searchParams.delete("day");
    else nextUrl.searchParams.set("day", dayParam);
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
      new maplibregl.Marker({
        element: createMarkerElement(pin, handleSelectPin, pinSequenceNumbers.get(pin.id) ?? null),
        offset,
      })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map)
    );
  }, [filteredPins, pinSequenceNumbers]);

  // Runs whenever the selection changes *or* markers get rebuilt (day-scope change), so a
  // still-selected pin's ring survives a marker rebuild instead of only applying once.
  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const markerElement = marker.getElement();
      const visualElement = markerElement.querySelector<HTMLElement>("[data-marker-visual]") ?? markerElement;
      const isSelected = markerElement.dataset.pinId === selectedPin?.id;
      // A same-color ring around an accent-brand-filled badge (the numbered/dot pins) would be
      // invisible against its own fill, so the ring is a two-tone halo: a `--bg` gap separates it
      // from the badge, then an accent-brand outer ring stays visible against the map tiles.
      visualElement.style.boxShadow = isSelected ? "0 0 0 3px var(--bg), 0 0 0 6px var(--accent-brand)" : "";
      visualElement.style.transform = isSelected ? "scale(1.15)" : "";
    });
  }, [selectedPin, filteredPins, pinSequenceNumbers]);

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
      <div id={resultsRegionId} style={{ position: "relative" }}>
        <div
          ref={mapContainerRef}
          role="application"
          aria-label="Trip map showing located stops"
          tabIndex={0}
          data-testid="map-tab-container"
          style={{ width: "100%", height: 420, borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)" }}
        />
        {selectedPin && (
          <div
            data-testid="map-tab-pin-detail"
            className="flex items-start justify-between gap-3"
            style={{
              position: "absolute",
              left: 10,
              right: 10,
              bottom: 10,
              border: "1px solid var(--line)",
              borderRadius: 14,
              background: "var(--bg)",
              padding: "12px 14px",
              boxShadow: "0 8px 20px rgba(0, 0, 0, 0.18)",
            }}
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
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="lg"
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
                {!selectedPin.reservationType && (
                  <Button variant="outline" size="lg" onClick={() => handleViewInItinerary(selectedPin.id)}>
                    View in Itinerary
                  </Button>
                )}
              </div>
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
