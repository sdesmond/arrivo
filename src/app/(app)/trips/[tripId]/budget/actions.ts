"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { expenses, trips, users } from "@/db/schema";
import { ExpenseCategory, type CreateExpenseInput, type UpdateExpensePatch } from "@/data/types";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { convertDual, recalculate } from "@/lib/currency";
import { dbExpenseToType } from "@/lib/db-mappers";

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
 * expense saves unconverted and the client is signalled via the returned flag.
 */
async function computeConversions(
  tripId: string,
  userId: string,
  amount: number,
  currency: string,
  date: string
): Promise<{ fields: ConversionFields; conversionError?: boolean }> {
  const normalizedCurrency = currency.toUpperCase();

  const [[tripRow], [userRow]] = await Promise.all([
    db.select({ budgetCurrency: trips.budgetCurrency }).from(trips).where(eq(trips.id, tripId)),
    db.select({ currency: users.currency }).from(users).where(eq(users.id, userId)),
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

function validateExpenseCategory(category: string): asserts category is CreateExpenseInput["category"] {
  if (!VALID_EXPENSE_CATEGORIES.has(category as CreateExpenseInput["category"])) {
    throw new Error("Expense category is required.");
  }
}

const MAX_EXPENSE_AMOUNT = 50000;

function validateAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than 0.");
  }

  if (amount > MAX_EXPENSE_AMOUNT) {
    throw new Error("Amount must be 50,000 or less.");
  }

  const decimalStr = String(amount);
  const decimalIndex = decimalStr.indexOf(".");
  if (decimalIndex !== -1 && decimalStr.length - decimalIndex - 1 > 2) {
    throw new Error("Amount must have at most 2 decimal places.");
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

  if (input.eventId && input.reservationId) {
    throw new Error("Expense cannot be linked to both an event and a reservation.");
  }
}

export async function createExpense(
  tripId: string,
  input: CreateExpenseInput
): Promise<{ id: string; conversionError?: boolean }> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  validateCreateExpenseInput(input);

  const currency = input.currency.trim().toUpperCase();
  const { fields, conversionError } = await computeConversions(tripId, user.id!, input.amount, currency, input.date);

  const [createdExpense] = await db
    .insert(expenses)
    .values({
      tripId,
      eventId: input.eventId ?? null,
      reservationId: input.reservationId ?? null,
      category: input.category,
      amount: input.amount.toString(),
      currency,
      ...fields,
      date: input.date,
      note: input.note?.trim() || null,
    })
    .returning({ id: expenses.id });

  revalidatePath(`/trips/${tripId}`);
  return { id: createdExpense.id, ...(conversionError ? { conversionError: true } : {}) };
}

export async function updateExpense(
  expenseId: string,
  patch: UpdateExpensePatch
): Promise<{ conversionError?: boolean } | void> {
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

  if (patch.currency !== undefined && patch.currency !== null && !patch.currency.trim()) {
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

  let conversionError: boolean | undefined;

  const conversionAffected = patch.amount !== undefined || patch.currency !== undefined || patch.date !== undefined;

  if (conversionAffected) {
    const nextAmount = patch.amount ?? Number(expenseRow.amount ?? 0);
    const nextCurrency = (patch.currency ?? expenseRow.currency).trim();
    const nextDate = patch.date ?? expenseRow.date;
    const { fields, conversionError: error } = await computeConversions(
      expenseRow.tripId,
      user.id!,
      nextAmount,
      nextCurrency,
      nextDate
    );
    Object.assign(updates, fields);
    conversionError = error;
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

  if (conversionError) {
    return { conversionError: true };
  }
}

export async function recalculateConversions(tripId: string): Promise<{ recalculated: true }> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  const [tripRow] = await db.select({ budgetCurrency: trips.budgetCurrency }).from(trips).where(eq(trips.id, tripId));
  const tripCurrency = (tripRow?.budgetCurrency ?? "").toUpperCase();

  const expenseRows = await db.select().from(expenses).where(eq(expenses.tripId, tripId));
  const tripExpenses = expenseRows.map(dbExpenseToType);

  const results = await recalculate(tripExpenses, tripCurrency);

  await Promise.all(
    results.map((result) =>
      db
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

  revalidatePath(`/trips/${tripId}`);
  return { recalculated: true };
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
