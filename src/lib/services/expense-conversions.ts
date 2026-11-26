import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses, trips, users } from "@/db/schema";
import { convertDual, recalculate, recalculateAll } from "@/lib/currency";
import { dbExpenseToType } from "@/lib/db-mappers";
import type { Actor, IdempotentRequest } from "@/data/types";
import type { DbTransaction } from "@/lib/server-action-locks";
import { recalculateExpenses as contract } from "@/lib/api/contract/expenses";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite } from "./trip-write";

export interface ConversionFields {
  convertedAmountTrip: string | null;
  conversionRateTrip: string | null;
  convertedCurrencyTrip: string | null;
  convertedAmountProfile: string | null;
  conversionRateProfile: string | null;
  convertedCurrencyProfile: string | null;
}

const NULL_CONVERSIONS: ConversionFields = {
  convertedAmountTrip: null,
  conversionRateTrip: null,
  convertedCurrencyTrip: null,
  convertedAmountProfile: null,
  conversionRateProfile: null,
  convertedCurrencyProfile: null,
};

/**
 * Resolve the dual conversions for an expense against the trip's budget currency
 * and the acting user's profile currency. Conversion is server-side only — the
 * fetched rates never reach the client. A lookup failure is non-blocking: the
 * expense saves unconverted and the caller is signalled via the returned flag.
 * `executor` lets a caller read the trip and user inside its own transaction.
 */
export async function computeConversions(
  tripId: string,
  userId: string,
  amount: number,
  currency: string,
  date: string,
  executor: Pick<typeof db, "select"> = db
): Promise<{ fields: ConversionFields; conversionError?: boolean }> {
  const normalizedCurrency = currency.toUpperCase();

  const [[tripRow], [userRow]] = await Promise.all([
    executor.select({ budgetCurrency: trips.budgetCurrency }).from(trips).where(eq(trips.id, tripId)),
    executor.select({ currency: users.currency }).from(users).where(eq(users.id, userId)),
  ]);

  const tripCurrency = tripRow?.budgetCurrency?.toUpperCase() ?? null;
  const profileCurrency = userRow?.currency?.toUpperCase() ?? null;

  const targets: string[] = [];
  if (tripCurrency && tripCurrency !== normalizedCurrency) targets.push(tripCurrency);
  if (profileCurrency && profileCurrency !== normalizedCurrency) targets.push(profileCurrency);

  if (targets.length === 0) {
    return { fields: { ...NULL_CONVERSIONS } };
  }

  try {
    const conversions = await convertDual(amount, normalizedCurrency, targets, date);
    const fields: ConversionFields = { ...NULL_CONVERSIONS };

    const tripConversion = tripCurrency ? conversions[tripCurrency] : undefined;
    if (tripConversion) {
      fields.convertedAmountTrip = tripConversion.convertedAmount.toString();
      fields.conversionRateTrip = tripConversion.rate.toString();
      fields.convertedCurrencyTrip = tripCurrency;
    }

    const profileConversion = profileCurrency ? conversions[profileCurrency] : undefined;
    if (profileConversion) {
      fields.convertedAmountProfile = profileConversion.convertedAmount.toString();
      fields.conversionRateProfile = profileConversion.rate.toString();
      fields.convertedCurrencyProfile = profileCurrency;
    }

    return { fields };
  } catch {
    return { fields: { ...NULL_CONVERSIONS }, conversionError: true };
  }
}

/** Recalculate every trip conversion in the caller's transaction. */
export async function recalculateTripExpenses(
  transaction: DbTransaction,
  tripId: string,
  currency: string | null
): Promise<number> {
  const rows = await transaction.select().from(expenses).where(eq(expenses.tripId, tripId));
  const mapped = rows.map(dbExpenseToType);
  if (!currency) {
    await recalculate(mapped, "");
    return 0;
  }
  const target = currency.toUpperCase();
  const results = await recalculateAll(mapped, target);
  const native = rows
    .filter((row) => row.currency.toUpperCase() === target)
    .map((row) => ({ expenseId: row.id, convertedAmount: row.amount, rate: 1 }));
  const updates = [...results, ...native];
  for (const result of updates) {
    await transaction
      .update(expenses)
      .set({
        convertedAmountTrip: result.convertedAmount.toString(),
        conversionRateTrip: result.rate.toString(),
        convertedCurrencyTrip: target,
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, result.expenseId));
  }
  return updates.length;
}

export async function recalculateExpenseConversions(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<{ recalculated: true }> {
  tripId = contract.params.parse({ tripId }).tripId;
  const body = contract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite(actor, tripId, { replay, payload: body }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
    },
    mutate: async () => {
      const [trip] = await transaction
        .select({ budgetCurrency: trips.budgetCurrency })
        .from(trips)
        .where(eq(trips.id, tripId));
      if (!trip) throw new TripNotFoundError();
      if (await recalculateTripExpenses(transaction, tripId, trip.budgetCurrency)) markChanged();
      return { recalculated: true as const };
    },
  }));
}
