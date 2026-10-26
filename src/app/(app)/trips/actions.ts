"use server";

import { requireUser } from "@/lib/auth-helpers";
import { assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import {
  trips,
  collaborators,
  documents,
  days,
  events,
  expenses,
  itineraryNotes,
  itineraryChecklists,
  reservations,
  users,
  invitations,
} from "@/db/schema";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type {
  AcceptInvitationResult,
  ContributorChange,
  CreateTripInput,
  UpdateTripPatch,
  DeclineInvitationResult,
  DismissInvitationResult,
  InviteContributorResult,
  LeaveTripResult,
  RescindInvitationResult,
  SaveContributorChangesResult,
  ReservationType,
  TripDateChangeConfirmation,
  TripDateChangePreviewReservation,
  UpdateTripMetadataResult,
} from "@/data/types";
import { CollaboratorRole, TransitMode, TripDateConflictResolution } from "@/data/types";
import { SearchBoxCore, SessionToken } from "@mapbox/search-js-core";
import type { SearchBoxAdministrativeUnitTypes, SearchBoxSuggestion } from "@mapbox/search-js-core";
import { deriveGraphicCover, detectPreferredCurrency, stableStringify, toLocalDateKey } from "@/lib/utils";
import { isSupportedCurrencyCode, normalizeCurrencyCode } from "@/lib/currencies";
import { recalculateAll } from "@/lib/currency";
import { dbExpenseToType, isTransitMode } from "@/lib/db-mappers";
import { type DbTransaction, lockTripForUpdate, TRIP_NOT_FOUND_MESSAGE } from "@/lib/server-action-locks";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { createUploadStorageName } from "@/lib/upload-policy";
import {
  applyInvitationResend,
  getInvitationExpiry,
  hasNormalizedUsername,
  publishInvitationChanged,
} from "@/lib/invitations";
import { isUniqueViolation } from "@/lib/error-utils";
import { recordTripCreated, recordTripUpdated, recordTripInvitation } from "@/lib/trip-activity";
import { normalizeUsername } from "@/lib/username";
import { CoverType, LiveSyncEventType } from "@/data/types";
import { publishTripEvent, publishUserEvent, purgeTripTopic, removeTripSubscribersForUser } from "@/lib/trip-events";
import { buildDayRows, buildDatelessDayRow } from "./create-trip-days";
import { buildTripDateChangeConfirmation, buildTripDateSyncPlan, resolveTripDateRange } from "./date-sync";
import { searchCoverImages } from "./cover-image-search-actions";
import {
  addPackingItem as addPackingItemAction,
  pullTemplatesOntoTrip as pullTemplatesOntoTripAction,
  removePackingItem as removePackingItemAction,
  reorderPackingItems as reorderPackingItemsAction,
  saveTripListAsTemplate as saveTripListAsTemplateAction,
  togglePackingItem as togglePackingItemAction,
  updatePackingItem as updatePackingItemAction,
} from "./packing-actions";

const DAY_NUMBER_TEMP_OFFSET = 1000;
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

function resolveTripTransitMode(transitMode: TransitMode | null | undefined): TransitMode | null | undefined {
  if (transitMode === undefined || transitMode === null) {
    return transitMode;
  }

  if (!isTransitMode(transitMode)) {
    throw new Error(`Invalid transit mode: ${transitMode}`);
  }

  return transitMode;
}

/**
 * Recalculates Trip-Currency conversions for mismatched expenses and persists
 * the results within the caller's transaction, so a fetch failure rolls back
 * the trip currency change alongside it (no partial state).
 */
async function convertMismatchedExpenses(
  transaction: DbTransaction,
  tripId: string,
  budgetCurrency: string
): Promise<void> {
  const expenseRows = await transaction.select().from(expenses).where(eq(expenses.tripId, tripId));
  const tripExpenses = expenseRows.map(dbExpenseToType);
  const conversionResults = await recalculateAll(tripExpenses, budgetCurrency);

  await Promise.all(
    conversionResults.map((result) =>
      transaction
        .update(expenses)
        .set({
          convertedAmountTrip: result.convertedAmount.toString(),
          conversionRateTrip: result.rate.toString(),
          convertedCurrencyTrip: budgetCurrency,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, result.expenseId))
    )
  );
}

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
  reservationIds: string[];
  reservationDocumentUrls: string[];
  requiresConfirmation: boolean;
}

