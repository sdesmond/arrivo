import { z } from "zod";
import type { CoverImageSearchResult } from "@/data/types";
import { FIELD_LIMITS, MAX_COVER_SEARCH_PAGE, MAX_COVER_SEARCH_PAGE_SIZE } from "@/lib/validation-limits";
import { defineEndpoint } from "../endpoint";
const name = z.string().trim().min(1).max(FIELD_LIMITS.destination);
export const searchCoverImages = defineEndpoint<{ images: CoverImageSearchResult[] }>()({
  method: "GET",
  path: "/api/v1/cover-images",
  params: z.object({}),
  body: z.strictObject({
    query: name,
    page: z.coerce.number().int().min(1).max(MAX_COVER_SEARCH_PAGE).optional(),
    perPage: z.coerce.number().int().min(1).max(MAX_COVER_SEARCH_PAGE_SIZE).optional(),
  }),
});
export const resolveDestinationCenter = defineEndpoint<{ center: [number, number] | null }>()({
  method: "GET",
  path: "/api/v1/cover-images/destination",
  params: z.object({}),
  body: z.strictObject({ name }),
});
