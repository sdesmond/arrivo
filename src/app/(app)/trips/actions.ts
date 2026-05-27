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
} from "@/db/schema";
import { asc, eq, inArray, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  CreateTripInput,
  UpdateTripPatch,
  AddCollaboratorInput,
  AddPackingItemInput,
  TripDateChangeConfirmation,
  TripDateConflictResolution,
  UpdateTripMetadataResult,
} from "@/data/types";
import { buildDayRows } from "./create-trip-days";
import { buildTripDateChangeConfirmation, buildTripDateSyncPlan, resolveTripDateRange } from "./date-sync";

const DAY_NUMBER_TEMP_OFFSET = 1000;

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

  const urlsToCleanup = tripDocs.map((d) => d.url).filter((u): u is string => !!u);
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

export async function addPackingItem(tripId: string, input: AddPackingItemInput) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  const [{ maxPos }] = await db
    .select({ maxPos: max(packingItems.position) })
    .from(packingItems)
    .where(eq(packingItems.tripId, tripId));
  await db.insert(packingItems).values({
    tripId,
    name: input.name,
    done: false,
    position: (maxPos ?? -1) + 1,
  });
  revalidatePath(`/trips/${tripId}`);
}

export async function togglePackingItem(itemId: string) {
  const user = await requireUser();
  const [item] = await db.select().from(packingItems).where(eq(packingItems.id, itemId));
  if (!item) return;
  await assertTripAccess(item.tripId, user.id!, "editor");
  await db.update(packingItems).set({ done: !item.done }).where(eq(packingItems.id, itemId));
  revalidatePath(`/trips/${item.tripId}`);
}

export async function removePackingItem(itemId: string) {
  const user = await requireUser();
  const [item] = await db.select().from(packingItems).where(eq(packingItems.id, itemId));
  if (!item) return;
  await assertTripAccess(item.tripId, user.id!, "editor");
  await db.delete(packingItems).where(eq(packingItems.id, itemId));
  revalidatePath(`/trips/${item.tripId}`);
}

interface LocationSuggestion {
  placeName: string;
  country: string;
  countryCode: string;
  center: [number, number];
}

interface MapboxGeocodingResponse {
  features: Array<{
    properties: {
      name: string;
      place_formatted: string;
      full_address?: string;
      coordinates: {
        longitude: number;
        latitude: number;
      };
      context?: {
        country?: {
          name: string;
          country_code: string;
        };
      };
    };
  }>;
}

interface CoverImageResult {
  id: string;
  url: string;
  photographer: string;
  alt: string;
}

interface UnsplashSearchResponse {
  results: Array<{
    id: string;
    urls: {
      regular: string;
    };
    user: {
      name: string;
    };
    alt_description: string | null;
    description: string | null;
  }>;
}

export async function searchLocations(query: string): Promise<LocationSuggestion[]> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MAPBOX_ACCESS_TOKEN is not configured");
  }

  if (!query.trim()) {
    throw new Error("Search query must not be empty");
  }

  await requireUser();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodedQuery}&access_token=${token}&limit=5&types=place,locality,neighborhood`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      throw new Error(`Mapbox geocoding error: ${response.status}`);
    }

    const data = (await response.json()) as MapboxGeocodingResponse;
    return data.features.map((feature) => {
      const props = feature.properties;
      const placeName =
        props.full_address ??
        (props.name && props.place_formatted
          ? `${props.name}, ${props.place_formatted}`
          : (props.name ?? props.place_formatted ?? ""));
      return {
        placeName,
        country: props.context?.country?.name ?? "",
        countryCode: props.context?.country?.country_code ?? "",
        center: props.coordinates
          ? ([props.coordinates.longitude, props.coordinates.latitude] as [number, number])
          : [0, 0],
      };
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Mapbox geocoding request failed: ${error.message}`, { cause: error });
    }
    throw new Error("Mapbox geocoding request failed: Unknown error");
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchCoverImages(query: string): Promise<CoverImageResult[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    throw new Error("UNSPLASH_ACCESS_KEY is not configured");
  }

  if (!query.trim()) {
    throw new Error("Search query must not be empty");
  }

  await requireUser();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodedQuery}+travel&orientation=landscape&per_page=19`,
      {
        signal: controller.signal,
        headers: {
          Authorization: `Client-ID ${key}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Unsplash search error: ${response.status}`);
    }

    const data = (await response.json()) as UnsplashSearchResponse;
    return data.results.map((result) => ({
      id: result.id,
      url: result.urls.regular,
      photographer: result.user.name,
      alt: result.alt_description ?? result.description ?? "",
    }));
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Unsplash search request failed: ${error.message}`, { cause: error });
    }
    throw new Error("Unsplash search request failed: Unknown error");
  } finally {
    clearTimeout(timeout);
  }
}
