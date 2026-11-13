import { expect, it, vi } from "vitest";
import { setTripCover, deleteTripCover, uploadTripCoverImage } from "./covers";
import { deriveGraphicCover, MAX_COVER_IMAGE_UPLOAD_BYTES } from "@/lib/utils";
const tripId = "223e4567-e89b-12d3-a456-426614174000";
it("defines strict 204 cover writes and normalized trip IDs", () => {
  for (const endpoint of [setTripCover, deleteTripCover]) {
    expect(endpoint.path).toBe("/api/v1/trips/:tripId/cover");
    expect(endpoint.status).toBe(204);
    expect(endpoint.params.parse({ tripId: tripId.toUpperCase() })).toEqual({ tripId });
    expect(endpoint.body.safeParse({ extra: true }).success).toBe(false);
  }
  expect(deleteTripCover.body.parse({})).toEqual({});
});
it("defines a multipart 204 cover upload capped at the 12 MB cover policy", () => {
  expect(uploadTripCoverImage.method).toBe("POST");
  expect(uploadTripCoverImage.path).toBe("/api/v1/trips/:tripId/cover/image");
  expect(uploadTripCoverImage.status).toBe(204);
  expect(uploadTripCoverImage.multipart).toEqual({ maxFileBytes: MAX_COVER_IMAGE_UPLOAD_BYTES });
  expect(MAX_COVER_IMAGE_UPLOAD_BYTES).toBe(12 * 1024 * 1024);
  expect(uploadTripCoverImage.params.parse({ tripId: tripId.toUpperCase() })).toEqual({ tripId });
  expect(uploadTripCoverImage.body.parse({})).toEqual({});
  expect(uploadTripCoverImage.body.safeParse({ extra: true }).success).toBe(false);
});
it.each([
  "https://images.unsplash.com/photo-1",
  "http://example.com/photo.jpg",
  deriveGraphicCover("Paris"),
  `/api/storage/trip-covers/${tripId}/cover.png`,
  "/api/mapbox/static?lng=2.3522&lat=48.8566",
])("preserves picker URL %s", (coverImageUrl) => {
  expect(setTripCover.body.parse({ coverImageUrl })).toEqual({ coverImageUrl });
});
it.each(["javascript:alert(1)", "//host/image", "https://bad host/image", "/api/storage/unknown", "graphic:nope"])(
  "rejects unsafe cover %s",
  (coverImageUrl) => {
    expect(setTripCover.body.safeParse({ coverImageUrl }).success).toBe(false);
  }
);
it("keeps attribution optional but checks any supplied photographer URL", () => {
  expect(
    setTripCover.body.parse({
      coverImageUrl: "https://example.com/image",
      coverPhotographer: null,
      coverPhotographerUrl: null,
    })
  ).toBeTruthy();
  expect(
    setTripCover.body.safeParse({
      coverImageUrl: "https://example.com/image",
      coverPhotographerUrl: "javascript:alert(1)",
    }).success
  ).toBe(false);
});
it("preserves offline search stubs only in E2E mode", () => {
  vi.stubEnv("E2E_MODE", "true");
  expect(setTripCover.body.safeParse({ coverImageUrl: "data:image/svg+xml;charset=utf-8,<svg/>" }).success).toBe(true);
  vi.unstubAllEnvs();
});
