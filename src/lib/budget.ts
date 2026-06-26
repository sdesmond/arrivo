import type { Expense, ExpenseCategory } from "@/data/types";

export interface CategoryBreakdownEntry {
  category: ExpenseCategory;
  subtotal: number;
  count: number;
}

/**
 * Resolve an expense to its Trip Currency value. `convertedAmountTrip` is the
 * canonical figure (populated at entry time); fall back to the raw `amount` only
 * when conversion was never stored (pre-conversion entries).
 */
function tripCurrencyAmount(expense: Expense): number {
  return expense.convertedAmountTrip ?? expense.amount;
}

/**
 * Total actual spend across all expenses, expressed in the Trip Currency.
 * The `currency` param is accepted for future use; `convertedAmountTrip` is
 * already in Trip Currency, so no conversion happens here.
 */
export function calculateActual(expenses: Expense[], currency: string): number {
  void currency;
  return expenses.reduce((total, expense) => total + tripCurrencyAmount(expense), 0);
}

/**
 * Group expenses by category, summing Trip Currency amounts. Categories with no
 * items are omitted; results are sorted by subtotal descending.
 */
export function calculateCategoryBreakdown(expenses: Expense[], currency: string): CategoryBreakdownEntry[] {
  void currency;
  const byCategory = new Map<ExpenseCategory, CategoryBreakdownEntry>();

  for (const expense of expenses) {
    const existing = byCategory.get(expense.category);
    if (existing) {
      existing.subtotal += tripCurrencyAmount(expense);
      existing.count += 1;
    } else {
      byCategory.set(expense.category, {
        category: expense.category,
        subtotal: tripCurrencyAmount(expense),
        count: 1,
      });
    }
  }

  return [...byCategory.values()].sort((first, second) => second.subtotal - first.subtotal);
}
