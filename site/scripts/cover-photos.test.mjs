import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { applyCoverPhotos, COVER_PHOTOS, coverPhotoPlan, findMissingPhotos } from "./cover-photos.mjs";

const PHOTOS_DIR = join(dirname(fileURLToPath(import.meta.url)), "cover-photos");
const MAX_PHOTO_BYTES = 600 * 1024;

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "cover-photos-"));
  const photosDir = join(root, "photos");
  const storageRoot = join(root, "storage");
  mkdirSync(photosDir);
  writeFileSync(join(photosDir, "tokyo.jpg"), "tokyo-bytes");
  return { photosDir, storageRoot };
}

test("coverPhotoPlan builds the same key and proxy URL a real cover upload would", () => {
  const plan = coverPhotoPlan("trip-1", "uuid-1", "jpg");

  assert.equal(plan.key, "trip-covers/trip-1/uuid-1.jpg");
  assert.equal(plan.url, "/api/storage/trip-covers/trip-1/uuid-1.jpg");
});

test("findMissingPhotos lists configured files that are not on disk", () => {
  const { photosDir } = makeFixture();

  assert.deepEqual(
    findMissingPhotos(photosDir, [
      { trip: "Tokyo", file: "tokyo.jpg" },
      { trip: "Kyoto", file: "kyoto.jpg" },
    ]),
    ["kyoto.jpg"]
  );
});

test("applyCoverPhotos copies the photo into storage, drops stale covers and points the trip at it", async () => {
  const { photosDir, storageRoot } = makeFixture();
  const staleDir = join(storageRoot, "trip-covers", "trip-tokyo");
  mkdirSync(staleDir, { recursive: true });
  writeFileSync(join(staleDir, "old.jpg"), "old");
  const updates = [];

  await applyCoverPhotos({
    photosDir,
    storageRoot,
    photos: [{ trip: "Tokyo", file: "tokyo.jpg" }],
    findTripId: async (name) => (name === "Tokyo" ? "trip-tokyo" : undefined),
    setCoverUrl: async (tripId, url) => updates.push({ tripId, url }),
    createId: () => "fixed-id",
  });

  assert.deepEqual(readdirSync(staleDir), ["fixed-id.jpg"]);
  assert.equal(readFileSync(join(staleDir, "fixed-id.jpg"), "utf8"), "tokyo-bytes");
  assert.deepEqual(updates, [{ tripId: "trip-tokyo", url: "/api/storage/trip-covers/trip-tokyo/fixed-id.jpg" }]);
});

test("applyCoverPhotos fails clearly when the seeded trip is missing", async () => {
  const { photosDir, storageRoot } = makeFixture();

  await assert.rejects(
    applyCoverPhotos({
      photosDir,
      storageRoot,
      photos: [{ trip: "Tokyo", file: "tokyo.jpg" }],
      findTripId: async () => undefined,
      setCoverUrl: async () => {},
    }),
    /Trip "Tokyo" not found.*db:seed/
  );
});

test("every configured cover photo is committed, small, and credited", () => {
  const attribution = readFileSync(join(PHOTOS_DIR, "ATTRIBUTION.md"), "utf8");

  assert.equal(new Set(COVER_PHOTOS.map((photo) => photo.trip)).size, COVER_PHOTOS.length);
  for (const { file } of COVER_PHOTOS) {
    assert.ok(existsSync(join(PHOTOS_DIR, file)), `${file} is missing from scripts/cover-photos/`);
    assert.ok(statSync(join(PHOTOS_DIR, file)).size <= MAX_PHOTO_BYTES, `${file} is larger than 600 KB`);
    assert.ok(attribution.includes(file), `${file} has no entry in ATTRIBUTION.md`);
  }
});
