import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import { collaborators, trips } from "@/db/schema";
import type { Actor, IdempotentRequest, Trip, TripDetailPayload, TripListEntry } from "@/data/types";
import { LiveSyncEventType, TransitMode } from "@/data/types";
import {
  createTrip as createContract,
  deleteTrip as deleteContract,
  getTrip as readContract,
  listTrips as listContract,
  updateTrip as contract,
} from "@/lib/api/contract/trips";
import { withIdempotency } from "@/lib/api/idempotency";
import { isSupportedCurrencyCode, normalizeCurrencyCode } from "@/lib/currencies";
import { dbTripToType, isTransitMode } from "@/lib/db-mappers";
import { recalculateTripExpenses } from "./expense-conversions";
import { createTripInTransaction } from "@/lib/membership-writes";
import { getNow } from "@/lib/mock-date";
import { getTripDetail, listTripsForUser } from "@/lib/queries";
import { guardTransactionDeadline } from "@/lib/request-deadline";
import { recordTripCreated } from "@/lib/trip-activity";
import { detectPreferredCurrency } from "@/lib/utils";
import { publishTripEvent, publishUserEvent, purgeTripTopic } from "@/lib/trip-events";
import { buildDatelessDayRow, buildDayRows } from "@/app/(app)/trips/create-trip-days";
import { resolveTripDateRange } from "@/app/(app)/trips/date-sync";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { refuseRecentlyDeleted } from "./deletion-records";
import { recordTripCascade, selectTripCascade } from "./trip-cascade";
import { generateTripCover } from "./trip-cover-generation";
import { discardStoredFile, queueFileDeletions, removeQueuedFiles, type QueuedFileDeletion } from "@/lib/file-cleanup";
import { isOwnTripCoverFile } from "@/lib/url-policy";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { applyTripDateChange } from "./trip-date-change";
import { lockTrip, runTripWrite } from "./trip-write";
import { ValidationFailedError } from "./validation-failed-error";

export async function getTrip(actor: Actor, tripId: string): Promise<TripDetailPayload> {
  tripId = readContract.params.parse({ tripId }).tripId;
  await requireTripRole(tripId, actor.userId, "viewer");
  // One read-only snapshot, so a write committing mid-read can't give the ETag a payload mixing two states.
  // getTripDetail turns access lost since the check above into Next's notFound(); answer it as a plain 404.
  const detail = await db
    .transaction((transaction) => getTripDetail(tripId, actor.userId, transaction), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    })
    .catch((error: unknown) => {
      if (String((error as { digest?: unknown })?.digest).includes("NEXT_HTTP_ERROR_FALLBACK;404")) return null;
      throw error;
    });
  if (!detail) throw new TripNotFoundError();
  return detail;
}

