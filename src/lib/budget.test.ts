import { describe, expect, it } from "vitest";
import { calculateActual, calculateCategoryBreakdown, hasCurrencyMismatch, needsRecalculation } from "./budget";
import { ExpenseCategory } from "@/data/types";
import type { Expense } from "@/data/types";

const NOW = new Date("2026-06-26T12:00:00.000Z");

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    tripId: "trip-1",
    category: ExpenseCategory.Misc,
    amount: 10,
    currency: "USD",
    convertedAmountTrip: 10,
    date: "2026-08-01",
    ...overrides,
  };
}

describe("calculateActual", () => {
  it("returns 0 for an empty array", () => {
    expect(calculateActual([], "USD")).toBe(0);
  });

  it("sums convertedAmountTrip across multiple expenses", () => {
    const expenses = [
      makeExpense({ id: "a", convertedAmountTrip: 12.5 }),
      makeExpense({ id: "b", convertedAmountTrip: 7.5 }),
      makeExpense({ id: "c", convertedAmountTrip: 100 }),
    ];

    expect(calculateActual(expenses, "USD")).toBe(120);
  });

  it("falls back to raw amount when convertedAmountTrip is null/undefined", () => {
    const expenses = [
      makeExpense({ id: "a", amount: 30, convertedAmountTrip: undefined }),
      makeExpense({ id: "b", amount: 5, convertedAmountTrip: 20 }),
    ];

    expect(calculateActual(expenses, "USD")).toBe(50);
  });

  it("ignores source currency since convertedAmountTrip is already in Trip Currency", () => {
    const expenses = [
      makeExpense({ id: "a", currency: "EUR", convertedAmountTrip: 40 }),
      makeExpense({ id: "b", currency: "JPY", convertedAmountTrip: 60 }),
    ];

    expect(calculateActual(expenses, "USD")).toBe(100);
  });
});

describe("calculateCategoryBreakdown", () => {
  it("returns an empty array for no expenses", () => {
    expect(calculateCategoryBreakdown([], "USD")).toEqual([]);
  });

  it("groups by category and sums converted amounts", () => {
    const expenses = [
      makeExpense({ id: "a", category: ExpenseCategory.Food, convertedAmountTrip: 20 }),
      makeExpense({ id: "b", category: ExpenseCategory.Food, convertedAmountTrip: 30 }),
      makeExpense({ id: "c", category: ExpenseCategory.Lodging, convertedAmountTrip: 200 }),
    ];

    const breakdown = calculateCategoryBreakdown(expenses, "USD");

    expect(breakdown).toEqual([
      { category: ExpenseCategory.Lodging, subtotal: 200, count: 1 },
      { category: ExpenseCategory.Food, subtotal: 50, count: 2 },
    ]);
  });

  it("falls back to raw amount when convertedAmountTrip is null/undefined", () => {
    const expenses = [
      makeExpense({ id: "a", category: ExpenseCategory.Gas, amount: 15, convertedAmountTrip: undefined }),
    ];

    expect(calculateCategoryBreakdown(expenses, "USD")).toEqual([
      { category: ExpenseCategory.Gas, subtotal: 15, count: 1 },
    ]);
  });

  it("omits categories with zero items (only present categories appear)", () => {
    const expenses = [makeExpense({ id: "a", category: ExpenseCategory.Transport, convertedAmountTrip: 42 })];

    const breakdown = calculateCategoryBreakdown(expenses, "USD");

    expect(breakdown).toHaveLength(1);
    expect(breakdown.map((tile) => tile.category)).toEqual([ExpenseCategory.Transport]);
  });

  it("returns items sorted by subtotal descending", () => {
    const expenses = [
      makeExpense({ id: "a", category: ExpenseCategory.Food, convertedAmountTrip: 10 }),
      makeExpense({ id: "b", category: ExpenseCategory.Lodging, convertedAmountTrip: 500 }),
      makeExpense({ id: "c", category: ExpenseCategory.Activity, convertedAmountTrip: 75 }),
    ];

    const breakdown = calculateCategoryBreakdown(expenses, "USD");

    expect(breakdown.map((tile) => tile.subtotal)).toEqual([500, 75, 10]);
  });
});

