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
  users,
  invitations,
} from "@/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type {
  AcceptInvitationResult,
  CreateTripInput,
  UpdateTripPatch,
  AddCollaboratorInput,
  DeclineInvitationResult,
  InviteContributorResult,
  RescindInvitationResult,
  TripDateChangeConfirmation,
  TripDateConflictResolution,
  UpdateTripMetadataResult,
} from "@/data/types";
import { CollaboratorRole, TransitMode } from "@/data/types";
import { SearchBoxCore, SessionToken } from "@mapbox/search-js-core";
import type { SearchBoxAdministrativeUnitTypes, SearchBoxSuggestion } from "@mapbox/search-js-core";
import { deriveGraphicCover, detectPreferredCurrency, stableStringify } from "@/lib/utils";
import { isSupportedCurrencyCode, normalizeCurrencyCode } from "@/lib/currencies";
import { recalculateAll } from "@/lib/currency";
import { dbExpenseToType, isTransitMode } from "@/lib/db-mappers";
import { type DbTransaction, lockTripForUpdate } from "@/lib/server-action-locks";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { createUploadStorageName } from "@/lib/upload-policy";
import { hasNormalizedEmail, INVITE_TTL_HOURS, normalizeEmail } from "@/lib/invitations";
import { CoverType } from "@/data/types";
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
      removedDays.some((day) => !day.date) ? removedDays.map((day) => day.label) : undefined,
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
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        currency: users.currency,
        transitMode: users.transitMode,
      })
      .from(users)
      .where(eq(users.email, sessionUser.email!))
      .for("update");

    if (!user?.id || !user.email) {
      throw new Error("Signed-in user could not be resolved before trip creation.");
    }
    userId = user.id;
    const userEmail = user.email;
    const userName = user.name ?? userEmail;
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
      email: userEmail,
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
      const overflowContent = await summarizeRemovedDayContent(transaction, overflowDays);

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
    const removedContent = await summarizeRemovedDayContent(transaction, removedDays);

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

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return { status: "saved" };
}

export async function deleteTrip(tripId: string) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "manager");

  const tripDocs = await db.select({ url: documents.url }).from(documents).where(eq(documents.tripId, tripId));

  await db.delete(trips).where(eq(trips.id, tripId));

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

export async function addCollaborator(tripId: string, input: AddCollaboratorInput) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "manager");
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

const VALID_COLLABORATOR_ROLES = Object.values(CollaboratorRole);

function isCollaboratorRole(value: string): value is CollaboratorRole {
  return VALID_COLLABORATOR_ROLES.some((collaboratorRole) => collaboratorRole === value);
}

const UNIQUE_VIOLATION_CODE = "23505";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === UNIQUE_VIOLATION_CODE;
}

export async function inviteContributor(
  tripId: string,
  email: string,
  role: CollaboratorRole = CollaboratorRole.Viewer
): Promise<InviteContributorResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "manager");

  if (!isCollaboratorRole(role)) {
    return { status: "error", message: "Invalid collaborator role" };
  }

  const normalizedEmail = normalizeEmail(email);
  if (user.email && normalizedEmail === normalizeEmail(user.email)) {
    return { status: "error", message: "You cannot invite yourself to this trip" };
  }

  const [invitee] = await db
    .select({ id: users.id })
    .from(users)
    .where(hasNormalizedEmail(users.email, normalizedEmail));
  if (!invitee) {
    return { status: "error", message: "No Packt account found for this email" };
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
  const result = await db.transaction(async (transaction) => {
    const existingCollaborators = await transaction
      .select({ id: collaborators.id })
      .from(collaborators)
      .where(and(eq(collaborators.tripId, tripId), hasNormalizedEmail(collaborators.email, normalizedEmail)));
    if (existingCollaborators.length > 0) {
      return { status: "error", message: "This person is already a collaborator on this trip" } as const;
    }

    const existingInvitations = await transaction
      .select({ id: invitations.id, status: invitations.status })
      .from(invitations)
      .where(and(eq(invitations.tripId, tripId), hasNormalizedEmail(invitations.email, normalizedEmail)));
    const pendingInvitation = existingInvitations.find((invitation) => invitation.status === "pending");
    if (pendingInvitation) {
      await transaction.update(invitations).set({ role, expiresAt }).where(eq(invitations.id, pendingInvitation.id));
      return { status: "resent" } as const;
    }

    const declinedInvitation = existingInvitations.find((invitation) => invitation.status === "declined");
    if (declinedInvitation) {
      await transaction.delete(invitations).where(eq(invitations.id, declinedInvitation.id));
    }

    try {
      await transaction.insert(invitations).values({
        tripId,
        email: normalizedEmail,
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
        } as const;
      }
      throw error;
    }
    return { status: "invited" } as const;
  });

  if (result.status !== "error") {
    revalidatePath(`/trips/${tripId}`);
  }
  return result;
}

