import { z } from "zod";
import type { LocationLookupSuggestion, LocationSuggestion, RetrievedLocation } from "@/data/types";
import { defineEndpoint } from "../endpoint";
/** Mapbox Search Box rejects a longer search query. Saved addresses may be longer. */
export const MAX_LOCATION_SEARCH_QUERY_LENGTH = 256;
/** Mapbox Search Box session tokens group one search with its retrieve for billing. */
const sessionToken = z.string().trim().min(1).max(255);
export const searchLocations = defineEndpoint<{
  /** `destination` mode returns `LocationSuggestion` items, `address` mode `LocationLookupSuggestion` items. */
  suggestions: LocationSuggestion[] | LocationLookupSuggestion[];
}>()({
  method: "GET",
  path: "/api/v1/locations/search",
  params: z.object({}),
  body: z.strictObject({
    query: z.string().trim().min(1).max(MAX_LOCATION_SEARCH_QUERY_LENGTH),
    mode: z.enum(["destination", "address"]),
    sessionToken,
  }),
});
export const retrieveLocation = defineEndpoint<{ location: RetrievedLocation }>()({
  method: "GET",
  path: "/api/v1/locations/retrieve",
  params: z.object({}),
  body: z.strictObject({ mapboxId: z.string().trim().min(1).max(2048), sessionToken }),
});