describe("needsRecalculation", () => {
  it("returns false when currency matches the trip currency, regardless of date", () => {
    const expense = makeExpense({ currency: "USD", date: "2024-01-01" });

    expect(needsRecalculation(expense, "USD", NOW)).toBe(false);
  });

  it("compares currencies case-insensitively", () => {
    const expense = makeExpense({ currency: "usd", date: "2024-01-01" });

    expect(needsRecalculation(expense, "USD", NOW)).toBe(false);
    expect(needsRecalculation(expense, "usd", NOW)).toBe(false);
  });

  it("returns true for a future-dated mismatched expense, regardless of when it was last computed", () => {
    const expense = makeExpense({
      currency: "EUR",
      date: "2026-07-15",
      updatedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(needsRecalculation(expense, "USD", NOW)).toBe(true);
  });

  it("returns true for a past-dated mismatched expense with no createdAt/updatedAt (conservative default)", () => {
    const expense = makeExpense({ currency: "EUR", date: "2024-01-01" });

    expect(needsRecalculation(expense, "USD", NOW)).toBe(true);
  });

  it("returns false when the conversion was last computed on the expense's date (real historical rate, fixed)", () => {
    const expense = makeExpense({
      currency: "EUR",
      date: "2024-01-01",
      updatedAt: "2024-01-01T18:00:00.000Z",
    });

    expect(needsRecalculation(expense, "USD", NOW)).toBe(false);
  });

  it("returns false when the conversion was last computed after the expense's date", () => {
    const expense = makeExpense({
      currency: "EUR",
      date: "2024-01-01",
      updatedAt: "2024-06-15T00:00:00.000Z",
    });

    expect(needsRecalculation(expense, "USD", NOW)).toBe(false);
  });

  it("returns true when the conversion was last computed before the expense's date (proxy rate from entry time)", () => {
    const expense = makeExpense({
      currency: "EUR",
      date: "2026-06-20",
      updatedAt: "2026-05-30T00:00:00.000Z",
    });

    expect(needsRecalculation(expense, "USD", NOW)).toBe(true);
  });

  it("falls back to createdAt when updatedAt is absent", () => {
    const fixed = makeExpense({
      currency: "EUR",
      date: "2024-01-01",
      createdAt: "2024-01-01T09:00:00.000Z",
    });
    const stale = makeExpense({
      currency: "EUR",
      date: "2026-06-20",
      createdAt: "2026-05-30T00:00:00.000Z",
    });

    expect(needsRecalculation(fixed, "USD", NOW)).toBe(false);
    expect(needsRecalculation(stale, "USD", NOW)).toBe(true);
  });
});

describe("hasCurrencyMismatch", () => {
  it("returns false for an empty array", () => {
    expect(hasCurrencyMismatch([], "USD", NOW)).toBe(false);
  });

  it("returns false when all expense currencies match the trip currency", () => {
    const expenses = [makeExpense({ id: "a", currency: "USD" }), makeExpense({ id: "b", currency: "USD" })];

    expect(hasCurrencyMismatch(expenses, "USD", NOW)).toBe(false);
  });

  it("returns true when at least one expense has a different currency and needs recalculation", () => {
    const expenses = [makeExpense({ id: "a", currency: "USD" }), makeExpense({ id: "b", currency: "EUR" })];

    expect(hasCurrencyMismatch(expenses, "USD", NOW)).toBe(true);
  });

  it("returns false when the only mismatched expense already has a fixed historical rate", () => {
    const expenses = [
      makeExpense({
        id: "a",
        currency: "EUR",
        date: "2024-01-01",
        updatedAt: "2024-01-01T18:00:00.000Z",
      }),
    ];

    expect(hasCurrencyMismatch(expenses, "USD", NOW)).toBe(false);
  });

  it("compares currencies case-insensitively", () => {
    const expenses = [makeExpense({ id: "a", currency: "usd" })];

    expect(hasCurrencyMismatch(expenses, "USD", NOW)).toBe(false);
    expect(hasCurrencyMismatch(expenses, "usd", NOW)).toBe(false);
  });
});
