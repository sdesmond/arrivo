// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, db, expensesTable, requireUser, revalidatePath } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  db: {
    delete: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
  expensesTable: { id: "expenses.id", tripId: "expenses.tripId" },
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
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
}));

vi.mock("next/cache", () => ({
  revalidatePath,
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
      values: () => ({
        returning: async () => {
          insertedExpenseValues = db.insert.mock.calls.at(-1)?.[0] ? insertedExpenseValues : insertedExpenseValues;
          return [{ id: "expense-1" }];
        },
      }),
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
    db.insert.mockReturnValue({
      values: (values: Record<string, unknown>) => {
        insertedExpenseValues = values;
        return {
          returning: async () => [{ id: "expense-1" }],
        };
      },
    });

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

  it("updates an expense after loading trip ownership", async () => {
    db.select.mockReturnValueOnce(createSelectMock([{ tripId: "trip-1" }]));

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
