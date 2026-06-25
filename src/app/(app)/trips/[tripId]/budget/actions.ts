"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { ExpenseCategory, type CreateExpenseInput, type UpdateExpensePatch } from "@/data/types";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";

const VALID_EXPENSE_CATEGORIES = new Set(Object.values(ExpenseCategory));

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
}

export async function createExpense(tripId: string, input: CreateExpenseInput): Promise<string> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  validateCreateExpenseInput(input);

  const [createdExpense] = await db
    .insert(expenses)
    .values({
      tripId,
      eventId: input.eventId ?? null,
      reservationId: input.reservationId ?? null,
      category: input.category,
      amount: input.amount.toString(),
      currency: input.currency.trim(),
      convertedAmountTrip: input.convertedAmountTrip?.toString() ?? null,
      conversionRateTrip: input.conversionRateTrip?.toString() ?? null,
      convertedCurrencyTrip: input.convertedCurrencyTrip ?? null,
      convertedAmountProfile: input.convertedAmountProfile?.toString() ?? null,
      conversionRateProfile: input.conversionRateProfile?.toString() ?? null,
      convertedCurrencyProfile: input.convertedCurrencyProfile ?? null,
      date: input.date,
      note: input.note?.trim() || null,
    })
    .returning({ id: expenses.id });

  revalidatePath(`/trips/${tripId}`);
  return createdExpense.id;
}

export async function updateExpense(expenseId: string, patch: UpdateExpensePatch): Promise<void> {
  const user = await requireUser();
  const [expenseRow] = await db.select({ tripId: expenses.tripId }).from(expenses).where(eq(expenses.id, expenseId));

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

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (patch.eventId !== undefined) updates.eventId = patch.eventId;
  if (patch.reservationId !== undefined) updates.reservationId = patch.reservationId;
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.amount !== undefined) updates.amount = patch.amount.toString();
  if (patch.currency !== undefined) updates.currency = patch.currency.trim();
  if (patch.date !== undefined) updates.date = patch.date;
  if (patch.note !== undefined) updates.note = patch.note?.trim() || null;
  if (patch.convertedAmountTrip !== undefined)
    updates.convertedAmountTrip = patch.convertedAmountTrip?.toString() ?? null;
  if (patch.conversionRateTrip !== undefined) updates.conversionRateTrip = patch.conversionRateTrip?.toString() ?? null;
  if (patch.convertedCurrencyTrip !== undefined) updates.convertedCurrencyTrip = patch.convertedCurrencyTrip;
  if (patch.convertedAmountProfile !== undefined) {
    updates.convertedAmountProfile = patch.convertedAmountProfile?.toString() ?? null;
  }
  if (patch.conversionRateProfile !== undefined) {
    updates.conversionRateProfile = patch.conversionRateProfile?.toString() ?? null;
  }
  if (patch.convertedCurrencyProfile !== undefined) updates.convertedCurrencyProfile = patch.convertedCurrencyProfile;

  await db.update(expenses).set(updates).where(eq(expenses.id, expenseId));
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