async function summarizeRemovedDayContent(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tripId: string,
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

  const removedDateSet = new Set(removedDays.map((day) => day.date).filter((date): date is string => !!date));
  const tripReservations =
    removedDateSet.size === 0
      ? []
      : await transaction
          .select({
            id: reservations.id,
            provider: reservations.provider,
            type: reservations.type,
            startAt: reservations.startAt,
            endAt: reservations.endAt,
          })
          .from(reservations)
          .where(eq(reservations.tripId, tripId));
  const sortedRemovedDates = [...removedDateSet].sort();
  const affectedReservations: TripDateChangePreviewReservation[] = [];
  for (const reservation of tripReservations) {
    const dateKeys = [reservation.startAt, reservation.endAt]
      .filter((value): value is Date => !!value)
      .map((value) => toLocalDateKey(value.toISOString()))
      .sort();
    if (dateKeys.length === 0) continue;
    const firstKey = dateKeys[0];
    const lastKey = dateKeys[dateKeys.length - 1];
    // A reservation overlaps a removed day when that day sits anywhere in [start, end], not just on an endpoint.
    const affectedDate = sortedRemovedDates.find((date) => date >= firstKey && date <= lastKey);
    if (affectedDate) {
      affectedReservations.push({
        id: reservation.id,
        provider: reservation.provider,
        type: reservation.type as ReservationType,
        date: affectedDate,
      });
    }
  }
  const affectedReservationIds = affectedReservations.map((reservation) => reservation.id);
  const reservationDocs =
    affectedReservationIds.length === 0
      ? []
      : await transaction
          .select({ eventId: documents.eventId, url: documents.url })
          .from(documents)
          .where(inArray(documents.reservationId, affectedReservationIds));
  affectedReservations.sort((first, second) => first.date.localeCompare(second.date));

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
      removedDays.some((day) => !day.date) ? removedDays.map((day) => day.label) : undefined,
      previewEvents,
      dayNotes.length,
      dayChecklists.length,
      eventDocs.length,
      affectedReservations
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
    reservationIds: affectedReservationIds,
    reservationDocumentUrls: reservationDocs.map((doc) => doc.url).filter((url): url is string => !!url),
    requiresConfirmation:
      removedEvents.length > 0 || dayNotes.length > 0 || dayChecklists.length > 0 || affectedReservations.length > 0,
  };
}

export async function createTrip(input: CreateTripInput): Promise<{ tripId: string }> {
  const sessionUser = await requireUser();
  const acceptLanguage = (await headers()).get("accept-language") ?? "";

  if (input.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    throw new Error("Invalid start date format. Expected YYYY-MM-DD.");
  }
  if (input.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    throw new Error("Invalid end date format. Expected YYYY-MM-DD.");
  }

  let tripId = "";
  let userId = "";
  let actorUsername = "";
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        currency: users.currency,
        transitMode: users.transitMode,
      })
      .from(users)
      .where(eq(users.id, sessionUser.id!))
      .for("update");

    if (!user?.id) {
      throw new Error("Signed-in user could not be resolved before trip creation.");
    }
    userId = user.id;
    actorUsername = user.username;
    const userName = user.name ?? user.username;
    const preferredCurrency = user.currency ?? detectPreferredCurrency(acceptLanguage);
    const budgetCurrency = resolveBudgetCurrency(input.budgetCurrency ?? preferredCurrency);
    const resolvedTransitMode = input.transitMode ?? user.transitMode ?? TransitMode.Drive;
    const transitMode = isTransitMode(resolvedTransitMode) ? resolvedTransitMode : TransitMode.Drive;

    const [trip] = await tx
      .insert(trips)
      .values({
        ownerId: userId,
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
      })
      .returning();
    tripId = trip.id;
    await tx.insert(collaborators).values({
      tripId: trip.id,
      userId,
      name: userName,
      initials: userName.slice(0, 2).toUpperCase(),
      role: "manager",
      isCreator: true,
    });
    const dayRows = buildDayRows(trip.id, input.startDate, input.endDate);
    if (dayRows.length > 0) {
      await tx.insert(days).values(dayRows);
    } else {
      await tx.insert(days).values(buildDatelessDayRow(trip.id));
    }
  });

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
        const images = await searchCoverImages(input.destinationName);
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

