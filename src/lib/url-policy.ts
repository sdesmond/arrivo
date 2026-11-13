import { parseUploadStorageName, type ParsedUploadStorageName } from "@/lib/upload-policy";
import { GRAPHIC_COVER_COLORS, GRAPHIC_COVER_ICONS, GRAPHIC_COVER_PATTERNS, parseGraphicCover } from "@/lib/utils";

export const MAX_URL_LENGTH = 2048;

const STORAGE_URL_PREFIX = "/api/storage/";

/** True only for absolute http(s) URLs: rejects other schemes, protocol-relative `//host`, whitespace and oversize values. */
export function isHttpUrl(value: string): boolean {
  if (value.length === 0 || value.length > MAX_URL_LENGTH || /\s/.test(value)) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Parses one of this app's own `/api/storage/<scope>/<owner>/<file>` URLs; null when it is anything else. */
export function parseOwnStorageUrl(value: string): ParsedUploadStorageName | null {
  if (!value.startsWith(STORAGE_URL_PREFIX)) return null;
  try {
    return parseUploadStorageName(value.slice(STORAGE_URL_PREFIX.length));
  } catch {
    return null;
  }
}

function isKnownGraphicCover(value: string): boolean {
  const graphic = parseGraphicCover(value);
  if (!graphic) return false;
  return (
    (GRAPHIC_COVER_COLORS as readonly string[]).includes(graphic.color) &&
    (GRAPHIC_COVER_PATTERNS as readonly string[]).includes(graphic.pattern) &&
    (GRAPHIC_COVER_ICONS as readonly string[]).includes(graphic.icon)
  );
}

const MAP_TILE_COVER_PATH = "/api/mapbox/static";

// The picker's map view saves this same-origin tile URL; the route proxies Mapbox with the server token.
function isMapTileCover(value: string): boolean {
  if (value.length > MAX_URL_LENGTH || !value.startsWith(`${MAP_TILE_COVER_PATH}?`)) return false;
  const params = new URLSearchParams(value.slice(MAP_TILE_COVER_PATH.length + 1));
  const keys = [...params.keys()].sort();
  if (keys.length !== 2 || keys[0] !== "lat" || keys[1] !== "lng") return false;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  return (
    params.get("lat") !== "" &&
    params.get("lng") !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

const E2E_STUB_COVER_PREFIX = "data:image/svg+xml;charset=utf-8,";
const MAX_E2E_STUB_COVER_LENGTH = 4096;

// The offline Unsplash stub (cover-search.ts) returns inline SVG covers. Real search results are
// https, so this is accepted only under the E2E server's flag.
function isE2EStubCover(value: string): boolean {
  return (
    process.env.E2E_MODE === "true" &&
    value.startsWith(E2E_STUB_COVER_PREFIX) &&
    value.length <= MAX_E2E_STUB_COVER_LENGTH
  );
}

/**
 * A cover is an http(s) image, a built-in graphic, the picker's map tile, or a cover uploaded for `tripId`.
 * Pass no `tripId` where no upload can exist yet (trip creation).
 */
export function isValidCoverImageUrl(value: string, tripId?: string): boolean {
  if (isHttpUrl(value) || isKnownGraphicCover(value) || isMapTileCover(value) || isE2EStubCover(value)) return true;
  const stored = parseOwnStorageUrl(value);
  return stored !== null && tripId !== undefined && stored.scope === "trip-cover" && stored.ownerId === tripId;
}

export function assertValidCoverImageUrl(value: string, tripId?: string): void {
  if (!isValidCoverImageUrl(value, tripId)) throw new Error("Invalid cover image URL.");
}

export interface DocumentUrlOwner {
  tripId: string;
  eventId?: string;
}

/** A document link is an http(s) URL or a document this trip (or the given event) already uploaded. */
export function isValidDocumentUrl(value: string, owner: DocumentUrlOwner): boolean {
  if (isHttpUrl(value)) return true;
  const stored = parseOwnStorageUrl(value);
  if (!stored) return false;
  if (stored.scope === "trip-document") return stored.ownerId === owner.tripId;
  if (stored.scope === "event-document") return owner.eventId !== undefined && stored.ownerId === owner.eventId;
  return false;
}

export function assertValidPhotographerUrl(value: string): void {
  if (!isHttpUrl(value)) throw new Error("Invalid photographer URL.");
}
