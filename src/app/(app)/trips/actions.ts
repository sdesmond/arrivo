"use server";

import { requireUser } from "@/lib/auth-helpers";
import { assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import {
  trips,
  collaborators,
  packingItems,
  documents,
  days,
  events,
  itineraryNotes,
  itineraryChecklists,
  users,
} from "@/db/schema";
import { and, asc, eq, gt, inArray, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  CreateTripInput,
  UpdateTripPatch,
  AddCollaboratorInput,
  AddPackingItemInput,
  UpdatePackingItemInput,
  TripDateChangeConfirmation,
  TripDateConflictResolution,
  UpdateTripMetadataResult,
} from "@/data/types";
import { SearchBoxCore, SessionToken } from "@mapbox/search-js-core";
import type { SearchBoxAdministrativeUnitTypes, SearchBoxSuggestion } from "@mapbox/search-js-core";
import { deriveGraphicCover } from "@/lib/utils";
import { CoverType } from "@/data/types";
import { buildDayRows } from "./create-trip-days";
import { buildTripDateChangeConfirmation, buildTripDateSyncPlan, resolveTripDateRange } from "./date-sync";
import { searchCoverImages } from "./cover-image-search-actions";

const DAY_NUMBER_TEMP_OFFSET = 1000;
const VALID_COVER_TYPES = new Set<string>(Object.values(CoverType));

interface RemovedDayContentSummary {
  confirmation: TripDateChangeConfirmation;
  events: {
    id: string;
    name: string;
    dayId: string;
    displacedDate?: string;
    position: number;
  }[];
  eventDocumentUrls: string[];
  requiresConfirmation: boolean;
}

async function summarizeRemovedDayContent(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  removedDays: (typeof days.$inferSelect)[]
): Promise<RemovedDayContentSummary> {
  const removedDayIds = removedDays.map((day) => day.id);
  const removedDateByDayId = new Map(removedDays.map((day) => [day.id, day.date ?? undefined]));
  const removedDateOrder = new Map(removedDays.map((day, index) => [day.id, index]));

  const removedEvents =
    removedDayIds.length === 0
      ? []
      : await transaction
          .select({
            id: events.id,
            name: events.name,
            dayId: events.dayId,
            position: events.position,
          })
          .from(events)
          .where(inArray(events.dayId, removedDayIds));

  const eventIds = removedEvents.map((event) => event.id);
  const eventDocs =
    eventIds.length === 0
      ? []
      : await transaction
          .select({
            eventId: documents.eventId,
            url: documents.url,
          })
          .from(documents)
          .where(inArray(documents.eventId, eventIds));

  const dayNotes =
    removedDayIds.length === 0
      ? []
      : await transaction
          .select({ id: itineraryNotes.id })
          .from(itineraryNotes)
          .where(inArray(itineraryNotes.dayId, removedDayIds));

  const dayChecklists =
    removedDayIds.length === 0
      ? []
      : await transaction
          .select({ id: itineraryChecklists.id })
          .from(itineraryChecklists)
          .where(inArray(itineraryChecklists.dayId, removedDayIds));

  const docCountByEventId = new Map<string, number>();
  for (const eventDoc of eventDocs) {
    if (!eventDoc.eventId) continue;
    docCountByEventId.set(eventDoc.eventId, (docCountByEventId.get(eventDoc.eventId) ?? 0) + 1);
  }

  const previewEvents = removedEvents
    .filter((event) => !!event.dayId)
    .map((event) => ({
      id: event.id,
      name: event.name,
      displacedDate: event.dayId ? removedDateByDayId.get(event.dayId) : undefined,
      docCount: docCountByEventId.get(event.id) ?? 0,
    }))
    .sort((first, second) => {
      const firstOrder = removedDays.findIndex((day) => day.date === first.displacedDate);
      const secondOrder = removedDays.findIndex((day) => day.date === second.displacedDate);
      if (firstOrder !== secondOrder) return firstOrder - secondOrder;
      return first.name.localeCompare(second.name);
    });

  return {
    confirmation: buildTripDateChangeConfirmation(
      removedDays.map((day) => day.date!).filter(Boolean),
      previewEvents,
      dayNotes.length,
      dayChecklists.length,
      eventDocs.length
    ),
    events: removedEvents
      .filter((event): event is { id: string; name: string; dayId: string; position: number } => !!event.dayId)
      .map((event) => ({
        id: event.id,
        name: event.name,
        dayId: event.dayId,
        displacedDate: removedDateByDayId.get(event.dayId),
        position: event.position,
      }))
      .sort((first, second) => {
        const firstOrder = removedDateOrder.get(first.dayId) ?? 0;
        const secondOrder = removedDateOrder.get(second.dayId) ?? 0;
        if (firstOrder !== secondOrder) return firstOrder - secondOrder;
        return first.position - second.position;
      }),
    eventDocumentUrls: eventDocs.map((eventDoc) => eventDoc.url).filter((url): url is string => !!url),
    requiresConfirmation: removedEvents.length > 0 || dayNotes.length > 0 || dayChecklists.length > 0,
  };
}

export async function createTrip(input: CreateTripInput) {
  const user = await requireUser();
  let tripId = "";
  await db.transaction(async (tx) => {
    const [trip] = await tx
      .insert(trips)
      .values({
        ownerId: user.id!,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        coverImageUrl: input.coverImageUrl,
        destinationName: input.destinationName,
        destinationCountry: input.destinationCountry,
        destinationCountryCode: input.destinationCountryCode,
        notes: input.notes,
        budgetCurrency: input.budgetCurrency,
        budgetTotal: input.budgetTotal?.toString(),
        budgetPerPerson: input.budgetPerPerson?.toString(),
        tags: input.tags ?? [],
      })
      .returning();
    tripId = trip.id;
    await tx.insert(collaborators).values({
      tripId: trip.id,
      userId: user.id!,
      email: user.email!,
      name: user.name ?? user.email!,
      initials: (user.name ?? user.email!).slice(0, 2).toUpperCase(),
      role: "owner",
    });
    const dayRows = buildDayRows(trip.id, input.startDate, input.endDate);
    if (dayRows.length > 0) {
      await tx.insert(days).values(dayRows);
    }
  });

  const hasDestination = !!input.destinationName || !!input.destinationCenter;
  let coverUrl: string | null = null;
  try {
    if (!hasDestination) {
      coverUrl = deriveGraphicCover(input.name);
    } else {
      const [userRow] = await db
        .select({ defaultCoverType: users.defaultCoverType })
        .from(users)
        .where(eq(users.id, user.id!));
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
        if (process.env.UPLOAD_STUB === "true") {
          coverUrl = null;
        } else {
          const tileRes = await fetch(tileUrl);
          if (!tileRes.ok) throw new Error(`Mapbox tile fetch failed: ${tileRes.status}`);
          const tileBlob = await tileRes.blob();
          const { put } = await import("@vercel/blob");
          const result = await put(`mapbox-covers/${tripId}.jpg`, tileBlob, { access: "public" });
          coverUrl = result.url;
        }
      } else if (coverType === CoverType.Photo && input.destinationName) {
        const images = await searchCoverImages(input.destinationName);
        coverUrl = images[0]?.url ?? null;
      }
    }
  } catch (error) {
    console.error("Cover image fetch failed:", error);
  }

  if (coverUrl) {
    await db.update(trips).set({ coverImageUrl: coverUrl }).where(eq(trips.id, tripId));
  }

  revalidatePath("/trips");
  redirect(`/trips/${tripId}?new=1`);
}

