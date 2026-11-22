"use server";

import { requireUser } from "@/lib/auth-helpers";
import { SearchBoxCore, SessionToken } from "@mapbox/search-js-core";
import { assertWithinRateLimit } from "@/lib/rate-limit";
import type { SearchBoxAdministrativeUnitTypes, SearchBoxSuggestion } from "@mapbox/search-js-core";
export interface LocationSuggestion {
  placeName: string;
  country: string;
  countryCode: string;
  mapboxId: string;
}

export interface LocationLookupSuggestion {
  name: string;
  fullAddress: string;
  mapboxId: string;
  resolvedLocation?: RetrievedLocation;
}

export interface RetrievedLocation {
  name: string;
  fullAddress: string;
  placeName: string;
  country: string;
  countryCode: string;
  center: [number, number];
}

const DESTINATION_LOCATION_TYPES: SearchBoxAdministrativeUnitTypes[] = [
  "place",
  "locality",
  "neighborhood",
  "region",
  "country",
];

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

export async function searchLocations(query: string, sessionToken: string): Promise<LocationSuggestion[]> {
  if (!query.trim()) {
    throw new Error("Search query must not be empty");
  }

  if (process.env.E2E_MAPBOX_STUB === "true") {
    await requireUser();
    return [
      {
        placeName: "Paris, France",
        country: "France",
        countryCode: "FR",
        mapboxId: "stub-paris-id",
      },
    ];
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MAPBOX_ACCESS_TOKEN is not configured");
  }

  const user = await requireUser();
  assertWithinRateLimit("mapboxSearch", user.id!);

  const search = new SearchBoxCore({ accessToken: token });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await search.suggest(query, {
      sessionToken: new SessionToken(sessionToken),
      types: new Set(DESTINATION_LOCATION_TYPES),
      limit: 5,
      signal: controller.signal,
    });

    return response.suggestions.map((suggestion) => {
      const placeName = buildPlaceName(suggestion);
      return {
        placeName,
        country: suggestion.context?.country?.name ?? "",
        countryCode: suggestion.context?.country?.country_code ?? "",
        mapboxId: suggestion.mapbox_id,
      };
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Location search failed: ${error.message}`, { cause: error });
    }
    throw new Error("Location search failed: Unknown error");
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchAddressLocations(query: string, sessionToken: string): Promise<LocationLookupSuggestion[]> {
  if (!query.trim()) {
    throw new Error("Search query must not be empty");
  }

  if (process.env.E2E_MAPBOX_STUB === "true") {
    await requireUser();
    return [
      {
        name: "Paris",
        fullAddress: "Paris, France",
        mapboxId: "stub-paris-id",
        resolvedLocation: {
          name: "Paris",
          fullAddress: "Paris, France",
          placeName: "Paris, France",
          country: "France",
          countryCode: "FR",
          center: [2.3488, 48.8534],
        },
      },
    ];
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MAPBOX_ACCESS_TOKEN is not configured");
  }

  const user = await requireUser();
  assertWithinRateLimit("mapboxSearch", user.id!);

  const search = new SearchBoxCore({ accessToken: token });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await search.suggest(query, {
      sessionToken: new SessionToken(sessionToken),
      limit: 5,
      signal: controller.signal,
    });

    return response.suggestions.map((suggestion) => ({
      name: suggestion.name ?? buildPlaceName(suggestion),
      fullAddress: buildFullAddress(suggestion),
      mapboxId: suggestion.mapbox_id,
    }));
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Location search failed: ${error.message}`, { cause: error });
    }
    throw new Error("Location search failed: Unknown error");
  } finally {
    clearTimeout(timeout);
  }
}

export async function retrieveLocation(mapboxId: string, sessionToken: string): Promise<RetrievedLocation> {
  if (!mapboxId) {
    throw new Error("mapboxId is required");
  }

  if (process.env.E2E_MAPBOX_STUB === "true") {
    await requireUser();
    return {
      name: "Paris",
      fullAddress: "Paris, France",
      placeName: "Paris, France",
      country: "France",
      countryCode: "FR",
      center: [2.3488, 48.8534],
    };
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MAPBOX_ACCESS_TOKEN is not configured");
  }

  const user = await requireUser();
  assertWithinRateLimit("mapboxSearch", user.id!);

  const search = new SearchBoxCore({ accessToken: token });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await search.retrieve({ mapbox_id: mapboxId } as unknown as SearchBoxSuggestion, {
      sessionToken: new SessionToken(sessionToken),
      signal: controller.signal,
    });

    const feature = response.features[0];
    if (!feature) throw new Error("No feature returned from retrieve");
    if (!feature.geometry) throw new Error("No geometry in retrieve response");

    const props = feature.properties;
    const coords = feature.geometry.coordinates as [number, number];
    const placeName = buildPlaceName(props);
    const fullAddress = buildFullAddress(props);

    return {
      name: props.name ?? placeName,
      fullAddress,
      placeName,
      country: props.context?.country?.name ?? "",
      countryCode: props.context?.country?.country_code ?? "",
      center: coords,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Location retrieve failed: ${error.message}`, { cause: error });
    }
    throw new Error("Location retrieve failed: Unknown error");
  } finally {
    clearTimeout(timeout);
  }
}