export async function updateTrip(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<Trip> {
  tripId = contract.params.parse({ tripId }).tripId;
  const body = contract.body.parse(input);
  const { convertCurrency, resolution, confirmation, startDate, endDate, ...patch } = body;
  await requireTripRole(tripId, actor.userId, "editor");
  if (resolution && !confirmation) {
    throw new ValidationFailedError("Send the confirmation from the preview with the resolution.", {
      confirmation: ["Required with a resolution."],
    });
  }
  if (confirmation && !resolution) {
    throw new ValidationFailedError("Send a resolution with the confirmation.", {
      resolution: ["Required with a confirmation."],
    });
  }
  const changesDates = startDate !== undefined || endDate !== undefined;
  let queued: QueuedFileDeletion[] = [];
  const saved = await runTripWrite(
    actor,
    tripId,
    { replay, payload: body, revalidate: ["/trips"] },
    (transaction, markChanged) => ({
      authorize: async () => {
        await lockTrip(transaction, tripId);
        await requireTripRole(tripId, actor.userId, "editor", transaction);
      },
      mutate: async () => {
        queued = [];
        const [current] = await transaction.select().from(trips).where(eq(trips.id, tripId));
        if (!current) throw new TripNotFoundError();
        let dateColumns: { startDate: string | null; endDate: string | null } | undefined;
        const range = resolveTripDateRange(
          { startDate: current.startDate ?? undefined, endDate: current.endDate ?? undefined },
          { startDate, endDate }
        );
        const effectiveStart = startDate === null ? null : (range.startDate ?? null);
        const effectiveEnd = effectiveStart === null ? null : (range.endDate ?? null);
        const datesDiffer = effectiveStart !== current.startDate || effectiveEnd !== current.endDate;
        if ((confirmation || resolution) && (!changesDates || !datesDiffer || startDate === null)) {
          throw new ConflictError(
            "Trip dates changed before this confirmation was applied. Review the date change again."
          );
        }
        if (changesDates && datesDiffer) {
          // A preview throws here, before any write, so the transaction rolls back and nothing is cached for replay.
          const change = await applyTripDateChange(
            transaction,
            tripId,
            current,
            { startDate, endDate, resolution, confirmation },
            actor.userId
          );
          queued = await queueFileDeletions(transaction, change.documentUrls);
          dateColumns = { startDate: change.startDate, endDate: change.endDate };
        }
        if (convertCurrency && patch.budgetCurrency) {
          await recalculateTripExpenses(transaction, tripId, patch.budgetCurrency);
        }
        if (Object.keys(patch).length === 0 && !dateColumns) return dbTripToType(current);
        const [updated] = await transaction
          .update(trips)
          .set({ ...patch, ...dateColumns, budgetTotal: patch.budgetTotal?.toString(), updatedAt: new Date() })
          .where(eq(trips.id, tripId))
          .returning();
        if (!updated) throw new TripNotFoundError();
        markChanged();
        return dbTripToType(updated);
      },
    })
  );
  // Best effort after the response: the rows are gone and the names are queued, so a failure (or no request scope to
  // schedule in) only leaves the file for the next drain.
  if (queued.length > 0) {
    try {
      after(() => removeQueuedFiles(queued));
    } catch (error) {
      console.warn("Could not schedule queued file cleanup", error);
    }
  }
  return saved;
}

type CreateTripBody = ReturnType<typeof createContract.body.parse>;

function resolveBudgetCurrency(code?: string): string | undefined {
  const normalizedCode = normalizeCurrencyCode(code);
  if (!normalizedCode) return undefined;
  if (!isSupportedCurrencyCode(normalizedCode)) {
    throw new ValidationFailedError("Invalid budget currency.", { budgetCurrency: ["Invalid budget currency."] });
  }
  return normalizedCode;
}

/** Refuses an inverted or over-long range up front, so a bad range never reaches the transaction. */
function assertDayRange(startDate: string | undefined, endDate: string | undefined): void {
  if (startDate && endDate && endDate < startDate) {
    const message = "End date must not be before the start date.";
    throw new ValidationFailedError(message, { endDate: [message] });
  }
  try {
    buildDayRows("range-check", startDate, endDate);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid date range.";
    throw new ValidationFailedError(message, { endDate: [message] });
  }
}

/**
 * Whether a stored trip is what `body` would have created. Fields the account defaults can fill (currency, transit
 * mode) only count when the request named them, and the cover is ignored: it is generated after the create.
 */
function isSameTrip(row: typeof trips.$inferSelect, body: CreateTripBody): boolean {
  const budgetTotal = row.budgetTotal === null ? undefined : Number(row.budgetTotal);
  return (
    row.name === body.name &&
    (row.startDate ?? null) === (body.startDate ?? null) &&
    (row.endDate ?? null) === (body.endDate ?? null) &&
    (row.destinationName ?? null) === (body.destinationName ?? null) &&
    (row.destinationCountry ?? null) === (body.destinationCountry ?? null) &&
    (row.destinationCountryCode ?? null) === (body.destinationCountryCode ?? null) &&
    (row.notes ?? null) === (body.notes ?? null) &&
    budgetTotal === body.budgetTotal &&
    JSON.stringify(row.tags ?? []) === JSON.stringify(body.tags ?? []) &&
    (body.budgetCurrency === undefined || row.budgetCurrency === body.budgetCurrency) &&
    (!body.transitMode || row.transitMode === body.transitMode)
  );
}

/**
 * Creates the trip with the client's UUID. A repeat of the same id with the same content returns the current row and
 * does no write or cover work; the same id with other content is a conflict, and an id owned by a trip the caller
 * cannot see answers as not found. The cover is generated after the commit and never fails the create.
 */
export async function createTrip(
  actor: Actor,
  input: unknown,
  replay?: IdempotentRequest,
  options: { acceptLanguage?: string } = {}
): Promise<Trip> {
  const body = createContract.body.parse(input);
  assertDayRange(body.startDate, body.endDate);
  let created: { ownerId: string; ownerUsername: string } | undefined;
  const { value, replayed } = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, () =>
      withIdempotency<Trip>(
        transaction,
        { actor, request: replay, payload: body },
        {
          authorize: async () => {
            await lockClientIds(transaction, [`trip:${body.id}`]);
            const [existing] = await transaction.select({ id: trips.id }).from(trips).where(eq(trips.id, body.id));
            if (existing) await requireTripRole(existing.id, actor.userId, "viewer", transaction);
          },
          mutate: async () => {
            created = undefined;
            const [existing] = await transaction.select().from(trips).where(eq(trips.id, body.id));
            if (existing) {
              if (!isSameTrip(existing, body))
                throw new ConflictError("This ID was already used for a different trip.");
              return dbTripToType(existing);
            }
            await refuseRecentlyDeleted(transaction, "trip", body.id);
            const result = await createTripInTransaction(transaction, actor.userId, (owner) => {
              const preferredCurrency = owner.currency ?? detectPreferredCurrency(options.acceptLanguage ?? "");
              const resolvedTransitMode = body.transitMode ?? owner.transitMode ?? TransitMode.Drive;
              return {
                tripValues: {
                  id: body.id,
                  name: body.name,
                  startDate: body.startDate ?? null,
                  endDate: body.endDate ?? null,
                  destinationName: body.destinationName ?? null,
                  destinationCountry: body.destinationCountry ?? null,
                  destinationCountryCode: body.destinationCountryCode ?? null,
                  notes: body.notes ?? null,
                  budgetCurrency: resolveBudgetCurrency(body.budgetCurrency ?? preferredCurrency) ?? null,
                  transitMode: isTransitMode(resolvedTransitMode) ? resolvedTransitMode : TransitMode.Drive,
                  budgetTotal: body.budgetTotal?.toString(),
                  tags: body.tags ?? [],
                },
                collaboratorName: owner.name ?? owner.username,
                buildDayRows: (newTripId) => {
                  const dayRows = buildDayRows(newTripId, body.startDate, body.endDate);
                  return dayRows.length > 0 ? dayRows : buildDatelessDayRow(newTripId);
                },
              };
            });
            const [row] = await transaction.select().from(trips).where(eq(trips.id, result.tripId));
            created = result;
            return dbTripToType(row);
          },
        }
      )
    )
  );
  if (created && !replayed) {
    recordTripCreated({ id: created.ownerId, username: created.ownerUsername }, body.id);
    const cover = await generateTripCover({
      userId: actor.userId,
      tripId: body.id,
      name: body.name,
      destinationName: body.destinationName,
      destinationCenter: body.destinationCenter,
    });
    if (cover) {
      try {
        // Generation runs after the commit and can be slow, so only fill a cover nobody chose in the meantime.
        const applied = await db
          .update(trips)
          .set(cover)
          .where(and(eq(trips.id, body.id), isNull(trips.coverImageUrl)))
          .returning({ id: trips.id });
        if (applied.length === 0 && isOwnTripCoverFile(cover.coverImageUrl, body.id))
          await discardStoredFile(cover.coverImageUrl);
      } catch (error) {
        console.error("Cover image save failed:", error);
        // A generated map tile is stored before the row update; nothing points at it once the update fails.
        if (isOwnTripCoverFile(cover.coverImageUrl, body.id)) await discardStoredFile(cover.coverImageUrl);
      }
    }
    revalidatePath("/trips");
  }
  return value;
}