export async function updateTripMetadata(
  tripId: string,
  patch: UpdateTripPatch,
  resolution?: TripDateConflictResolution,
  expectedConfirmation?: TripDateChangeConfirmation,
  convertCurrency?: boolean
): Promise<UpdateTripMetadataResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  const budgetCurrency = resolveBudgetCurrency(patch.budgetCurrency);
  const resolvedTransitMode = resolveTripTransitMode(patch.transitMode);
  const shouldConvertCurrency = !!convertCurrency && !!budgetCurrency;

  let eventDocumentUrlsToCleanup: string[] = [];
  let confirmation: TripDateChangeConfirmation | null = null;

  await db.transaction(async (transaction) => {
    await lockTripForUpdate(transaction, tripId);

    const [trip] = await transaction.select().from(trips).where(eq(trips.id, tripId));
    if (!trip) {
      throw new Error("Trip not found.");
    }

    const existingDays = await transaction
      .select()
      .from(days)
      .where(eq(days.tripId, tripId))
      .orderBy(asc(days.dayNumber));

    if (existingDays.length === 0) {
      throw new Error("Trip has no day rows — invariant violated.");
    }

    const isCurrentlyDateless = existingDays.length > 0 && existingDays.every((day) => !day.date);
    const isClearingDates = patch.startDate === null;

    const desiredRange = resolveTripDateRange(
      {
        startDate: trip.startDate ?? undefined,
        endDate: trip.endDate ?? undefined,
      },
      patch
    );
    const desiredDayRows = buildDayRows(tripId, desiredRange.startDate, desiredRange.endDate);

    function buildTripUpdatePayload(startDate: string | null, endDate: string | null) {
      return {
        name: patch.name,
        startDate,
        endDate,
        coverImageUrl: patch.coverImageUrl,
        destinationName: patch.destinationName,
        destinationCountry: patch.destinationCountry,
        destinationCountryCode: patch.destinationCountryCode,
        notes: patch.notes,
        budgetCurrency,
        budgetTotal: patch.budgetTotal?.toString(),
        tags: patch.tags,
        transitMode: resolvedTransitMode,
        updatedAt: new Date(),
      };
    }

    // ── dated → dateless: null out day dates, preserve rows ──────────────────
    if (!isCurrentlyDateless && isClearingDates) {
      await transaction
        .update(days)
        .set({ date: null })
        .where(
          inArray(
            days.id,
            existingDays.map((day) => day.id)
          )
        );
      if (shouldConvertCurrency) {
        await convertMismatchedExpenses(transaction, tripId, budgetCurrency!);
      }
      await transaction.update(trips).set(buildTripUpdatePayload(null, null)).where(eq(trips.id, tripId));
      return;
    }

    // ── dateless → dated: map existing days to new dates ─────────────────────
    if (isCurrentlyDateless && desiredRange.startDate) {
      const mappedDays = existingDays.slice(0, desiredDayRows.length);
      const overflowDays = existingDays.slice(desiredDayRows.length);
      const overflowContent = await summarizeRemovedDayContent(transaction, tripId, overflowDays);

      if (overflowContent.requiresConfirmation && !resolution) {
        confirmation = overflowContent.confirmation;
        return;
      }

      if (
        resolution &&
        expectedConfirmation &&
        stableStringify(overflowContent.confirmation) !== stableStringify(expectedConfirmation)
      ) {
        throw new Error("Trip dates changed before this confirmation was applied. Review the date change again.");
      }

      if (resolution === "keep-as-unscheduled") {
        for (const event of overflowContent.events) {
          await transaction
            .update(events)
            .set({ dayId: null, displacedDate: event.displacedDate ?? null, updatedAt: new Date() })
            .where(eq(events.id, event.id));
        }
      }

      if (resolution === "delete-events" && overflowContent.events.length > 0) {
        eventDocumentUrlsToCleanup = overflowContent.eventDocumentUrls;
        await transaction.delete(events).where(
          inArray(
            events.id,
            overflowContent.events.map((event) => event.id)
          )
        );
      }

      if (overflowDays.length > 0) {
        await transaction.delete(days).where(
          inArray(
            days.id,
            overflowDays.map((day) => day.id)
          )
        );
      }

      for (let index = 0; index < mappedDays.length; index++) {
        await transaction
          .update(days)
          .set({ dayNumber: index + 1, date: desiredDayRows[index].date, label: `Day ${index + 1}` })
          .where(eq(days.id, mappedDays[index].id));
      }

      const appendedDayRows = desiredDayRows.slice(mappedDays.length);
      if (appendedDayRows.length > 0) {
        await transaction.insert(days).values(appendedDayRows);
      }

      if (shouldConvertCurrency) {
        await convertMismatchedExpenses(transaction, tripId, budgetCurrency!);
      }
      await transaction
        .update(trips)
        .set(buildTripUpdatePayload(desiredDayRows[0]?.date ?? null, desiredDayRows.at(-1)?.date ?? null))
        .where(eq(trips.id, tripId));
      return;
    }

    // ── dateless → dateless no-op (metadata-only edit) ──────────────────────
    if (isCurrentlyDateless && !desiredRange.startDate) {
      if (shouldConvertCurrency) {
        await convertMismatchedExpenses(transaction, tripId, budgetCurrency!);
      }
      await transaction.update(trips).set(buildTripUpdatePayload(null, null)).where(eq(trips.id, tripId));
      return;
    }

    // ── dated → dated (and dateless → dateless no-op) ────────────────────────
    const hasNullDateDays = existingDays.some((day) => !day.date);
    const hasDateDays = existingDays.some((day) => day.date);
    if (hasNullDateDays && hasDateDays) {
      throw new Error("Unable to update trip dates because one or more scheduled days are missing dates.");
    }
    const currentDates = existingDays.map((day) => day.date!) as string[];
    const syncPlan = buildTripDateSyncPlan(
      currentDates,
      desiredDayRows.map((day) => day.date!)
    );
    const desiredDateSet = new Set(syncPlan.desiredDates);
    const currentDayByDate = new Map(existingDays.map((day) => [day.date!, day]));
    const removedDays = existingDays.filter((day) => syncPlan.removedDates.includes(day.date!));
    const survivingDays = existingDays.filter((day) => desiredDateSet.has(day.date!));
    const removedContent = await summarizeRemovedDayContent(transaction, tripId, removedDays);

    if (removedContent.requiresConfirmation && !resolution) {
      confirmation = removedContent.confirmation;
      return;
    }

    if (
      resolution &&
      expectedConfirmation &&
      stableStringify(removedContent.confirmation) !== stableStringify(expectedConfirmation)
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

    if (resolution === TripDateConflictResolution.DeleteEvents && removedContent.reservationIds.length > 0) {
      eventDocumentUrlsToCleanup = [...eventDocumentUrlsToCleanup, ...removedContent.reservationDocumentUrls];
      await transaction
        .delete(reservations)
        .where(and(eq(reservations.tripId, tripId), inArray(reservations.id, removedContent.reservationIds)));
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

    if (shouldConvertCurrency) {
      await convertMismatchedExpenses(transaction, tripId, budgetCurrency!);
    }
    await transaction
      .update(trips)
      .set(buildTripUpdatePayload(desiredDayRows[0]?.date ?? null, desiredDayRows.at(-1)?.date ?? null))
      .where(eq(trips.id, tripId));
  });

  if (confirmation) {
    return { status: "confirmation-required", confirmation };
  }

  if (eventDocumentUrlsToCleanup.length > 0) {
    await Promise.all(
      eventDocumentUrlsToCleanup.map((url) =>
        getStorageAdapter()
          .del(url)
          .catch((error) => console.warn(`Cleanup failed for ${url}`, error))
      )
    );
  }

  recordTripUpdated(user.id!, tripId);
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return { status: "saved" };
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
  // own push too, mirroring the removedUserIds loop in saveContributorChanges.
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

const VALID_COLLABORATOR_ROLES = Object.values(CollaboratorRole);

function isCollaboratorRole(value: string): value is CollaboratorRole {
  return VALID_COLLABORATOR_ROLES.some((collaboratorRole) => collaboratorRole === value);
}

export async function inviteContributor(
  tripId: string,
  username: string,
  role: CollaboratorRole = CollaboratorRole.Viewer
): Promise<InviteContributorResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "manager");

  if (!isCollaboratorRole(role)) {
    return { status: "error", message: "Invalid collaborator role", errorCode: "invalid-role" };
  }

  const [invitee] = await db
    .select({ id: users.id })
    .from(users)
    .where(hasNormalizedUsername(users.username, normalizeUsername(username)));
  if (!invitee) {
    return { status: "error", message: "No account found for this username", errorCode: "no-account" };
  }
  if (invitee.id === user.id) {
    return { status: "error", message: "You cannot invite yourself to this trip", errorCode: "self-invite" };
  }

  const expiresAt = getInvitationExpiry();
  const result = await db.transaction(async (transaction) => {
    const existingCollaborators = await transaction
      .select({ id: collaborators.id })
      .from(collaborators)
      .where(and(eq(collaborators.tripId, tripId), eq(collaborators.userId, invitee.id)));
    if (existingCollaborators.length > 0) {
      return {
        status: "error",
        message: "This person is already a collaborator on this trip",
        errorCode: "already-collaborator",
      } as const;
    }

    const existingInvitations = await transaction
      .select({ id: invitations.id, status: invitations.status })
      .from(invitations)
      .where(and(eq(invitations.tripId, tripId), eq(invitations.inviteeId, invitee.id)));
    const pendingInvitation = existingInvitations.find((invitation) => invitation.status === "pending");
    if (pendingInvitation) {
      await applyInvitationResend(transaction, pendingInvitation.id, tripId, expiresAt, role);
      return { status: "resent" } as const;
    }

    const declinedInvitation = existingInvitations.find((invitation) => invitation.status === "declined");
    if (declinedInvitation) {
      await transaction.delete(invitations).where(eq(invitations.id, declinedInvitation.id));
    }

    try {
      await transaction.insert(invitations).values({
        tripId,
        inviteeId: invitee.id,
        role,
        status: "pending",
        expiresAt,
        invitedBy: user.id!,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return {
          status: "error",
          message: "This person was just invited by someone else. Try again.",
          errorCode: "invite-conflict",
        } as const;
      }
      throw error;
    }
    return { status: "invited" } as const;
  });

  if (result.status === "invited") recordTripInvitation("invitation_created", user.id!, tripId);
  if (result.status !== "error") {
    // Invitee's personal channel refreshes their dashboard/badge; the trip channel lets another
    // manager's open share dialog pick up the new pending row.
    publishUserEvent(invitee.id, { type: LiveSyncEventType.InvitationChanged, tripId });
    publishTripEvent(tripId, { type: LiveSyncEventType.MembershipChanged, tripId });
    revalidatePath(`/trips/${tripId}`);
  }
  return result;
}

/**
 * Diagnoses why a conditional accept/decline UPDATE matched zero rows, so the caller can surface a
 * descriptive error instead of a generic one. Read-only — never used to gate the mutation itself,
 * which stays a single atomic UPDATE ... WHERE ... RETURNING.
 */
async function describeUnmatchedInvitation(invitationId: string, userId: string): Promise<string> {
  const [invitationRow] = await db.select().from(invitations).where(eq(invitations.id, invitationId));

  if (!invitationRow) {
    return "Invitation not found.";
  }

  if (invitationRow.inviteeId !== userId) {
    return "This invitation is not addressed to your account.";
  }

  if (invitationRow.status === "rescinded") {
    return "This invitation was rescinded by the trip owner.";
  }

  if (invitationRow.status !== "pending") {
    return "This invitation is no longer pending.";
  }

  if (invitationRow.expiresAt.getTime() <= Date.now()) {
    return "This invitation has expired.";
  }

  return "This invitation is no longer pending.";
}

export async function acceptInvitation(invitationId: string): Promise<AcceptInvitationResult> {
  const user = await requireUser();
  if (!user.id) {
    return { status: "error", message: "Invitation not found." };
  }
  const userId = user.id;
  const matchedInvitation = await db.transaction(async (transaction) => {
    const [updatedInvitation] = await transaction
      .update(invitations)
      .set({ status: "accepted" })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.inviteeId, userId),
          eq(invitations.status, "pending"),
          sql`${invitations.expiresAt} > now()`
        )
      )
      .returning();

    if (!updatedInvitation) {
      return null;
    }

    const [account] = await transaction
      .select({ name: users.name, username: users.username })
      .from(users)
      .where(eq(users.id, userId));
    const userName = account?.name ?? account?.username ?? user.name ?? "";
    const collaboratorValues = {
      tripId: updatedInvitation.tripId,
      userId,
      name: userName,
      initials: userName.slice(0, 2).toUpperCase(),
      role: updatedInvitation.role,
      isCreator: false,
    };

    await transaction
      .insert(collaborators)
      .values(collaboratorValues)
      .onConflictDoUpdate({
        target: [collaborators.tripId, collaborators.userId],
        set: collaboratorValues,
      });

    return updatedInvitation;
  });

  if (!matchedInvitation) {
    const message = await describeUnmatchedInvitation(invitationId, userId);
    return { status: "error", message };
  }

  recordTripInvitation("invitation_accepted", userId, matchedInvitation.tripId);
  publishTripEvent(matchedInvitation.tripId, {
    type: LiveSyncEventType.MembershipChanged,
    tripId: matchedInvitation.tripId,
  });
  publishUserEvent(userId, { type: LiveSyncEventType.MembershipChanged, tripId: matchedInvitation.tripId });
  // The acting user's other tabs drop the invitation from their sidebar badge.
  publishUserEvent(userId, { type: LiveSyncEventType.InvitationChanged, tripId: matchedInvitation.tripId });

  revalidatePath("/trips");
  revalidatePath(`/trips/${matchedInvitation.tripId}`);

  return { status: "accepted", tripId: matchedInvitation.tripId };
}

