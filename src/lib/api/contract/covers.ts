import { z } from "zod";
import { isHttpUrl, isValidCoverImageUrl, parseOwnStorageUrl } from "@/lib/url-policy";
import { MAX_COVER_IMAGE_UPLOAD_BYTES } from "@/lib/utils";
import { defineEndpoint } from "../endpoint";
const params = z.object({ tripId: z.uuid().toLowerCase() });
export const setTripCover = defineEndpoint<null>()({
  method: "PUT",
  path: "/api/v1/trips/:tripId/cover",
  status: 204,
  params,
  body: z.strictObject({
    coverImageUrl: z.string().refine((value) => {
      const stored = parseOwnStorageUrl(value);
      return isValidCoverImageUrl(value, stored?.ownerId);
    }, "Invalid cover image URL."),
    coverPhotographer: z.string().nullable().optional(),
    coverPhotographerUrl: z.string().refine(isHttpUrl, "Invalid photographer URL.").nullable().optional(),
  }),
});
/**
 * Uploads an image (multipart `file` part) as the trip's custom cover and clears its attribution. There is no
 * `Idempotency-Key`: no file body is hashed, so a retry stores a fresh file and replaces the cover again.
 */
export const uploadTripCoverImage = defineEndpoint<null>()({
  method: "POST",
  path: "/api/v1/trips/:tripId/cover/image",
  status: 204,
  params,
  body: z.strictObject({}),
  multipart: { maxFileBytes: MAX_COVER_IMAGE_UPLOAD_BYTES },
});
export const deleteTripCover = defineEndpoint<null>()({
  method: "DELETE",
  path: "/api/v1/trips/:tripId/cover",
  status: 204,
  params,
  body: z.strictObject({}),
});