export async function listTrips(actor: Actor, input: unknown = {}): Promise<{ trips: TripListEntry[] }> {
  listContract.body.parse(input);
  return { trips: await listTripsForUser(actor.userId, getNow()) };
}

/** Deletes under the trip lock; missing rows are successful retries, while existing rows require a manager. */
export async function deleteTrip(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<null> {
  tripId = deleteContract.params.parse({ tripId }).tripId;
  const body = deleteContract.body.parse(input);
  let deleted = false;
  let queued: QueuedFileDeletion[] = [];
  let recipientIds: string[] = [];
  const { value, replayed } = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, () =>
      withIdempotency<null>(
        transaction,
        { actor, request: replay, payload: body },
        {
          authorize: async () => {
            await lockClientIds(transaction, [`trip:${tripId}`]);
            try {
              await lockTrip(transaction, tripId);
            } catch (error) {
              if (error instanceof TripNotFoundError) return;
              throw error;
            }
            await requireTripRole(tripId, actor.userId, "manager", transaction);
            deleted = true;
          },
          mutate: async () => {
            if (!deleted) return null;
            const cascade = await selectTripCascade(transaction, tripId);
            const [tripRow] = await transaction
              .select({ coverImageUrl: trips.coverImageUrl })
              .from(trips)
              .where(eq(trips.id, tripId));
            const coverFiles = isOwnTripCoverFile(tripRow?.coverImageUrl, tripId) ? [tripRow.coverImageUrl] : [];
            const members = await transaction
              .select({ userId: collaborators.userId })
              .from(collaborators)
              .where(eq(collaborators.tripId, tripId));
            recipientIds = members.flatMap(({ userId }) => (userId && userId !== actor.userId ? [userId] : []));
            queued = await queueFileDeletions(transaction, [
              ...cascade.files.flatMap(({ url }) => (url ? [url] : [])),
              ...coverFiles,
            ]);
            await transaction.delete(trips).where(eq(trips.id, tripId));
            await recordTripCascade(transaction, tripId, cascade, actor.userId);
            return null;
          },
        }
      )
    )
  );
  if (deleted && !replayed) {
    const event = { type: LiveSyncEventType.TripDeleted, tripId } as const;
    publishTripEvent(tripId, event);
    for (const userId of recipientIds) publishUserEvent(userId, event);
    purgeTripTopic(tripId);
    revalidatePath("/trips");
    if (queued.length > 0) {
      try {
        after(() => removeQueuedFiles(queued));
      } catch (error) {
        console.warn("Could not schedule queued file cleanup", error);
      }
    }
  }
  return value;
}
