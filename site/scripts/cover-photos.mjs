// Gives the seeded Tokyo and Kyoto trips a real photo cover, so docs screenshots don't show the
// app's placeholder graphic covers. Mirrors what a cover upload does: the photo is written under
// `<STORAGE_LOCAL_ROOT_DIR>/trip-covers/<tripId>/` and the trip's `cover_image_url` points at the
// authenticated `/api/storage/...` proxy. Re-running `npm run db:seed` in the repo root restores
// the graphic covers. Photos and their credits live in `cover-photos/`.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";

export const COVER_PHOTOS = [
  { trip: "Tokyo", file: "tokyo.jpg" },
  { trip: "Kyoto", file: "kyoto.jpg" },
];

const COVER_PREFIX = "trip-covers";
const STORAGE_PROXY_PREFIX = "/api/storage/";

export function coverPhotoPlan(tripId, id, extension) {
  const key = `${COVER_PREFIX}/${tripId}/${id}.${extension}`;
  return { key, url: `${STORAGE_PROXY_PREFIX}${key}` };
}

export function findMissingPhotos(photosDir, photos = COVER_PHOTOS) {
  return photos.filter(({ file }) => !existsSync(join(photosDir, file))).map(({ file }) => file);
}

export async function applyCoverPhotos({
  photosDir,
  storageRoot,
  photos = COVER_PHOTOS,
  findTripId,
  setCoverUrl,
  createId = randomUUID,
}) {
  const missing = findMissingPhotos(photosDir, photos);
  if (missing.length > 0) throw new Error(`Cover photos missing from ${photosDir}: ${missing.join(", ")}`);

  for (const { trip, file } of photos) {
    const tripId = await findTripId(trip);
    if (!tripId) throw new Error(`Trip "${trip}" not found. Run \`npm run db:seed\` in the repo root first.`);

    const plan = coverPhotoPlan(tripId, createId(), extname(file).slice(1));
    const tripDir = join(storageRoot, COVER_PREFIX, tripId);
    await mkdir(tripDir, { recursive: true });
    // Drop covers from earlier runs so storage doesn't accumulate orphans.
    for (const stale of await readdir(tripDir)) await rm(join(tripDir, stale), { force: true });
    await copyFile(join(photosDir, file), join(storageRoot, plan.key));
    await setCoverUrl(tripId, plan.url);
  }
}
