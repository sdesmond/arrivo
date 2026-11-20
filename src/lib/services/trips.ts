import "server-only";
import { eq } from "drizzle-orm";
import { trips, expenses } from "@/db/schema";
import type { Actor, IdempotentRequest, Trip } from "@/data/types";
import { updateTrip as contract } from "@/lib/api/contract/trips";
import { dbExpenseToType, dbTripToType } from "@/lib/db-mappers";
import { recalculateAll } from "@/lib/currency";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite } from "./trip-write";

export async function updateTrip(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<Trip> {
  tripId = contract.params.parse({ tripId }).tripId;
  const { convertCurrency, ...patch } = contract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite(
    actor,
    tripId,
    { replay, payload: { ...patch, convertCurrency }, revalidate: ["/trips"] },
    (transaction, markChanged) => ({
      authorize: async () => {
        await lockTrip(transaction, tripId);
        await requireTripRole(tripId, actor.userId, "editor", transaction);
      },
      mutate: async () => {
        const [current] = await transaction.select().from(trips).where(eq(trips.id, tripId));
        if (!current) throw new TripNotFoundError();
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
        if (Object.keys(patch).length === 0) return dbTripToType(current);
        const [updated] = await transaction
          .update(trips)
          .set({ ...patch, budgetTotal: patch.budgetTotal?.toString(), updatedAt: new Date() })
          .where(eq(trips.id, tripId))
          .returning();
        if (!updated) throw new TripNotFoundError();
        markChanged();
        return dbTripToType(updated);
      },
    })
  );
}
