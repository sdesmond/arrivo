// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, db, expensesTable, recalculate, recordTripUpdated, requireUser, revalidatePath, tripsTable } =
  vi.hoisted(() => ({
    assertTripAccess: vi.fn(),
    db: {
      select: vi.fn(),
      transaction: vi.fn(),
    },
    expensesTable: { id: "expenses.id", tripId: "expenses.tripId" },
    recalculate: vi.fn(),
    recordTripUpdated: vi.fn(),
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    tripsTable: { id: "trips.id", budgetCurrency: "trips.budgetCurrency" },
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
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/trip-activity", () => ({ recordTripUpdated }));

vi.mock("@/lib/currency", () => ({
  recalculate,
}));

import { recalculateConversions } from "./actions";
import { ExpenseCategory } from "@/data/types";

function createSelectMock(rows: unknown[]) {
  return {
    from: () => ({
      where: async () => rows,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "user-1" });
  assertTripAccess.mockResolvedValue(undefined);
});

describe("recalculateConversions", () => {
  function makeExpenseRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "expense-1",
      tripId: "trip-1",
      eventId: null,
      reservationId: null,
      category: ExpenseCategory.Food,
      amount: "50",
      currency: "EUR",
      convertedAmountTrip: null,
      conversionRateTrip: null,
      convertedCurrencyTrip: null,
      convertedAmountProfile: null,
      conversionRateProfile: null,
      convertedCurrencyProfile: null,
      date: "2026-08-01",
      note: null,
      createdAt: null,
      updatedAt: null,
      ...overrides,
    };
  }

  function mockTransaction() {
    const tx = { select: vi.fn(), update: vi.fn() };
    const updateWhereSpy = vi.fn().mockResolvedValue(undefined);
    let lastSetValues: Record<string, unknown> | undefined;
    tx.update.mockReturnValue({
      set: (values: Record<string, unknown>) => {
        lastSetValues = values;
        return { where: updateWhereSpy };
      },
    });
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
    return { tx, updateWhereSpy, getLastSetValues: () => lastSetValues };
  }

  it("requires auth", async () => {
    requireUser.mockRejectedValue(new Error("Unauthorized"));

    await expect(recalculateConversions("trip-1")).rejects.toThrow("Unauthorized");

    expect(assertTripAccess).not.toHaveBeenCalled();
  });

  it("requires editor access", async () => {
    assertTripAccess.mockRejectedValue(new Error("Forbidden"));

    await expect(recalculateConversions("trip-1")).rejects.toThrow("Forbidden");

    expect(db.select).not.toHaveBeenCalled();
  });

  it("records no Activity when recalculation updates no expenses", async () => {
    const { tx } = mockTransaction();
    tx.select
      .mockReturnValueOnce(createSelectMock([{ budgetCurrency: "USD" }]))
      .mockReturnValueOnce(createSelectMock([]));
    recalculate.mockResolvedValue([]);

    await recalculateConversions("trip-1");

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("recalculates conversions for mismatched expenses and revalidates", async () => {
    const { tx, updateWhereSpy, getLastSetValues } = mockTransaction();
    tx.select
      .mockReturnValueOnce(createSelectMock([{ budgetCurrency: "USD" }]))
      .mockReturnValueOnce(createSelectMock([makeExpenseRow({ id: "expense-1", currency: "EUR" })]));
    recalculate.mockResolvedValue([{ expenseId: "expense-1", convertedAmount: 54, rate: 1.08 }]);

    const result = await recalculateConversions("trip-1");

    expect(requireUser).toHaveBeenCalledOnce();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(recalculate).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "expense-1", currency: "EUR", amount: 50 })],
      "USD"
    );
    expect(getLastSetValues()).toEqual({
      convertedAmountTrip: "54",
      conversionRateTrip: "1.08",
      convertedCurrencyTrip: "USD",
      updatedAt: expect.any(Date),
    });
    expect(updateWhereSpy).toHaveBeenCalledWith(expect.anything());
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(result).toEqual({ recalculated: true });
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("stamps updatedAt on recalculated rows so a future call sees the fixed rate as no-longer-stale", async () => {
    const { tx, getLastSetValues } = mockTransaction();
    tx.select
      .mockReturnValueOnce(createSelectMock([{ budgetCurrency: "USD" }]))
      .mockReturnValueOnce(createSelectMock([makeExpenseRow({ id: "expense-1", currency: "EUR" })]));
    recalculate.mockResolvedValue([{ expenseId: "expense-1", convertedAmount: 54, rate: 1.08 }]);

    const before = Date.now();
    await recalculateConversions("trip-1");
    const after = Date.now();

    const updatedAt = getLastSetValues()?.updatedAt as Date;
    expect(updatedAt).toBeInstanceOf(Date);
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(updatedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("only updates expenses included in recalculate's results (skips matches)", async () => {
    const { tx } = mockTransaction();
    tx.select
      .mockReturnValueOnce(createSelectMock([{ budgetCurrency: "USD" }]))
      .mockReturnValueOnce(
        createSelectMock([
          makeExpenseRow({ id: "expense-1", currency: "EUR" }),
          makeExpenseRow({ id: "expense-2", currency: "USD" }),
        ])
      );
    recalculate.mockResolvedValue([{ expenseId: "expense-1", convertedAmount: 54, rate: 1.08 }]);

    await recalculateConversions("trip-1");

    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it("throws and updates nothing when recalculate fails (all-or-nothing)", async () => {
    const { tx } = mockTransaction();
    tx.select
      .mockReturnValueOnce(createSelectMock([{ budgetCurrency: "USD" }]))
      .mockReturnValueOnce(createSelectMock([makeExpenseRow({ id: "expense-1", currency: "EUR" })]));
    recalculate.mockRejectedValue(new Error("Currency conversion failed (HTTP 503)."));

    await expect(recalculateConversions("trip-1")).rejects.toThrow("Currency conversion failed (HTTP 503).");

    expect(tx.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });
});
