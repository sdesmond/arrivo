import type { LocatedItemPin, Reservation, TripEvent } from "@/data/types";

export function getLocatedItemPins(events: TripEvent[], reservations: Reservation[] = []): LocatedItemPin[] {
  const eventPins = events
    .filter((event) => event.locationLat != null && event.locationLng != null)
    .map((event) => ({
      id: event.id,
      name: event.name,
      address: event.locationAddress,
      lat: event.locationLat!,
      lng: event.locationLng!,
    }));

  const reservationPins = reservations.flatMap((reservation) => {
    const pins: LocatedItemPin[] = [];
    if (reservation.startLocationLat != null && reservation.startLocationLng != null) {
      pins.push({
        id: `${reservation.id}-start`,
        name: reservation.startLocationName ?? reservation.provider,
        address: reservation.startAddress,
        lat: reservation.startLocationLat,
        lng: reservation.startLocationLng,
      });
    }
    if (reservation.endLocationLat != null && reservation.endLocationLng != null) {
      pins.push({
        id: `${reservation.id}-end`,
        name: reservation.endLocationName ?? reservation.provider,
        address: reservation.endAddress,
        lat: reservation.endLocationLat,
        lng: reservation.endLocationLng,
      });
    }
    return pins;
  });

  return [...eventPins, ...reservationPins];
}

const NEARBY_PIN_DISTANCE_DEGREES = 0.0003;
const MARKER_OFFSET_PIXELS = 28;

export interface SeparatedMapPin {
  pin: LocatedItemPin;
  offset: [number, number];
}

export function separateNearbyPins(pins: LocatedItemPin[]): SeparatedMapPin[] {
  const pinGroups: LocatedItemPin[][] = [];
  const offsetsByPinId = new Map<string, [number, number]>();

  for (const pin of pins) {
    const nearbyGroup = pinGroups.find((group) =>
      group.some(
        (groupedPin) =>
          Math.abs(groupedPin.lat - pin.lat) <= NEARBY_PIN_DISTANCE_DEGREES &&
          Math.abs(groupedPin.lng - pin.lng) <= NEARBY_PIN_DISTANCE_DEGREES
      )
    );
    if (nearbyGroup) nearbyGroup.push(pin);
    else pinGroups.push([pin]);
  }

  for (const group of pinGroups) {
    if (group.length === 1) {
      offsetsByPinId.set(group[0].id, [0, 0]);
      continue;
    }

    group.forEach((pin, index) => {
      const angle = (2 * Math.PI * index) / group.length;
      offsetsByPinId.set(pin.id, [Math.cos(angle) * MARKER_OFFSET_PIXELS, Math.sin(angle) * MARKER_OFFSET_PIXELS]);
    });
  }

  return pins.map((pin) => ({ pin, offset: offsetsByPinId.get(pin.id) ?? [0, 0] }));
}

const MAPBOX_API_BASE = "https://api.mapbox.com";

// MapLibre GL JS dropped Mapbox's proprietary `mapbox://` URL scheme in the fork, so a style
// fetched from Mapbox's Styles API (which references its sources/sprite/glyphs via that scheme)
// fails outright unless we resolve those references to real HTTPS endpoints ourselves.
export function transformMapboxUrl(
  url: string,
  resourceType: string | undefined,
  accessToken: string
): { url: string } | undefined {
  if (!url.startsWith("mapbox://")) return undefined;

  if (resourceType === "Source") {
    const tilesetIds = url.slice("mapbox://".length);
    return { url: `${MAPBOX_API_BASE}/v4/${tilesetIds}.json?secure&access_token=${accessToken}` };
  }

  if (resourceType === "SpriteJSON" || resourceType === "SpriteImage") {
    const path = url.slice("mapbox://sprites/".length);
    const match = path.match(/^(.+?)(@\d+x)?\.(json|png)$/);
    if (!match) return undefined;

    const [, stylePath, scale = "", extension] = match;
    return { url: `${MAPBOX_API_BASE}/styles/v1/${stylePath}/sprite${scale}.${extension}?access_token=${accessToken}` };
  }

  if (resourceType === "Glyphs") {
    const path = url.slice("mapbox://fonts/".length);
    return { url: `${MAPBOX_API_BASE}/fonts/v1/${path}?access_token=${accessToken}` };
  }

  return undefined;
}
