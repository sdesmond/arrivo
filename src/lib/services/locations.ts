import "server-only";

import { z } from "zod";
import { SearchBoxCore, SessionToken } from "@mapbox/search-js-core";
import type { SearchBoxAdministrativeUnitTypes, SearchBoxSuggestion } from "@mapbox/search-js-core";
import { assertWithinRateLimit } from "@/lib/rate-limit";
import { ValidationFailedError } from "@/lib/services/validation-failed-error";
import type { Actor, LocationLookupSuggestion, LocationSuggestion, RetrievedLocation } from "@/data/types";

const DESTINATION_LOCATION_TYPES: SearchBoxAdministrativeUnitTypes[] = [
  "place",
  "locality",
  "neighborhood",
  "region",
  "country",
];
const SUGGESTION_LIMIT = 5;
const MAPBOX_TIMEOUT_MS = 10_000;
const mapboxCoordinates = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

function buildPlaceName(props: Pick<SearchBoxSuggestion, "name" | "context" | "feature_type">): string {
  const name = props.name ?? "";
  const country = props.context?.country?.name;
  const region = props.context?.region?.name;
  const place = props.context?.place?.name;

  const parts: string[] = [name];

  if (place && place !== name && place !== country) {
    parts.push(place);
  }

  if (region && region !== name && region !== place && region !== country) {
    parts.push(region);
  }

  if (country && country !== name && country !== place && country !== region) {
    parts.push(country);
  }

  return parts.join(", ");
}

function buildFullAddress(
  props: Pick<SearchBoxSuggestion, "full_address" | "place_formatted" | "name" | "context" | "feature_type">
): string {
  return props.full_address ?? props.place_formatted ?? buildPlaceName(props);
}

function assertPresent(value: string, field: string, message: string): void {
  if (!value.trim()) throw new ValidationFailedError(message, { [field]: [message] });
}

function usesE2EStub(): boolean {
  return process.env.E2E_MAPBOX_STUB === "true";
}

function buildStubLocation(): RetrievedLocation {
  return {
    name: "Paris",
    fullAddress: "Paris, France",
    placeName: "Paris, France",
    country: "France",
    countryCode: "FR",
    center: [2.3488, 48.8534],
  };
}

/** Spends the actor's search budget, then runs one Mapbox request under the timeout. */
async function callMapbox<Result>(
  actor: Actor,
  failurePrefix: string,
  request: (search: SearchBoxCore, signal: AbortSignal) => Promise<Result>
): Promise<Result> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MAPBOX_ACCESS_TOKEN is not configured");
  }

  assertWithinRateLimit("mapboxSearch", actor.userId);

  const search = new SearchBoxCore({ accessToken: token });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAPBOX_TIMEOUT_MS);

  try {
    return await request(search, controller.signal);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${failurePrefix}: ${error.message}`, { cause: error });
    }
    throw new Error(`${failurePrefix}: Unknown error`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchDestinationLocations(
  actor: Actor,
  query: string,
  sessionToken: string
): Promise<LocationSuggestion[]> {
  assertPresent(query, "query", "Search query must not be empty");

  if (usesE2EStub()) {
    return [{ placeName: "Paris, France", country: "France", countryCode: "FR", mapboxId: "stub-paris-id" }];
  }

  return callMapbox(actor, "Location search failed", async (search, signal) => {
    const response = await search.suggest(query, {
      sessionToken: new SessionToken(sessionToken),
      types: new Set(DESTINATION_LOCATION_TYPES),
      limit: SUGGESTION_LIMIT,
      signal,
    });

    return response.suggestions.map((suggestion) => ({
      placeName: buildPlaceName(suggestion),
      country: suggestion.context?.country?.name ?? "",
      countryCode: suggestion.context?.country?.country_code ?? "",
      mapboxId: suggestion.mapbox_id,
    }));
  });
}

export async function searchAddressLocations(
  actor: Actor,
  query: string,
  sessionToken: string
): Promise<LocationLookupSuggestion[]> {
  assertPresent(query, "query", "Search query must not be empty");

  if (usesE2EStub()) {
    return [
      { name: "Paris", fullAddress: "Paris, France", mapboxId: "stub-paris-id", resolvedLocation: buildStubLocation() },
    ];
  }

  return callMapbox(actor, "Location search failed", async (search, signal) => {
    const response = await search.suggest(query, {
      sessionToken: new SessionToken(sessionToken),
      limit: SUGGESTION_LIMIT,
      signal,
    });

    return response.suggestions.map((suggestion) => ({
      name: suggestion.name ?? buildPlaceName(suggestion),
      fullAddress: buildFullAddress(suggestion),
      mapboxId: suggestion.mapbox_id,
    }));
  });
}

export async function retrieveLocation(
  actor: Actor,
  mapboxId: string,
  sessionToken: string
): Promise<RetrievedLocation> {
  assertPresent(mapboxId, "mapboxId", "mapboxId is required");

  if (usesE2EStub()) {
    return buildStubLocation();
  }

  return callMapbox(actor, "Location retrieve failed", async (search, signal) => {
    const response = await search.retrieve({ mapbox_id: mapboxId } as unknown as SearchBoxSuggestion, {
      sessionToken: new SessionToken(sessionToken),
      signal,
    });

    const feature = response.features[0];
    if (!feature) throw new Error("No feature returned from retrieve");
    if (!feature.geometry) throw new Error("No geometry in retrieve response");

    const center = mapboxCoordinates.safeParse(feature.geometry.coordinates);
    if (!center.success) throw new Error("Invalid coordinates in retrieve response");

    const props = feature.properties;
    const placeName = buildPlaceName(props);

    return {
      name: props.name ?? placeName,
      fullAddress: buildFullAddress(props),
      placeName,
      country: props.context?.country?.name ?? "",
      countryCode: props.context?.country?.country_code ?? "",
      center: center.data,
    };
  });
}
