import { z } from "zod";
import { isHttpUrl, isValidCoverImageUrl, parseOwnStorageUrl } from "@/lib/url-policy";
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
export const deleteTripCover = defineEndpoint<null>()({
  method: "DELETE",
  path: "/api/v1/trips/:tripId/cover",
  status: 204,
  params,
  body: z.strictObject({}),
});