export async function updateTripMetadata(
  tripId: string,
  patch: UpdateTripPatch,
  resolution?: TripDateConflictResolution,
  expectedConfirmation?: TripDateChangeConfirmation
): Promise<UpdateTripMetadataResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  let eventDocumentUrlsToCleanup: string[] = [];
  let confirmation: TripDateChangeConfirmation | null = null;

  await db.transaction(async (transaction) => {
    const [trip] = await transaction.select().from(trips).where(eq(trips.id, tripId));
    if (!trip) {
      throw new Error("Trip not found.");
    }

    const existingDays = await transaction
      .select()
      .from(days)
      .where(eq(days.tripId, tripId))
      .orderBy(asc(days.dayNumber));
    if (existingDays.some((day) => !day.date)) {
      throw new Error("Unable to update trip dates because one or more scheduled days are missing dates.");
    }

    const desiredRange = resolveTripDateRange(
      {
        startDate: trip.startDate ?? undefined,
        endDate: trip.endDate ?? undefined,
      },
      patch
    );
    const desiredDayRows = buildDayRows(tripId, desiredRange.startDate, desiredRange.endDate);
    const currentDates = existingDays.map((day) => day.date!).filter(Boolean);
    const syncPlan = buildTripDateSyncPlan(
      currentDates,
      desiredDayRows.map((day) => day.date!)
    );
    const desiredDateSet = new Set(syncPlan.desiredDates);
    const currentDayByDate = new Map(existingDays.map((day) => [day.date!, day]));
    const removedDays = existingDays.filter((day) => syncPlan.removedDates.includes(day.date!));
    const survivingDays = existingDays.filter((day) => desiredDateSet.has(day.date!));
    const removedContent = await summarizeRemovedDayContent(transaction, removedDays);

    if (removedContent.requiresConfirmation && !resolution) {
      confirmation = removedContent.confirmation;
      return;
    }

    if (
      resolution &&
      expectedConfirmation &&
      JSON.stringify(removedContent.confirmation) !== JSON.stringify(expectedConfirmation)
    ) {
      throw new Error("Trip dates changed before this confirmation was applied. Review the date change again.");
    }

    if (resolution === "keep-as-unscheduled") {
      for (const event of removedContent.events) {
        await transaction
          .update(events)
          .set({
            dayId: null,
            displacedDate: event.displacedDate ?? null,
            updatedAt: new Date(),
          })
          .where(eq(events.id, event.id));
      }
    }

    if (resolution === "delete-events" && removedContent.events.length > 0) {
      eventDocumentUrlsToCleanup = removedContent.eventDocumentUrls;
      await transaction.delete(events).where(
        inArray(
          events.id,
          removedContent.events.map((event) => event.id)
        )
      );
    }

    if (removedDays.length > 0) {
      await transaction.delete(days).where(
        inArray(
          days.id,
          removedDays.map((day) => day.id)
        )
      );
    }

    for (const day of survivingDays) {
      await transaction
        .update(days)
        .set({
          dayNumber: day.dayNumber + DAY_NUMBER_TEMP_OFFSET,
          label: `Temp Day ${day.dayNumber}`,
        })
        .where(eq(days.id, day.id));
    }

    const addedDayRows = desiredDayRows.filter((day) => syncPlan.addedDates.includes(day.date!));
    if (addedDayRows.length > 0) {
      await transaction.insert(days).values(addedDayRows);
    }

    for (let index = 0; index < desiredDayRows.length; index++) {
      const desiredDay = desiredDayRows[index];
      const existingDay = currentDayByDate.get(desiredDay.date!);
      if (!existingDay || syncPlan.removedDates.includes(desiredDay.date!)) {
        continue;
      }

      await transaction
        .update(days)
        .set({
          dayNumber: index + 1,
          label: `Day ${index + 1}`,
        })
        .where(eq(days.id, existingDay.id));
    }

    await transaction
      .update(trips)
      .set({
        name: patch.name,
        startDate: desiredDayRows[0]?.date ?? null,
        endDate: desiredDayRows.at(-1)?.date ?? null,
        coverImageUrl: patch.coverImageUrl,
        destinationName: patch.destinationName,
        destinationCountry: patch.destinationCountry,
        destinationCountryCode: patch.destinationCountryCode,
        notes: patch.notes,
        budgetCurrency: patch.budgetCurrency,
        budgetTotal: patch.budgetTotal?.toString(),
        budgetPerPerson: patch.budgetPerPerson?.toString(),
        tags: patch.tags,
        updatedAt: new Date(),
      })
      .where(eq(trips.id, tripId));
  });

  if (confirmation) {
    return { status: "confirmation-required", confirmation };
  }

  if (eventDocumentUrlsToCleanup.length > 0 && process.env.UPLOAD_STUB !== "true") {
    try {
      const { del } = await import("@vercel/blob");
      await Promise.all(
        eventDocumentUrlsToCleanup.map((url) =>
          del(url).catch((error) => console.warn(`Blob cleanup failed for ${url}`, error))
        )
      );
    } catch (error) {
      console.warn("Blob cleanup import failed after trip date update", error);
    }
  }

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return { status: "saved" };
}