export async function declineInvitation(invitationId: string): Promise<DeclineInvitationResult> {
  const user = await requireUser();
  if (!user.id) {
    return { status: "error", message: "Invitation not found." };
  }
  const userId = user.id;

  const [matchedInvitation] = await db
    .update(invitations)
    .set({ status: "declined" })
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.inviteeId, userId),
        eq(invitations.status, "pending"),
        sql`${invitations.expiresAt} > now()`
      )
    )
    .returning();

  if (!matchedInvitation) {
    const message = await describeUnmatchedInvitation(invitationId, userId);
    return { status: "error", message };
  }

  publishTripEvent(matchedInvitation.tripId, {
    type: LiveSyncEventType.MembershipChanged,
    tripId: matchedInvitation.tripId,
  });
  publishUserEvent(userId, { type: LiveSyncEventType.MembershipChanged, tripId: matchedInvitation.tripId });
  publishUserEvent(userId, { type: LiveSyncEventType.InvitationChanged, tripId: matchedInvitation.tripId });

  revalidatePath("/trips");
  revalidatePath(`/trips/${matchedInvitation.tripId}`);

  return { status: "declined" };
}

export async function rescindInvitation(tripId: string, invitationId: string): Promise<RescindInvitationResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "manager");

  const [rescindedInvitation] = await db
    .update(invitations)
    .set({ status: "rescinded" })
    .where(and(eq(invitations.id, invitationId), eq(invitations.tripId, tripId), eq(invitations.status, "pending")))
    .returning();

  if (!rescindedInvitation) {
    const [invitation] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
    const message =
      invitation && invitation.tripId === tripId ? "Invitation is no longer pending." : "Invitation not found.";
    return { status: "error", message };
  }

  recordTripInvitation("invitation_rescinded", user.id!, tripId);
  publishTripEvent(tripId, { type: LiveSyncEventType.MembershipChanged, tripId });
  publishInvitationChanged(rescindedInvitation.inviteeId, tripId);
  revalidatePath("/trips");

  return { status: "success" };
}

