// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assertTripAccess,
  convertDual,
  db,
  expensesTable,
  requireUser,
  revalidatePath,
  toastError,
  tripsTable,
  usersTable,
} = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  convertDual: vi.fn(),
  db: {
    delete: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
  expensesTable: { id: "expenses.id", tripId: "expenses.tripId" },
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  toastError: vi.fn(),
  tripsTable: { id: "trips.id", budgetCurrency: "trips.budgetCurrency" },
  usersTable: { id: "users.id", currency: "users.currency" },
}));

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess,
  requireUser,
}));

vi.mock("@/db", () => ({
  db,
}));

vi.mock("@/db/schema", () => ({
  expenses: expensesTable,
  trips: tripsTable,
  users: usersTable,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/currency", () => ({
  convertDual,
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

import { createExpense, updateExpense, deleteExpense } from "./actions";
import { ExpenseCategory } from "@/data/types";

function createSelectMock(rows: unknown[]) {
  return {
    from: () => ({
      where: async () => rows,
    }),
  };
}

/** Queue the trip-currency then profile-currency lookups used by computeConversions. */
function mockCurrencyLookups(budgetCurrency: string | null, profileCurrency: string | null) {
  db.select
    .mockReturnValueOnce(createSelectMock([{ budgetCurrency }]))
    .mockReturnValueOnce(createSelectMock([{ currency: profileCurrency }]));
}

describe("budget actions", () => {
  let insertedExpenseValues: Record<string, unknown> | undefined;
  let updatedExpenseValues: Record<string, unknown> | undefined;
  let deletedWhere: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    insertedExpenseValues = undefined;
    updatedExpenseValues = undefined;
    deletedWhere = vi.fn().mockResolvedValue(undefined);

    db.insert.mockReturnValue({
      values: (values: Record<string, unknown>) => {
        insertedExpenseValues = values;
        return {
          returning: async () => [{ id: "expense-1" }],
        };
      },
    });

    db.update.mockReturnValue({
      set: (values: Record<string, unknown>) => {
        updatedExpenseValues = values;
        return { where: () => ({ returning: async () => [{ id: "expense-1" }] }) };
      },
    });

    db.delete.mockReturnValue({
      where: deletedWhere,
    });
  });

  it("creates an expense after auth checks and revalidates the trip", async () => {
    mockCurrencyLookups("USD", "USD");

    const result = await createExpense("trip-1", {
      eventId: "event-1",
      category: ExpenseCategory.Activity,
      amount: 120.5,
      currency: "USD",
      date: "2026-08-01",
      note: "Museum tickets",
    });

    expect(requireUser).toHaveBeenCalledOnce();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(convertDual).not.toHaveBeenCalled();
    expect(insertedExpenseValues).toEqual({
      tripId: "trip-1",
      eventId: "event-1",
      reservationId: null,
      category: ExpenseCategory.Activity,
      amount: "120.5",
      currency: "USD",
      convertedAmountTrip: null,
      conversionRateTrip: null,
      convertedCurrencyTrip: null,
      convertedAmountProfile: null,
      conversionRateProfile: null,
      convertedCurrencyProfile: null,
      date: "2026-08-01",
      note: "Museum tickets",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(result).toBe("expense-1");
  });

  it("rejects an expense without a linked event or reservation", async () => {
    await expect(
      createExpense("trip-1", {
        category: ExpenseCategory.Food,
        amount: 18,
        currency: "USD",
        date: "2026-08-01",
      })
    ).rejects.toThrow("Expense must be linked to an event or reservation.");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("stores dual conversions when the entry currency differs from the trip and profile currencies", async () => {
    mockCurrencyLookups("EUR", "GBP");
    convertDual.mockResolvedValue({
      EUR: { convertedAmount: 92, rate: 0.92 },
      GBP: { convertedAmount: 79, rate: 0.79 },
    });

    await createExpense("trip-1", {
      eventId: "event-1",
      category: ExpenseCategory.Activity,
      amount: 100,
      currency: "USD",
      date: "2026-08-01",
    });

    expect(convertDual).toHaveBeenCalledWith(100, "USD", ["EUR", "GBP"], "2026-08-01");
    expect(insertedExpenseValues).toMatchObject({
      convertedAmountTrip: "92",
      conversionRateTrip: "0.92",
      convertedCurrencyTrip: "EUR",
      convertedAmountProfile: "79",
      conversionRateProfile: "0.79",
      convertedCurrencyProfile: "GBP",
    });
  });

  it("stores null conversions and makes no API call when the entry currency matches both targets", async () => {
    mockCurrencyLookups("USD", "USD");

    await createExpense("trip-1", {
      eventId: "event-1",
      category: ExpenseCategory.Food,
      amount: 40,
      currency: "USD",
      date: "2026-08-01",
    });

    expect(convertDual).not.toHaveBeenCalled();
    expect(insertedExpenseValues).toMatchObject({
      convertedAmountTrip: null,
      convertedCurrencyTrip: null,
      convertedAmountProfile: null,
      convertedCurrencyProfile: null,
    });
  });

  it("saves the expense unconverted and shows a toast when conversion fails", async () => {
    mockCurrencyLookups("EUR", "GBP");
    convertDual.mockRejectedValue(new Error("Frankfurter unavailable"));

    const result = await createExpense("trip-1", {
      eventId: "event-1",
      category: ExpenseCategory.Activity,
      amount: 100,
      currency: "USD",
      date: "2026-08-01",
    });

    expect(result).toBe("expense-1");
    expect(toastError).toHaveBeenCalledWith("Couldn't convert currency — try again.");
    expect(insertedExpenseValues).toMatchObject({
      convertedAmountTrip: null,
      convertedCurrencyTrip: null,
      convertedAmountProfile: null,
      convertedCurrencyProfile: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("updates an expense after loading trip ownership", async () => {
    db.select.mockReturnValueOnce(
      createSelectMock([{ tripId: "trip-1", amount: "100", currency: "USD", date: "2026-08-01" }])
    );
    mockCurrencyLookups("USD", "USD");

    await updateExpense("expense-1", {
      amount: 55.25,
      category: ExpenseCategory.Transport,
      note: "Airport train",
    });

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(updatedExpenseValues).toMatchObject({
      amount: "55.25",
      category: ExpenseCategory.Transport,
      note: "Airport train",
      updatedAt: expect.any(Date),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("recomputes conversions using the merged values when amount, currency, or date changes", async () => {
    db.select.mockReturnValueOnce(
      createSelectMock([{ tripId: "trip-1", amount: "100", currency: "USD", date: "2026-08-01" }])
    );
    mockCurrencyLookups("EUR", "JPY");
    convertDual.mockResolvedValue({
      EUR: { convertedAmount: 92, rate: 0.92 },
      JPY: { convertedAmount: 15000, rate: 150 },
    });

    await updateExpense("expense-1", { currency: "GBP" });

    expect(convertDual).toHaveBeenCalledWith(100, "GBP", ["EUR", "JPY"], "2026-08-01");
    expect(updatedExpenseValues).toMatchObject({
      convertedAmountTrip: "92",
      convertedCurrencyTrip: "EUR",
      convertedAmountProfile: "15000",
      convertedCurrencyProfile: "JPY",
    });
  });

  it("leaves stored conversions untouched when only unrelated fields change", async () => {
    db.select.mockReturnValueOnce(
      createSelectMock([{ tripId: "trip-1", amount: "100", currency: "USD", date: "2026-08-01" }])
    );

    await updateExpense("expense-1", { note: "Updated note" });

    expect(convertDual).not.toHaveBeenCalled();
    expect(updatedExpenseValues).not.toHaveProperty("convertedAmountTrip");
    expect(updatedExpenseValues).not.toHaveProperty("convertedCurrencyProfile");
  });

  it("throws when updating a missing expense", async () => {
    db.select.mockReturnValueOnce(createSelectMock([]));

    await expect(updateExpense("missing", { amount: 10 })).rejects.toThrow("Expense not found.");

    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("deletes an expense after auth checks", async () => {
    db.select.mockReturnValueOnce(createSelectMock([{ tripId: "trip-1" }]));

    await deleteExpense("expense-1");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(deletedWhere).toHaveBeenCalledWith(expect.anything());
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("returns silently when deleting a missing expense", async () => {
    db.select.mockReturnValueOnce(createSelectMock([]));

    await expect(deleteExpense("missing")).resolves.toBeUndefined();

    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });
});