export async function deleteTrip(tripId: string) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "owner");

  const tripDocs = await db.select({ url: documents.url }).from(documents).where(eq(documents.tripId, tripId));

  await db.delete(trips).where(eq(trips.id, tripId));

  const urlsToCleanup = tripDocs.map((doc) => doc.url).filter((url): url is string => !!url);
  if (urlsToCleanup.length > 0 && process.env.UPLOAD_STUB !== "true") {
    const { del } = await import("@vercel/blob");
    await Promise.all(
      urlsToCleanup.map((url) => del(url).catch((err) => console.warn(`Blob cleanup failed for ${url}`, err)))
    );
  }

  revalidatePath("/trips");
}

export async function addCollaborator(tripId: string, input: AddCollaboratorInput) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "owner");
  await db
    .insert(collaborators)
    .values({
      tripId,
      email: input.email,
      name: input.name,
      initials: input.initials,
      role: input.role,
      tintBg: input.tintBg,
      tintFg: input.tintFg,
    })
    .onConflictDoNothing();
  revalidatePath(`/trips/${tripId}`);
}

export async function removeCollaborator(collabId: string) {
  const user = await requireUser();
  const [collab] = await db.select().from(collaborators).where(eq(collaborators.id, collabId));
  if (!collab) return;
  await assertTripAccess(collab.tripId, user.id!, "owner");
  await db.delete(collaborators).where(eq(collaborators.id, collabId));
  revalidatePath(`/trips/${collab.tripId}`);
}

