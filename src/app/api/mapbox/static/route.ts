import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-helpers";

const MAPBOX_STATIC_STYLE = "mapbox/outdoors-v12";
const MAPBOX_STATIC_ZOOM = 10;
const MAPBOX_STATIC_SIZE = "600x400@2x";

function parseCoordinate(value: string | null, axis: "lat" | "lng") {
  // Number(null) and Number("") are 0, so a missing or empty param would otherwise pass as the equator/meridian.
  if (value === null || value.trim() === "") {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  if (axis === "lat" && (numericValue < -90 || numericValue > 90)) {
    return null;
  }

  if (axis === "lng" && (numericValue < -180 || numericValue > 180)) {
    return null;
  }

  return numericValue;
}

export async function GET(request: NextRequest) {
  // Spends the server's Mapbox quota, so it must not be an open proxy.
  await requireUser();

  const lat = parseCoordinate(request.nextUrl.searchParams.get("lat"), "lat");
  const lng = parseCoordinate(request.nextUrl.searchParams.get("lng"), "lng");

  if (lat === null || lng === null) {
    return new Response("Invalid map coordinates.", { status: 400 });
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    return new Response("MAPBOX_ACCESS_TOKEN is not configured.", { status: 500 });
  }

  const mapTileUrl = `https://api.mapbox.com/styles/v1/${MAPBOX_STATIC_STYLE}/static/${lng},${lat},${MAPBOX_STATIC_ZOOM}/${MAPBOX_STATIC_SIZE}?access_token=${token}`;
  const upstreamResponse = await fetch(mapTileUrl, {
    headers: {
      Accept: "image/*",
    },
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return new Response("Could not load map tile.", { status: upstreamResponse.status || 502 });
  }

  return new Response(upstreamResponse.body, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=3600",
      "Content-Type": upstreamResponse.headers.get("content-type") ?? "image/jpeg",
    },
  });
}
