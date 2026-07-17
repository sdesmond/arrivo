import type { LocatedItemPin, TripEvent } from "@/data/types";

export function getLocatedItemPins(events: TripEvent[]): LocatedItemPin[] {
  return events
    .filter((event) => event.locationLat != null && event.locationLng != null)
    .map((event) => ({
      id: event.id,
      name: event.name,
      address: event.locationAddress,
      lat: event.locationLat!,
      lng: event.locationLng!,
    }));
}

// ~6-7m at the equator — enough to split stacked markers into distinct tap targets.
const DECLUSTER_OFFSET_DEGREES = 0.00006;

export function declusterPins(pins: LocatedItemPin[]): LocatedItemPin[] {
  const occurrencesByCoordinate = new Map<string, number>();

  return pins.map((pin) => {
    const coordinateKey = `${pin.lat},${pin.lng}`;
    const occurrence = occurrencesByCoordinate.get(coordinateKey) ?? 0;
    occurrencesByCoordinate.set(coordinateKey, occurrence + 1);

    if (occurrence === 0) return pin;

    const offset = occurrence * DECLUSTER_OFFSET_DEGREES;
    return { ...pin, lat: pin.lat + offset, lng: pin.lng + offset };
  });
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
