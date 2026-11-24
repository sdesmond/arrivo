import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trips, users } from "@/db/schema";
import { convertDual } from "@/lib/currency";

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
