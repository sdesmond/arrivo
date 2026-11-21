import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { CoverType } from "@/data/types";
import { deriveGraphicCover } from "@/lib/utils";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { createUploadStorageName } from "@/lib/upload-policy";
import { searchCoverImages } from "@/lib/services/cover-search";

/** Longest the create request waits on Mapbox for the map tile before the trip keeps no cover. */
export const MAP_TILE_TIMEOUT_MS = 5000;

const VALID_COVER_TYPES = new Set<string>(Object.values(CoverType));

export interface TripCoverUpdate {
  coverImageUrl: string;
  coverPhotographer?: string;
  coverPhotographerUrl?: string;
}

export interface TripCoverRequest {
  userId: string;
  tripId: string;
  name: string;
  destinationName?: string;
  destinationCenter?: [number, number];
}

/**
 * Picks the new trip's cover the way the user's default cover type asks: a built-in graphic, a Mapbox tile saved to
 * storage, or the first photo search hit. Runs after the trip commits and never throws: a failed lookup is logged
 * and the trip simply keeps no cover.
 */
export async function generateTripCover(request: TripCoverRequest): Promise<TripCoverUpdate | null> {
  const { userId, tripId, name, destinationName, destinationCenter } = request;
  const hasDestination = !!destinationName || !!destinationCenter;
  let coverUrl: string | null = null;
  let coverPhotographer: string | null = null;
  let coverPhotographerUrl: string | null = null;
  try {
    if (!hasDestination) {
      coverUrl = deriveGraphicCover(name);
    } else {
      const [userRow] = await db
        .select({ defaultCoverType: users.defaultCoverType })
        .from(users)
        .where(eq(users.id, userId));
      const storedCoverType = userRow?.defaultCoverType;
      const coverType =
        (storedCoverType && VALID_COVER_TYPES.has(storedCoverType) ? (storedCoverType as CoverType) : null) ??
        CoverType.Photo;

      if (coverType === CoverType.Graphic) {
        coverUrl = deriveGraphicCover(name);
      } else if (coverType === CoverType.Map && destinationCenter) {
        const [lng, lat] = destinationCenter;
        const token = process.env.MAPBOX_ACCESS_TOKEN ?? "";
        const tileUrl = `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/${lng},${lat},10/600x400@2x?access_token=${token}`;
        const tileRes = await fetch(tileUrl, { signal: AbortSignal.timeout(MAP_TILE_TIMEOUT_MS) });
        if (!tileRes.ok) throw new Error(`Mapbox tile fetch failed: ${tileRes.status}`);
        const tileBlob = await tileRes.blob();
        const storageName = createUploadStorageName("trip-cover", tripId, "image/jpeg");
        const tileFile = new File([tileBlob], storageName, { type: "image/jpeg" });
        coverUrl = await getStorageAdapter().put(storageName, tileFile);
      } else if (coverType === CoverType.Photo && destinationName) {
        const images = await searchCoverImages({ userId }, destinationName);
        const firstImage = images[0];
        coverUrl = firstImage?.url ?? null;
        coverPhotographer = firstImage?.photographer ?? null;
        coverPhotographerUrl = firstImage?.photographerUrl ?? null;
      }
    }
  } catch (error) {
    console.error("Cover image fetch failed:", error);
    return null;
  }
  if (!coverUrl) return null;
  return {
    coverImageUrl: coverUrl,
    ...(coverPhotographer && { coverPhotographer }),
    ...(coverPhotographerUrl && { coverPhotographerUrl }),
  };
}