/**
 * Diagnoses why a conditional accept/decline UPDATE matched zero rows, so the caller can surface a
 * descriptive error instead of a generic one. Read-only — never used to gate the mutation itself,
 * which stays a single atomic UPDATE ... WHERE ... RETURNING.
 */
async function describeUnmatchedInvitation(invitationId: string, normalizedEmail: string): Promise<string> {
  const [invitationRow] = await db.select().from(invitations).where(eq(invitations.id, invitationId));

  if (!invitationRow) {
    return "Invitation not found.";
  }

  if (normalizeEmail(invitationRow.email) !== normalizedEmail) {
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
  if (!user.email || !user.id) {
    return { status: "error", message: "Invitation not found." };
  }
  const normalizedEmail = normalizeEmail(user.email);
  const userName = user.name ?? user.email;
  const matchedInvitation = await db.transaction(async (transaction) => {
    const [updatedInvitation] = await transaction
      .update(invitations)
      .set({ status: "accepted" })
      .where(
        and(
          eq(invitations.id, invitationId),
          hasNormalizedEmail(invitations.email, normalizedEmail),
          eq(invitations.status, "pending"),
          sql`${invitations.expiresAt} > now()`
        )
      )
      .returning();

    if (!updatedInvitation) {
      return null;
    }

    const collaboratorValues = {
      tripId: updatedInvitation.tripId,
      userId: user.id,
      email: normalizedEmail,
      name: userName,
      initials: userName.slice(0, 2).toUpperCase(),
      role: updatedInvitation.role,
      isCreator: false,
    };

    await transaction
      .insert(collaborators)
      .values(collaboratorValues)
      .onConflictDoUpdate({
        target: [collaborators.tripId, collaborators.email],
        set: collaboratorValues,
      });

    return updatedInvitation;
  });

  if (!matchedInvitation) {
    const message = await describeUnmatchedInvitation(invitationId, normalizedEmail);
    return { status: "error", message };
  }

  // TODO(epic-4): publish a `membership-changed` event on `trip:{tripId}` and `user:{userId}` via
  // publishTripEvent/publishUserEvent once src/lib/trip-events.ts ships the pub-sub module.

  revalidatePath("/trips");
  revalidatePath(`/trips/${matchedInvitation.tripId}`);

  return { status: "accepted", tripId: matchedInvitation.tripId };
}

export async function declineInvitation(invitationId: string): Promise<DeclineInvitationResult> {
  const user = await requireUser();
  if (!user.email) {
    return { status: "error", message: "Invitation not found." };
  }
  const normalizedEmail = normalizeEmail(user.email);

  const [matchedInvitation] = await db
    .update(invitations)
    .set({ status: "declined" })
    .where(
      and(
        eq(invitations.id, invitationId),
        hasNormalizedEmail(invitations.email, normalizedEmail),
        eq(invitations.status, "pending"),
        sql`${invitations.expiresAt} > now()`
      )
    )
    .returning();

  if (!matchedInvitation) {
    const message = await describeUnmatchedInvitation(invitationId, normalizedEmail);
    return { status: "error", message };
  }

  // TODO(epic-4): publish a `membership-changed` event on `trip:{tripId}` and `user:{userId}` via
  // publishTripEvent/publishUserEvent once src/lib/trip-events.ts ships the pub-sub module.

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

  // TODO(epic-4): publish a `membership-changed` event on `trip:{tripId}` via publishTripEvent once
  // src/lib/trip-events.ts ships the pub-sub module — the manager rescinding is the actor here, not
  // the invitee (who is keyed by email, not userId, until they accept).
  revalidatePath("/trips");

  return { status: "success" };
}

export async function removeCollaborator(collabId: string) {
  const user = await requireUser();
  const [collab] = await db.select().from(collaborators).where(eq(collaborators.id, collabId));
  if (!collab) return;
  await assertTripAccess(collab.tripId, user.id!, "manager");
  await db.delete(collaborators).where(eq(collaborators.id, collabId));
  revalidatePath(`/trips/${collab.tripId}`);
}

export async function updateCollaboratorRole(collabId: string, role: "editor" | "viewer") {
  const user = await requireUser();
  const [collab] = await db.select().from(collaborators).where(eq(collaborators.id, collabId));
  if (!collab) return;
  await assertTripAccess(collab.tripId, user.id!, "manager");
  await db.update(collaborators).set({ role }).where(eq(collaborators.id, collabId));
  revalidatePath(`/trips/${collab.tripId}`);
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