export async function updateCollaboratorRole(collabId: string, role: "editor" | "viewer") {
  const user = await requireUser();
  const [collab] = await db.select().from(collaborators).where(eq(collaborators.id, collabId));
  if (!collab) return;
  await assertTripAccess(collab.tripId, user.id!, "owner");
  await db.update(collaborators).set({ role }).where(eq(collaborators.id, collabId));
  revalidatePath(`/trips/${collab.tripId}`);
}

function normalizePackingItemName(name: string | undefined): string {
  const trimmedName = name?.trim() ?? "";
  if (!trimmedName) {
    throw new Error("Packing item name is required");
  }
  return trimmedName;
}

export async function addPackingItem(tripId: string, input: AddPackingItemInput) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  const name = normalizePackingItemName(input.name);
  // A label belongs to no section; otherwise membership is explicit via labelId.
  const labelId = input.isLabel ? null : (input.labelId ?? null);

  if (input.afterItemId) {
    const afterItemId = input.afterItemId;
    await db.transaction(async (tx) => {
      const [targetItem] = await tx
        .select()
        .from(packingItems)
        .where(and(eq(packingItems.id, afterItemId), eq(packingItems.tripId, tripId)));
      if (!targetItem) throw new Error("Target item not found");

      await tx
        .update(packingItems)
        .set({ position: sql`${packingItems.position} + 1` })
        .where(and(eq(packingItems.tripId, tripId), gt(packingItems.position, targetItem.position)));
      await tx.insert(packingItems).values({
        tripId,
        name,
        done: false,
        isLabel: input.isLabel ?? false,
        position: targetItem.position + 1,
        labelId,
      });
    });
  } else if (input.beforeItemId) {
    const beforeItemId = input.beforeItemId;
    await db.transaction(async (tx) => {
      const [targetItem] = await tx
        .select()
        .from(packingItems)
        .where(and(eq(packingItems.id, beforeItemId), eq(packingItems.tripId, tripId)));
      if (!targetItem) throw new Error("Target item not found");

      await tx
        .update(packingItems)
        .set({ position: sql`${packingItems.position} + 1` })
        .where(and(eq(packingItems.tripId, tripId), gt(packingItems.position, targetItem.position - 1)));
      await tx.insert(packingItems).values({
        tripId,
        name,
        done: false,
        isLabel: input.isLabel ?? false,
        position: targetItem.position,
        labelId,
      });
    });
  } else {
    const [{ maxPos }] = await db
      .select({ maxPos: max(packingItems.position) })
      .from(packingItems)
      .where(eq(packingItems.tripId, tripId));
    // Quick-add with no explicit section (AC4): append ungrouped at the bottom.
    await db.insert(packingItems).values({
      tripId,
      name,
      done: false,
      isLabel: input.isLabel ?? false,
      position: (maxPos ?? -1) + 1,
      labelId,
    });
  }

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
}

