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

/**
 * Creates a trip expense, converted to the trip and profile currencies. A failed rate lookup still saves the expense
 * and flags `conversionError`. The expense links to at most one event or reservation of the trip.
 */
export const createExpense = defineEndpoint<ExpenseWithConversionFlag>()({
  method: "POST",
  path,
  params,
  body: z
    .strictObject({
      id: uuidLower,
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
    })
    .refine((body) => !(body.eventId && body.reservationId), {
      message: "Expense cannot be linked to both an event and a reservation.",
      path: ["reservationId"],
    }),
});
