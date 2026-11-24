"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { events, expenses, reservations, trips } from "@/db/schema";
import { ExpenseCategory, type CreateExpenseInput, type UpdateExpensePatch } from "@/data/types";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { recalculate } from "@/lib/currency";
import { dbExpenseToType } from "@/lib/db-mappers";
import { recordDeletion } from "@/lib/services/deletion-records";
import { computeConversions } from "@/lib/services/expense-conversions";
import { recordTripUpdated } from "@/lib/trip-activity";
import { FIELD_LIMITS, isValidIsoDate, MAX_EXPENSE_AMOUNT, overLimitMessage } from "@/lib/validation-limits";

const VALID_EXPENSE_CATEGORIES = new Set(Object.values(ExpenseCategory));

function validateExpenseCategory(category: string): asserts category is CreateExpenseInput["category"] {
  if (!VALID_EXPENSE_CATEGORIES.has(category as CreateExpenseInput["category"])) {
    throw new Error("Expense category is required.");
  }
}

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
  if (!isValidIsoDate(value)) {
    throw new Error("Date is required.");
  }
}

function validateNote(note: string | null | undefined): void {
  if (note && note.length > FIELD_LIMITS.expenseNote) {
    throw new Error(overLimitMessage("Note", FIELD_LIMITS.expenseNote));
  }
}

function validateCreateExpenseInput(input: CreateExpenseInput): void {
  if (!input.currency.trim()) {
    throw new Error("Currency is required.");
  }

  validateExpenseCategory(input.category);
  validateAmount(input.amount);
  validateDate(input.date);
  validateNote(input.note);

  if (input.eventId && input.reservationId) {
    throw new Error("Expense cannot be linked to both an event and a reservation.");
  }
}

/**
 * An expense may only link to an event or reservation of its own trip. Ids come from the client, so
 * an editor on one trip could otherwise attach spend to (and read names via) another trip's rows.
 */
async function assertLinkTargetsInTrip(
  tripId: string,
  links: { eventId?: string | null; reservationId?: string | null }
): Promise<void> {
  if (links.eventId) {
    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, links.eventId), eq(events.tripId, tripId)));
    if (!event) throw new Error("Event not found.");
  }

  if (links.reservationId) {
    const [reservation] = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(and(eq(reservations.id, links.reservationId), eq(reservations.tripId, tripId)));
    if (!reservation) throw new Error("Reservation not found.");
  }
}

export async function createExpense(
  tripId: string,
  input: CreateExpenseInput
): Promise<{ id: string; conversionError?: boolean }> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  validateCreateExpenseInput(input);
  await assertLinkTargetsInTrip(tripId, input);

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

  recordTripUpdated(user.id!, tripId);
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

  validateNote(patch.note);

  if (patch.currency !== undefined && patch.currency !== null && !patch.currency.trim()) {
    throw new Error("Currency is required.");
  }

  await assertLinkTargetsInTrip(expenseRow.tripId, patch);

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

  recordTripUpdated(user.id!, expenseRow.tripId);
  revalidatePath(`/trips/${expenseRow.tripId}`);

  if (conversionError) {
    return { conversionError: true };
  }
}

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

export async function deleteExpense(expenseId: string): Promise<void> {
  const user = await requireUser();
  const [expenseRow] = await db.select({ tripId: expenses.tripId }).from(expenses).where(eq(expenses.id, expenseId));

  if (!expenseRow) {
    return;
  }

  await assertTripAccess(expenseRow.tripId, user.id!, "editor");
  await db.transaction(async (transaction) => {
    await transaction.delete(expenses).where(eq(expenses.id, expenseId));
    await recordDeletion(transaction, "expense", expenseId, user.id!);
  });
  recordTripUpdated(user.id!, expenseRow.tripId);
  revalidatePath(`/trips/${expenseRow.tripId}`);
}
