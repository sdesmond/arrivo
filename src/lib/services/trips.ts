import "server-only";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { trips, expenses } from "@/db/schema";
import type { Actor, IdempotentRequest, Trip, TripDetailPayload, TripListEntry } from "@/data/types";
import { TransitMode } from "@/data/types";
import {
  createTrip as createContract,
  getTrip as readContract,
  listTrips as listContract,
  updateTrip as contract,
} from "@/lib/api/contract/trips";
import { withIdempotency } from "@/lib/api/idempotency";
import { isSupportedCurrencyCode, normalizeCurrencyCode } from "@/lib/currencies";
import { dbExpenseToType, dbTripToType, isTransitMode } from "@/lib/db-mappers";
import { recalculateAll } from "@/lib/currency";
import { createTripInTransaction } from "@/lib/membership-writes";
import { getNow } from "@/lib/mock-date";
import { getTripDetail, listTripsForUser } from "@/lib/queries";
import { guardTransactionDeadline } from "@/lib/request-deadline";
import { recordTripCreated } from "@/lib/trip-activity";
import { detectPreferredCurrency } from "@/lib/utils";
import { buildDatelessDayRow, buildDayRows } from "@/app/(app)/trips/create-trip-days";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { generateTripCover } from "./trip-cover-generation";
import { queueFileDeletions, removeQueuedFiles, type QueuedFileDeletion } from "@/lib/file-cleanup";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { applyTripDateChange } from "./trip-date-change";
import { lockTrip, runTripWrite } from "./trip-write";
import { ValidationFailedError } from "./validation-failed-error";

export async function getTrip(actor: Actor, tripId: string): Promise<TripDetailPayload> {
  tripId = readContract.params.parse({ tripId }).tripId;
  await requireTripRole(tripId, actor.userId, "viewer");
  // getTripDetail turns access lost since the check above into Next's notFound(); answer it as a plain 404.
  const detail = await getTripDetail(tripId, actor.userId).catch((error: unknown) => {
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
        if (changesDates) {
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
          const rows = await transaction.select().from(expenses).where(eq(expenses.tripId, tripId));
          const results = await recalculateAll(rows.map(dbExpenseToType), patch.budgetCurrency);
          const nativeResults = rows
            .filter((expense) => expense.currency.toUpperCase() === patch.budgetCurrency)
            .map((expense) => ({ expenseId: expense.id, convertedAmount: expense.amount, rate: 1 }));
          await Promise.all(
            [...results, ...nativeResults].map((result) =>
              transaction
                .update(expenses)
                .set({
                  convertedAmountTrip: result.convertedAmount.toString(),
                  conversionRateTrip: result.rate.toString(),
                  convertedCurrencyTrip: patch.budgetCurrency,
                  updatedAt: new Date(),
                })
                .where(eq(expenses.id, result.expenseId))
            )
          );
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
  // Best effort: the rows are gone and the names are queued, so a failure only leaves the file for the next drain.
  await removeQueuedFiles(queued);
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
        await db.update(trips).set(cover).where(eq(trips.id, body.id));
      } catch (error) {
        console.error("Cover image save failed:", error);
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
