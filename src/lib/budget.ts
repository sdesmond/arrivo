import { BudgetStatus } from "@/data/types";
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

/**
 * Where actual spend sits relative to the user's warning/danger thresholds.
 * `budgetTotal <= 0` is treated as neutral — there's no meaningful percentage
 * to compare against a budget that isn't set.
 */
export function calculateBudgetStatus(
  actual: number,
  budgetTotal: number,
  warningThreshold: number,
  dangerThreshold: number
): BudgetStatus {
  if (budgetTotal <= 0) {
    return BudgetStatus.Neutral;
  }

  const percentage = (actual / budgetTotal) * 100;

  if (percentage >= dangerThreshold) {
    return BudgetStatus.Danger;
  }
  if (percentage >= warningThreshold) {
    return BudgetStatus.Warning;
  }
  return BudgetStatus.Neutral;
}

const dateOnly = (isoDateTime: string): string => isoDateTime.slice(0, 10);

/**
 * True when an expense's Trip-Currency conversion is worth re-fetching: the
 * currency differs from `tripCurrency` AND the stored rate may be a stand-in
 * rather than the real historical rate.
 *
 * `resolveLookupDate` in `lib/currency.ts` clamps any lookup for a future date
 * to "today" (Frankfurter has no rates for dates that haven't happened), so a
 * conversion computed before `expense.date` arrived used that day's rate as a
 * proxy. Once the conversion is (re)computed on or after `expense.date`, the
 * real historical rate is fixed forever and never needs refreshing again.
 * Missing `updatedAt`/`createdAt` (no record of when it was computed) defaults
 * to needing recalculation rather than silently never refreshing.
 */
export function needsRecalculation(expense: Expense, tripCurrency: string, now: Date): boolean {
  if (expense.currency.toUpperCase() === tripCurrency.toUpperCase()) {
    return false;
  }

  const today = dateOnly(now.toISOString());
  if (expense.date > today) {
    return true;
  }

  const lastComputedAt = expense.updatedAt ?? expense.createdAt;
  if (!lastComputedAt) {
    return true;
  }

  return expense.date > dateOnly(lastComputedAt);
}

/**
 * True when at least one expense needs its Trip-Currency conversion
 * recalculated (see `needsRecalculation`). Drives "Recalculate Conversions"
 * button visibility.
 */
export function hasCurrencyMismatch(expenses: Expense[], tripCurrency: string, now: Date): boolean {
  return expenses.some((expense) => needsRecalculation(expense, tripCurrency, now));
}

/**
 * True when at least one expense's currency differs from `newCurrency`, with no
 * staleness gating. Unlike `hasCurrencyMismatch` (which only flags a possibly-stale
 * rate for the *current* trip currency), this answers "is the trip currency itself
 * about to change in a way that invalidates existing conversions" — every currency
 * mismatch matters here regardless of when the expense was last computed. Drives the
 * Trip Currency change confirmation dialog.
 */
export function hasCurrencyChangeMismatch(expenses: Expense[], newCurrency: string): boolean {
  const normalizedNewCurrency = newCurrency.toUpperCase();
  return expenses.some((expense) => expense.currency.toUpperCase() !== normalizedNewCurrency);
}
