import { endOfYear, format, startOfYear, subMonths, subYears } from "date-fns";
import { SpendingDateRange as SpendingDateRangeValues } from "@/data/types";
import type { Expense, ExpenseCategory, SpendingDateRange, SpendingSummary, Trip } from "@/data/types";
import { getDisplayedTripDays } from "@/lib/utils";

const SPENDING_DATE_RANGE_VALUES = new Set<string>(Object.values(SpendingDateRangeValues));

export function resolveSpendingDateRange(value: string | undefined): SpendingDateRange {
  return value && SPENDING_DATE_RANGE_VALUES.has(value)
    ? (value as SpendingDateRange)
    : SpendingDateRangeValues.ThisYear;
}

export function getSpendingDateRangeBounds(
  range: SpendingDateRange,
  now: Date
): { startDate: string; endDate: string } {
  const dateOnly = (date: Date): string => format(date, "yyyy-MM-dd");

  switch (range) {
    case SpendingDateRangeValues.LastYear: {
      const lastYear = subYears(now, 1);
      return { startDate: dateOnly(startOfYear(lastYear)), endDate: dateOnly(endOfYear(lastYear)) };
    }
    case SpendingDateRangeValues.Last12Months:
      return { startDate: dateOnly(subMonths(now, 12)), endDate: dateOnly(now) };
    case SpendingDateRangeValues.AllTime:
      return { startDate: "0001-01-01", endDate: "9999-12-31" };
    case SpendingDateRangeValues.ThisYear:
    default:
      return { startDate: dateOnly(startOfYear(now)), endDate: dateOnly(endOfYear(now)) };
  }
}

function expenseProfileAmount(expense: Expense): number {
  return expense.convertedAmountProfile ?? expense.amount;
}

/**
 * Single-pass aggregation over a Spending view's filtered trips/expenses.
 * Trips and expenses are already date-range-filtered by `listExpensesForUserInRange`
 * (FR13's any-overlap rule); this function never re-applies date filtering itself.
 */
export function buildSpendingSummary(
  trips: Trip[],
  expenses: Expense[],
  dateRange: SpendingDateRange
): SpendingSummary {
  void dateRange;

  const expensesByTripId = new Map<string, Expense[]>();
  for (const expense of expenses) {
    const list = expensesByTripId.get(expense.tripId) ?? [];
    list.push(expense);
    expensesByTripId.set(expense.tripId, list);
  }

  let totalSpend = 0;
  let totalSpendForCountedTrips = 0;
  let totalTripDays = 0;
  let countedTripCount = 0;
  let underBudget = 0;
  let onBudget = 0;
  let overBudget = 0;

  const categoryTotals = new Map<ExpenseCategory, { total: number; count: number }>();
  const destinationTotals = new Map<string, { countryCode: string | null; countryName: string; total: number }>();

  for (const trip of trips) {
    const tripExpenses = expensesByTripId.get(trip.id) ?? [];
    const tripSpend = tripExpenses.reduce((sum, expense) => sum + expenseProfileAmount(expense), 0);
    totalSpend += tripSpend;

    const tripDays = getDisplayedTripDays(trip);
    if (tripDays > 0) {
      totalSpendForCountedTrips += tripSpend;
      totalTripDays += tripDays;
      countedTripCount += 1;
    }

    for (const expense of tripExpenses) {
      const amount = expenseProfileAmount(expense);
      const categoryEntry = categoryTotals.get(expense.category) ?? { total: 0, count: 0 };
      categoryEntry.total += amount;
      categoryEntry.count += 1;
      categoryTotals.set(expense.category, categoryEntry);
    }

    const countryCode = trip.destinationCountryCode ?? null;
    const destinationKey = countryCode ?? "unknown";
    const destinationEntry = destinationTotals.get(destinationKey) ?? {
      countryCode,
      countryName: countryCode ? (trip.destinationCountry ?? countryCode) : "Unknown",
      total: 0,
    };
    destinationEntry.total += tripSpend;
    destinationTotals.set(destinationKey, destinationEntry);

    const budgetTotal = trip.budget?.total;
    if (budgetTotal != null && budgetTotal > 0) {
      const spendPercentage = (tripSpend / budgetTotal) * 100;
      if (spendPercentage < 100) {
        underBudget += 1;
      } else if (spendPercentage === 100) {
        onBudget += 1;
      } else {
        overBudget += 1;
      }
    }
  }

  return {
    totalSpend,
    averageTripSpend: trips.length > 0 ? totalSpend / trips.length : 0,
    averageDailySpend: totalSpendForCountedTrips > 0 ? totalSpendForCountedTrips / totalTripDays : null,
    averageTripDuration: countedTripCount > 0 ? totalTripDays / countedTripCount : null,
    tripCount: trips.length,
    countedTripCount,
    totalTripDays,
    categoryBreakdown: [...categoryTotals.entries()].map(([category, value]) => ({ category, ...value })),
    destinationBreakdown: [...destinationTotals.values()],
    budgetAdherence: { underBudget, onBudget, overBudget },
  };
}
