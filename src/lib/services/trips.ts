import "server-only";
import { eq } from "drizzle-orm";
import { trips, expenses } from "@/db/schema";
import type { Actor, IdempotentRequest, Trip, TripDetailPayload } from "@/data/types";
import { getTrip as readContract, updateTrip as contract } from "@/lib/api/contract/trips";
import { dbExpenseToType, dbTripToType } from "@/lib/db-mappers";
import { recalculateAll } from "@/lib/currency";
import { getTripDetail } from "@/lib/queries";
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