export async function dismissInvitation(tripId: string, invitationId: string): Promise<DismissInvitationResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "manager");

  const [dismissedInvitation] = await db
    .delete(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.tripId, tripId), ne(invitations.status, "pending")))
    .returning();

  if (!dismissedInvitation) {
    const [invitation] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
    const message =
      invitation && invitation.tripId === tripId ? "Invitation is still pending." : "Invitation not found.";
    return { status: "error", message };
  }

  publishTripEvent(tripId, { type: LiveSyncEventType.MembershipChanged, tripId });
  revalidatePath("/trips");

  return { status: "success" };
}

function assertNotCreator(
  collab: { isCreator: boolean | null },
  message: string,
  ErrorClass: new (message: string) => Error = Error
): void {
  if (collab.isCreator) {
    throw new ErrorClass(message);
  }
}

/**
 * Thrown for expected, user-facing rejections inside `saveContributorChanges`'s and `leaveTrip`'s transactions.
 * `stale` marks a concurrent-edit guard failure (row gone, or its role changed since staging) so the
 * caller knows to refetch; unexpected errors are left as plain `Error`s and rethrown, not wrapped here.
 */
class ContributorChangeGuardError extends Error {
  readonly stale: boolean;

  constructor(message: string, options?: { stale?: boolean }) {
    super(message);
    this.stale = options?.stale ?? false;
  }
}

