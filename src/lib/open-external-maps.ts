export interface OpenExternalMapsOptions {
  address?: string;
  lat?: number;
  lng?: number;
  label?: string;
}

const MAPS_DIR_BASE = "https://www.google.com/maps/dir/?api=1&destination=";

/**
 * Opens Google Maps directions to a destination in a new tab. On mobile the
 * `maps/dir` deep link hands off to the native Maps app; on desktop it opens
 * Google Maps in a new tab. Prefers a human-readable address (better pin
 * resolution) and falls back to coordinates. No-ops when neither is available
 * or when called during SSR (no `window`).
 */
export function openExternalMaps({ address, lat, lng }: OpenExternalMapsOptions): void {
  if (typeof window === "undefined") return;

  let destination: string | undefined;
  if (address) {
    destination = encodeURIComponent(address);
  } else if (lat != null && lng != null) {
    destination = `${lat},${lng}`;
  }

  if (!destination) return;

  window.open(`${MAPS_DIR_BASE}${destination}`, "_blank", "noopener,noreferrer");
}
