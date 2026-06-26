import { describe, expect, it } from "vitest";
import { calculateActual, calculateCategoryBreakdown } from "./budget";
import { ExpenseCategory } from "@/data/types";
import type { Expense } from "@/data/types";

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
