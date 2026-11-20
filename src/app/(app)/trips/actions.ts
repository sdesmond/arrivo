"use server";

import { requireUser } from "@/lib/auth-helpers";
import { assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { trips, collaborators, documents, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { CreateTripInput } from "@/data/types";
import { TransitMode } from "@/data/types";
import { SearchBoxCore, SessionToken } from "@mapbox/search-js-core";
import { assertWithinRateLimit } from "@/lib/rate-limit";
import type { SearchBoxAdministrativeUnitTypes, SearchBoxSuggestion } from "@mapbox/search-js-core";
import { deriveGraphicCover, detectPreferredCurrency } from "@/lib/utils";
import { isSupportedCurrencyCode, normalizeCurrencyCode } from "@/lib/currencies";
import { isTransitMode } from "@/lib/db-mappers";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { createUploadStorageName } from "@/lib/upload-policy";
import { assertValidCoverImageUrl } from "@/lib/url-policy";
import { createTripWrite } from "@/lib/membership-writes";
import { recordTripCreated } from "@/lib/trip-activity";
import { createTripSchema, parseInput } from "@/lib/validation-schemas";
import { CoverType, LiveSyncEventType } from "@/data/types";
import { publishTripEvent, publishUserEvent, purgeTripTopic } from "@/lib/trip-events";
import { buildDayRows, buildDatelessDayRow } from "./create-trip-days";
import { searchCoverImages } from "@/lib/services/cover-search";
import { saveTripListAsTemplate as saveTripListAsTemplateAction } from "./packing-actions";

const VALID_COVER_TYPES = new Set<string>(Object.values(CoverType));

function resolveBudgetCurrency(code?: string): string | undefined {
  const normalizedCode = normalizeCurrencyCode(code);
  if (!normalizedCode) {
    return undefined;
  }

  if (!isSupportedCurrencyCode(normalizedCode)) {
    throw new Error(`Invalid budget currency: ${normalizedCode}`);
  }

  return normalizedCode;
}

export async function createTrip(rawInput: CreateTripInput): Promise<{ tripId: string }> {
  const sessionUser = await requireUser();
  const input = parseInput(createTripSchema, rawInput);
  const acceptLanguage = (await headers()).get("accept-language") ?? "";

  // No upload can exist before the trip does, so only external links and built-in graphics are valid here.
  if (input.coverImageUrl) assertValidCoverImageUrl(input.coverImageUrl);

  const created = await createTripWrite(db, sessionUser.id!, (user) => {
    const userName = user.name ?? user.username;
    const preferredCurrency = user.currency ?? detectPreferredCurrency(acceptLanguage);
    const budgetCurrency = resolveBudgetCurrency(input.budgetCurrency ?? preferredCurrency);
    const resolvedTransitMode = input.transitMode ?? user.transitMode ?? TransitMode.Drive;
    const transitMode = isTransitMode(resolvedTransitMode) ? resolvedTransitMode : TransitMode.Drive;

    return {
      tripValues: {
        name: input.name,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        coverImageUrl: input.coverImageUrl ?? null,
        destinationName: input.destinationName ?? null,
        destinationCountry: input.destinationCountry ?? null,
        destinationCountryCode: input.destinationCountryCode ?? null,
        notes: input.notes ?? null,
        budgetCurrency: budgetCurrency ?? null,
        transitMode,
        budgetTotal: input.budgetTotal?.toString(),
        tags: input.tags ?? [],
      },
      collaboratorName: userName,
      buildDayRows: (newTripId) => {
        const dayRows = buildDayRows(newTripId, input.startDate, input.endDate);
        return dayRows.length > 0 ? dayRows : buildDatelessDayRow(newTripId);
      },
    };
  });
  const { tripId, ownerId: userId, ownerUsername: actorUsername } = created;

  recordTripCreated({ id: userId, username: actorUsername }, tripId);

  const hasDestination = !!input.destinationName || !!input.destinationCenter;
  let coverUrl: string | null = null;
  let coverPhotographer: string | null = null;
  let coverPhotographerUrl: string | null = null;
  try {
    if (!hasDestination) {
      coverUrl = deriveGraphicCover(input.name);
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
        coverUrl = deriveGraphicCover(input.name);
      } else if (coverType === CoverType.Map && input.destinationCenter) {
        const [lng, lat] = input.destinationCenter;
        const token = process.env.MAPBOX_ACCESS_TOKEN ?? "";
        const tileUrl = `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/${lng},${lat},10/600x400@2x?access_token=${token}`;
        const tileRes = await fetch(tileUrl);
        if (!tileRes.ok) throw new Error(`Mapbox tile fetch failed: ${tileRes.status}`);
        const tileBlob = await tileRes.blob();
        const storageName = createUploadStorageName("trip-cover", tripId, "image/jpeg");
        const tileFile = new File([tileBlob], storageName, { type: "image/jpeg" });
        coverUrl = await getStorageAdapter().put(storageName, tileFile);
      } else if (coverType === CoverType.Photo && input.destinationName) {
        const images = await searchCoverImages({ userId: sessionUser.id! }, input.destinationName);
        const firstImage = images[0];
        coverUrl = firstImage?.url ?? null;
        coverPhotographer = firstImage?.photographer ?? null;
        coverPhotographerUrl = firstImage?.photographerUrl ?? null;
      }
    }
  } catch (error) {
    console.error("Cover image fetch failed:", error);
  }

  if (coverUrl) {
    await db
      .update(trips)
      .set({
        coverImageUrl: coverUrl,
        ...(coverPhotographer && { coverPhotographer }),
        ...(coverPhotographerUrl && { coverPhotographerUrl }),
      })
      .where(eq(trips.id, tripId));
  }

  revalidatePath("/trips");
  return { tripId };
}

export async function deleteTrip(tripId: string) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "manager");

  const tripDocs = await db.select({ url: documents.url }).from(documents).where(eq(documents.tripId, tripId));
  const tripCollaborators = await db
    .select({ userId: collaborators.userId })
    .from(collaborators)
    .where(eq(collaborators.tripId, tripId));

  await db.delete(trips).where(eq(trips.id, tripId));

  publishTripEvent(tripId, { type: LiveSyncEventType.TripDeleted, tripId });
  // publishTripEvent above reaches anyone with the trip page open (useTripLiveRefresh). Collaborators
  // without that page open — e.g. watching their dashboard — only hold their personal channel, so
  // each one (other than the acting manager, who is already navigating away client-side) needs its
  // own push too, mirroring the removedUserIds loop in the sharing service's saveContributorChanges.
  for (const collaborator of tripCollaborators) {
    if (collaborator.userId && collaborator.userId !== user.id) {
      publishUserEvent(collaborator.userId, { type: LiveSyncEventType.TripDeleted, tripId });
    }
  }
  purgeTripTopic(tripId);

  const urlsToCleanup = tripDocs.map((doc) => doc.url).filter((url): url is string => !!url);
  if (urlsToCleanup.length > 0) {
    await Promise.all(
      urlsToCleanup.map((url) =>
        getStorageAdapter()
          .del(url)
          .catch((error) => console.warn(`Cleanup failed for ${url}`, error))
      )
    );
  }

  revalidatePath("/trips");
}

export async function saveTripListAsTemplate(
  tripId: string,
  name: string,
  idempotencyKey?: string
): Promise<import("@/data/types").SaveTripAsTemplateResult> {
  return saveTripListAsTemplateAction(tripId, name, idempotencyKey);
}

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
