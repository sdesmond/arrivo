import { z } from "zod";
import { ExpenseCategory, type Expense, type ExpenseWithConversionFlag } from "@/data/types";
import { FIELD_LIMITS, isValidIsoDate, MAX_EXPENSE_AMOUNT, overLimitMessage } from "@/lib/validation-limits";
import { isSupportedCurrencyCode } from "@/lib/currencies";
import { defineEndpoint } from "../endpoint";

const uuidLower = z.uuid().toLowerCase();
const params = z.object({ tripId: uuidLower });
const path = "/api/v1/trips/:tripId/expenses";

export const listExpenses = defineEndpoint<{ expenses: Expense[] }>()({
  method: "GET",
  path,
  params,
  body: z.strictObject({}),
});

/** Whole cents only: tolerant of float noise such as 0.07 * 100. */
function hasAtMostTwoDecimals(amount: number): boolean {
  return Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
}

const fields = {
  category: z.enum(Object.values(ExpenseCategory) as [ExpenseCategory, ...ExpenseCategory[]], {
    error: "Expense category is required.",
  }),
  amount: z
    .number()
    .refine((amount) => Number.isFinite(amount) && amount > 0, { message: "Amount must be greater than 0." })
    .refine((amount) => !(amount > 0) || amount >= 0.01, { message: "Amount must be at least 0.01." })
    .refine((amount) => amount <= MAX_EXPENSE_AMOUNT, { message: "Amount must be 50,000 or less." })
    .refine(hasAtMostTwoDecimals, { message: "Amount must have at most 2 decimal places." }),
  currency: z
    .string()
    .trim()
    .min(1, "Currency is required.")
    .refine((code) => isSupportedCurrencyCode(code.toUpperCase()), { message: "Unsupported currency." }),
  date: z.string().refine(isValidIsoDate, { message: "Date is required." }),
  note: z
    .string()
    .max(FIELD_LIMITS.expenseNote, overLimitMessage("Note", FIELD_LIMITS.expenseNote))
    .nullable()
    .optional(),
  eventId: uuidLower.nullable().optional(),
  reservationId: uuidLower.nullable().optional(),
};

const singleLink = {
  check: (body: { eventId?: string | null; reservationId?: string | null }) => !(body.eventId && body.reservationId),
  message: "Expense cannot be linked to both an event and a reservation.",
  path: ["reservationId"],
};

/**
 * Creates a trip expense, converted to the trip and profile currencies. A failed rate lookup still saves the expense
 * and flags `conversionError`. The expense links to at most one event or reservation of the trip.
 */
export const createExpense = defineEndpoint<ExpenseWithConversionFlag>()({
  method: "POST",
  path,
  params,
  body: z
    .strictObject({ id: uuidLower, ...fields })
    .refine(singleLink.check, { message: singleLink.message, path: singleLink.path }),
});

const expenseParams = z.object({ expenseId: uuidLower });
const expensePath = "/api/v1/expenses/:expenseId";

/**
 * Absent leaves a field alone; `null` clears the note or a link. Conversions are recomputed only when the amount,
 * currency or date changes, and a failed rate lookup still saves and flags `conversionError`. The merged result links to
 * at most one event or reservation of the trip.
 */
export const updateExpense = defineEndpoint<ExpenseWithConversionFlag>()({
  method: "PATCH",
  path: expensePath,
  params: expenseParams,
  body: z
    .strictObject({
      category: fields.category.optional(),
      amount: fields.amount.optional(),
      currency: fields.currency.optional(),
      date: fields.date.optional(),
      note: fields.note,
      eventId: fields.eventId,
      reservationId: fields.reservationId,
    })
    .refine(singleLink.check, { message: singleLink.message, path: singleLink.path }),
});

/** Deleting an expense that is already gone succeeds. */
export const deleteExpense = defineEndpoint<null>()({
  method: "DELETE",
  path: expensePath,
  status: 204,
  params: expenseParams,
  body: z.strictObject({}),
});

/** Recalculates trip-currency conversions using the persisted budget currency. */
export const recalculateExpenses = defineEndpoint<{ recalculated: true }>()({
  method: "POST",
  path: "/api/v1/trips/:tripId/expenses/recalculate",
  params,
  body: z.strictObject({}),
});
