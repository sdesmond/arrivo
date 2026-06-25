"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { toast } from "sonner";
import { db } from "@/db";
import { expenses, trips, users } from "@/db/schema";
import { ExpenseCategory, type CreateExpenseInput, type UpdateExpensePatch } from "@/data/types";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { convertDual } from "@/lib/currency";

const VALID_EXPENSE_CATEGORIES = new Set(Object.values(ExpenseCategory));

interface ConversionFields {
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
 * expense saves unconverted and the user is shown a retry toast (FR-8 / UX-DR16).
 */
async function computeConversions(
  tripId: string,
  userId: string,
  amount: number,
  currency: string,
  date: string
): Promise<ConversionFields> {
  const [tripRow] = await db.select({ budgetCurrency: trips.budgetCurrency }).from(trips).where(eq(trips.id, tripId));
  const [userRow] = await db.select({ currency: users.currency }).from(users).where(eq(users.id, userId));

  const tripCurrency = tripRow?.budgetCurrency ?? null;
  const profileCurrency = userRow?.currency ?? null;

  const targets: string[] = [];
  if (tripCurrency && tripCurrency !== currency) targets.push(tripCurrency);
  if (profileCurrency && profileCurrency !== currency) targets.push(profileCurrency);

  if (targets.length === 0) {
    return { ...NULL_CONVERSIONS };
  }

  try {
    const conversions = await convertDual(amount, currency, targets, date);
    const fields: ConversionFields = { ...NULL_CONVERSIONS };

    if (tripCurrency && tripCurrency !== currency) {
      const tripConversion = conversions[tripCurrency];
      fields.convertedAmountTrip = tripConversion.convertedAmount.toString();
      fields.conversionRateTrip = tripConversion.rate.toString();
      fields.convertedCurrencyTrip = tripCurrency;
    }

    if (profileCurrency && profileCurrency !== currency) {
      const profileConversion = conversions[profileCurrency];
      fields.convertedAmountProfile = profileConversion.convertedAmount.toString();
      fields.conversionRateProfile = profileConversion.rate.toString();
      fields.convertedCurrencyProfile = profileCurrency;
    }

    return fields;
  } catch {
    toast.error("Couldn't convert currency — try again.");
    return { ...NULL_CONVERSIONS };
  }
}

function validateExpenseCategory(category: string): asserts category is CreateExpenseInput["category"] {
  if (!VALID_EXPENSE_CATEGORIES.has(category as CreateExpenseInput["category"])) {
    throw new Error("Expense category is required.");
  }
}

function validateAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be a valid number.");
  }
}

function validateDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Date is required.");
  }
}

function validateCreateExpenseInput(input: CreateExpenseInput): void {
  if (!input.currency.trim()) {
    throw new Error("Currency is required.");
  }

  validateExpenseCategory(input.category);
  validateAmount(input.amount);
  validateDate(input.date);

  if (!input.eventId && !input.reservationId) {
    throw new Error("Expense must be linked to an event or reservation.");
  }

  if (input.eventId && input.reservationId) {
    throw new Error("Expense cannot be linked to both an event and a reservation.");
  }
}

export async function createExpense(tripId: string, input: CreateExpenseInput): Promise<string> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  validateCreateExpenseInput(input);

  const currency = input.currency.trim();
  const conversions = await computeConversions(tripId, user.id!, input.amount, currency, input.date);

  const [createdExpense] = await db
    .insert(expenses)
    .values({
      tripId,
      eventId: input.eventId ?? null,
      reservationId: input.reservationId ?? null,
      category: input.category,
      amount: input.amount.toString(),
      currency,
      ...conversions,
      date: input.date,
      note: input.note?.trim() || null,
    })
    .returning({ id: expenses.id });

  revalidatePath(`/trips/${tripId}`);
  return createdExpense.id;
}

export async function updateExpense(expenseId: string, patch: UpdateExpensePatch): Promise<void> {
  const user = await requireUser();
  const [expenseRow] = await db
    .select({
      tripId: expenses.tripId,
      amount: expenses.amount,
      currency: expenses.currency,
      date: expenses.date,
    })
    .from(expenses)
    .where(eq(expenses.id, expenseId));

  if (!expenseRow) {
    throw new Error("Expense not found.");
  }

  await assertTripAccess(expenseRow.tripId, user.id!, "editor");

  if (patch.category !== undefined) {
    validateExpenseCategory(patch.category);
  }

  if (patch.amount !== undefined) {
    validateAmount(patch.amount);
  }

  if (patch.date !== undefined) {
    validateDate(patch.date);
  }

  if (patch.currency !== undefined && !patch.currency.trim()) {
    throw new Error("Currency is required.");
  }

  const updates: Partial<typeof expenses.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (patch.eventId !== undefined) updates.eventId = patch.eventId;
  if (patch.reservationId !== undefined) updates.reservationId = patch.reservationId;
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.amount !== undefined) updates.amount = patch.amount.toString();
  if (patch.currency !== undefined) updates.currency = patch.currency.trim();
  if (patch.date !== undefined) updates.date = patch.date;
  if (patch.note !== undefined) updates.note = patch.note?.trim() || null;

  // Conversions are recomputed server-side whenever amount, currency, or date
  // changes — no stale values carried forward (FR-8 editing rule). Unrelated
  // edits leave the stored conversions untouched.
  const conversionAffected = patch.amount !== undefined || patch.currency !== undefined || patch.date !== undefined;

  if (conversionAffected) {
    const nextAmount = patch.amount ?? Number(expenseRow.amount);
    const nextCurrency = (patch.currency ?? expenseRow.currency).trim();
    const nextDate = patch.date ?? expenseRow.date;
    const conversions = await computeConversions(expenseRow.tripId, user.id!, nextAmount, nextCurrency, nextDate);
    Object.assign(updates, conversions);
  }

  const [updatedRow] = await db
    .update(expenses)
    .set(updates)
    .where(eq(expenses.id, expenseId))
    .returning({ id: expenses.id });

  if (!updatedRow) {
    throw new Error("Expense was deleted before update could complete.");
  }

  revalidatePath(`/trips/${expenseRow.tripId}`);
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const user = await requireUser();
  const [expenseRow] = await db.select({ tripId: expenses.tripId }).from(expenses).where(eq(expenses.id, expenseId));

  if (!expenseRow) {
    return;
  }

  await assertTripAccess(expenseRow.tripId, user.id!, "editor");
  await db.delete(expenses).where(eq(expenses.id, expenseId));
  revalidatePath(`/trips/${expenseRow.tripId}`);
}