/**
 * Applies a batch of role/removal changes for collaborators on a trip, all-or-nothing, in a single
 * transaction. The server is authoritative: every change is validated against the DB regardless of
 * what the dialog staged, and the whole batch is rejected if any single change fails.
 */
const MAX_CONTRIBUTOR_CHANGES = 50;

export async function saveContributorChanges(
  tripId: string,
  changes: ContributorChange[]
): Promise<SaveContributorChangesResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "manager");

  if (changes.length === 0) {
    return { status: "success" };
  }
  if (changes.length > MAX_CONTRIBUTOR_CHANGES) {
    return { status: "error", message: `Cannot change more than ${MAX_CONTRIBUTOR_CHANGES} contributors at once.` };
  }

  const VALID_ROLES = Object.values(CollaboratorRole);
  for (const change of changes) {
    if (change.type !== "role" && change.type !== "remove") {
      return { status: "error", message: "Invalid change type" };
    }
    if (change.type === "role" && !VALID_ROLES.includes(change.toRole)) {
      return { status: "error", message: "Invalid collaborator role" };
    }
  }
  const changedCollaboratorIds = changes.map((change) => change.collaboratorId);
  if (new Set(changedCollaboratorIds).size !== changedCollaboratorIds.length) {
    return { status: "error", message: "Duplicate change for the same contributor" };
  }

  const removedUserIds: string[] = [];
  const roleChangedUserIds: string[] = [];
  let tripName = "";
  let removedByUsername = "";

  try {
    await db.transaction(async (transaction) => {
      await lockTripForUpdate(transaction, tripId);

      const collaboratorsOnTrip = await transaction
        .select()
        .from(collaborators)
        .where(eq(collaborators.tripId, tripId));
      const collaboratorById = new Map(collaboratorsOnTrip.map((collaborator) => [collaborator.id, collaborator]));

      const myRow = collaboratorsOnTrip.find((collaborator) => collaborator.userId === user.id);
      const myRowId = myRow?.id;

      for (const change of changes) {
        const target = collaboratorById.get(change.collaboratorId);
        if (!target || target.tripId !== tripId) {
          throw new ContributorChangeGuardError("One or more contributors are no longer on this trip.", {
            stale: true,
          });
        }
        assertNotCreator(target, "The trip creator's seat cannot be changed.", ContributorChangeGuardError);
        if (target.id === myRowId) {
          throw new ContributorChangeGuardError("You cannot change your own access.");
        }

        if (change.type === "role") {
          if (target.role !== change.fromRole) {
            throw new ContributorChangeGuardError("A contributor's role changed since you started editing.", {
              stale: true,
            });
          }
          await transaction
            .update(collaborators)
            .set({ role: change.toRole })
            .where(eq(collaborators.id, change.collaboratorId));
          if (target.userId) {
            roleChangedUserIds.push(target.userId);
          }
        } else {
          await transaction.delete(collaborators).where(eq(collaborators.id, change.collaboratorId));
          if (target.userId) {
            removedUserIds.push(target.userId);
          }
        }
      }

      if (removedUserIds.length > 0) {
        const [tripRow] = await transaction.select({ name: trips.name }).from(trips).where(eq(trips.id, tripId));
        tripName = tripRow?.name ?? "";
        const [remover] = await transaction
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, user.id!));
        removedByUsername = remover?.username ?? "";
      }
    });

    if (removedUserIds.length > 0) {
      const removedByName = user.name ?? removedByUsername;
      for (const removedUserId of removedUserIds) {
        publishUserEvent(removedUserId, {
          type: LiveSyncEventType.MembershipRemoved,
          removedUserId,
          tripId,
          tripName,
          removedByName,
          removedByUsername,
        });
        removeTripSubscribersForUser(tripId, removedUserId);
      }
    }

    for (const roleChangedUserId of roleChangedUserIds) {
      publishUserEvent(roleChangedUserId, {
        type: LiveSyncEventType.MembershipChanged,
        tripId,
      });
    }

    // The batch reaching here always applied at least one change (role or removal) — `changes` was
    // checked non-empty above and the transaction is all-or-nothing — so every open session on this
    // trip's channel needs to know, not just the sessions of removed users.
    publishTripEvent(tripId, { type: LiveSyncEventType.MembershipChanged, tripId });

    revalidatePath(`/trips/${tripId}`);
    revalidatePath("/trips");
    return { status: "success" };
  } catch (error) {
    if (error instanceof ContributorChangeGuardError) {
      return { status: "error", message: error.message, stale: error.stale };
    }
    throw error;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ON_TRIP_MESSAGE = "You're no longer on this trip.";

/**
 * Removes the signed-in editor or viewer from a trip — their own membership row only. The trip, its
 * content, and every other membership stay intact. Deliberately separate from the manager-only
 * `saveContributorChanges` (which rejects self-changes): identity comes from the session, never the
 * client, and role/creator protection is re-checked under the same trip lock the manager batch takes,
 * so a concurrent manager removal can't interleave with this one.
 *
 * A caller who is already off the trip (forged id, concurrent removal, repeated click) gets a `stale`
 * error rather than `notFound()`, so the client can return to the trips list without claiming success.
 */
export async function leaveTrip(tripId: string): Promise<LeaveTripResult> {
  const user = await requireUser();
  const userId = user.id!;

  if (typeof tripId !== "string" || !UUID_PATTERN.test(tripId)) {
    return { status: "error", message: NOT_ON_TRIP_MESSAGE, stale: true };
  }

  const ownMembership = and(eq(collaborators.tripId, tripId), eq(collaborators.userId, userId));

  const [existingMembership] = await db.select({ id: collaborators.id }).from(collaborators).where(ownMembership);
  if (!existingMembership) {
    return { status: "error", message: NOT_ON_TRIP_MESSAGE, stale: true };
  }

  try {
    await db.transaction(async (transaction) => {
      try {
        await lockTripForUpdate(transaction, tripId);
      } catch (error) {
        // Trip deleted between the pre-check and the lock: the caller is no longer on it — stale, not a failure.
        if (error instanceof Error && error.message === TRIP_NOT_FOUND_MESSAGE) {
          throw new ContributorChangeGuardError(NOT_ON_TRIP_MESSAGE, { stale: true });
        }
        throw error;
      }

      const [membership] = await transaction
        .select({ id: collaborators.id, role: collaborators.role, isCreator: collaborators.isCreator })
        .from(collaborators)
        .where(ownMembership);
      if (!membership) {
        throw new ContributorChangeGuardError(NOT_ON_TRIP_MESSAGE, { stale: true });
      }
      assertNotCreator(membership, "The trip creator can't leave this trip.", ContributorChangeGuardError);
      if (membership.role !== CollaboratorRole.Editor && membership.role !== CollaboratorRole.Viewer) {
        throw new ContributorChangeGuardError("Managers can't leave a trip.");
      }

      await transaction
        .delete(collaborators)
        .where(and(eq(collaborators.id, membership.id), eq(collaborators.userId, userId)));
    });
  } catch (error) {
    if (error instanceof ContributorChangeGuardError) {
      return { status: "error", message: error.message, stale: error.stale };
    }
    throw error;
  }

  // Personal event first so the leaver's other tabs redirect, then close their trip streams before the
  // trip-wide broadcast — otherwise those tabs would refresh into a denied page on membership-changed.
  publishUserEvent(userId, { type: LiveSyncEventType.MembershipLeft, tripId });
  removeTripSubscribersForUser(tripId, userId);
  publishTripEvent(tripId, { type: LiveSyncEventType.MembershipChanged, tripId });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return { status: "success" };
}

export async function addPackingItem(tripId: string, input: import("@/data/types").AddPackingItemInput): Promise<void> {
  return addPackingItemAction(tripId, input);
}

export async function updatePackingItem(
  itemId: string,
  input: import("@/data/types").UpdatePackingItemInput
): Promise<void> {
  return updatePackingItemAction(itemId, input);
}

export async function togglePackingItem(itemId: string): Promise<void> {
  return togglePackingItemAction(itemId);
}

export async function removePackingItem(itemId: string): Promise<void> {
  return removePackingItemAction(itemId);
}

export async function reorderPackingItems(
  tripId: string,
  ordered: { id: string; labelId: string | null; position: number }[]
): Promise<void> {
  return reorderPackingItemsAction(tripId, ordered);
}

export async function pullTemplatesOntoTrip(
  tripId: string,
  templateIds: string[],
  listId?: string | null
): Promise<import("@/data/types").PullTemplatesResult> {
  return pullTemplatesOntoTripAction(tripId, templateIds, listId);
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

  await requireUser();

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

  await requireUser();

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