export async function updatePackingItem(itemId: string, input: UpdatePackingItemInput): Promise<void> {
  const user = await requireUser();
  const name = normalizePackingItemName(input.name);
  const [item] = await db.select({ tripId: packingItems.tripId }).from(packingItems).where(eq(packingItems.id, itemId));
  if (!item) throw new Error("Packing item not found");
  await assertTripAccess(item.tripId, user.id!, "editor");
  await db.update(packingItems).set({ name }).where(eq(packingItems.id, itemId));
  revalidatePath(`/trips/${item.tripId}`);
  revalidatePath("/trips");
}

export async function togglePackingItem(itemId: string) {
  const user = await requireUser();
  const [item] = await db.select().from(packingItems).where(eq(packingItems.id, itemId));
  if (!item) return;
  await assertTripAccess(item.tripId, user.id!, "editor");
  await db.update(packingItems).set({ done: !item.done }).where(eq(packingItems.id, itemId));
  revalidatePath(`/trips/${item.tripId}`);
  revalidatePath("/trips");
}

export async function removePackingItem(itemId: string) {
  const user = await requireUser();
  const [item] = await db.select().from(packingItems).where(eq(packingItems.id, itemId));
  if (!item) return;
  await assertTripAccess(item.tripId, user.id!, "editor");
  await db.delete(packingItems).where(eq(packingItems.id, itemId));
  revalidatePath(`/trips/${item.tripId}`);
  revalidatePath("/trips");
}

export async function reorderPackingItems(
  tripId: string,
  ordered: { id: string; labelId: string | null; position: number }[]
): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  if (ordered.length === 0) return;
  await db.transaction(async (tx) => {
    for (const entry of ordered) {
      await tx
        .update(packingItems)
        .set({ position: entry.position, labelId: entry.labelId })
        .where(and(eq(packingItems.id, entry.id), eq(packingItems.tripId, tripId)));
    }
  });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
}

export interface LocationSuggestion {
  placeName: string;
  country: string;
  countryCode: string;
  mapboxId: string;
}

export interface RetrievedLocation {
  placeName: string;
  country: string;
  countryCode: string;
  center: [number, number];
}

const LOCATION_TYPES: SearchBoxAdministrativeUnitTypes[] = ["place", "locality", "neighborhood", "region", "country"];

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

  await requireUser();

  const search = new SearchBoxCore({ accessToken: token });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await search.suggest(query, {
      sessionToken: new SessionToken(sessionToken),
      types: new Set(LOCATION_TYPES),
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

export async function retrieveLocation(mapboxId: string, sessionToken: string): Promise<RetrievedLocation> {
  if (!mapboxId) {
    throw new Error("mapboxId is required");
  }

  if (process.env.E2E_MAPBOX_STUB === "true") {
    await requireUser();
    return {
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

  await requireUser();

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

    return {
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
