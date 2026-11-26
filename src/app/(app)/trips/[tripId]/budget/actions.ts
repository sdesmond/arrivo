"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { expenses, trips } from "@/db/schema";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { recalculate } from "@/lib/currency";
import { dbExpenseToType } from "@/lib/db-mappers";
import { recordTripUpdated } from "@/lib/trip-activity";

export async function recalculateConversions(tripId: string): Promise<{ recalculated: true }> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  let updatedCount = 0;
  await db.transaction(async (tx) => {
    const [tripRow] = await tx.select({ budgetCurrency: trips.budgetCurrency }).from(trips).where(eq(trips.id, tripId));
    const tripCurrency = (tripRow?.budgetCurrency ?? "").toUpperCase();

    const expenseRows = await tx.select().from(expenses).where(eq(expenses.tripId, tripId));
    const tripExpenses = expenseRows.map(dbExpenseToType);

    const conversionResults = await recalculate(tripExpenses, tripCurrency);
    updatedCount = conversionResults.length;

    await Promise.all(
      conversionResults.map((result) =>
        tx
          .update(expenses)
          .set({
            convertedAmountTrip: result.convertedAmount.toString(),
            conversionRateTrip: result.rate.toString(),
            convertedCurrencyTrip: tripCurrency,
            updatedAt: new Date(),
          })
          .where(eq(expenses.id, result.expenseId))
      )
    );
  });

  if (updatedCount > 0) recordTripUpdated(user.id!, tripId);
  revalidatePath(`/trips/${tripId}`);
  return { recalculated: true };
}
