import { describe, expect, it } from "vitest";
import { buildSpendingSummary, getSpendingDateRangeBounds, resolveSpendingDateRange } from "./spending";
import { ExpenseCategory, SpendingDateRange } from "@/data/types";
import type { Expense, Trip } from "@/data/types";

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    status: "past",
    name: "Trip",
    startDate: "2026-01-01",
    endDate: "2026-01-03",
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    tripId: "trip-1",
    category: ExpenseCategory.Food,
    amount: 10,
    currency: "USD",
    convertedAmountProfile: 10,
    date: "2026-01-01",
    ...overrides,
  };
}

describe("buildSpendingSummary", () => {
  it("computes totalSpend, averageTripSpend, averageDailySpend", () => {
    const trips = [makeTrip({ id: "trip-1", startDate: "2026-01-01", endDate: "2026-01-03" })];
    const expenses = [
      makeExpense({ id: "expense-1", tripId: "trip-1", convertedAmountProfile: 30 }),
      makeExpense({ id: "expense-2", tripId: "trip-1", convertedAmountProfile: 70 }),
    ];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.ThisYear);

    expect(summary.totalSpend).toBe(100);
    expect(summary.averageTripSpend).toBe(100);
    expect(summary.totalTripDays).toBe(3);
    expect(summary.countedTripCount).toBe(1);
    expect(summary.averageDailySpend).toBeCloseTo(100 / 3);
    expect(summary.averageTripDuration).toBe(3);
  });

  it("categoryBreakdown groups by category, sums converted amounts, counts items", () => {
    const trips = [makeTrip()];
    const expenses = [
      makeExpense({ id: "expense-1", category: ExpenseCategory.Food, convertedAmountProfile: 20 }),
      makeExpense({ id: "expense-2", category: ExpenseCategory.Food, convertedAmountProfile: 5 }),
      makeExpense({ id: "expense-3", category: ExpenseCategory.Lodging, convertedAmountProfile: 50 }),
    ];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.categoryBreakdown).toEqual(
      expect.arrayContaining([
        { category: ExpenseCategory.Food, total: 25, count: 2 },
        { category: ExpenseCategory.Lodging, total: 50, count: 1 },
      ])
    );
  });

  it("categoryBreakdown omits categories with zero items", () => {
    const trips = [makeTrip()];
    const expenses = [makeExpense({ category: ExpenseCategory.Food })];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.categoryBreakdown.some((entry) => entry.category === ExpenseCategory.Lodging)).toBe(false);
  });

  it("destinationBreakdown groups by destinationCountryCode, uses destinationCountry for name", () => {
    const trips = [
      makeTrip({ id: "trip-1", destinationCountryCode: "PT", destinationCountry: "Portugal" }),
      makeTrip({ id: "trip-2", destinationCountryCode: "PT", destinationCountry: "Portugal" }),
    ];
    const expenses = [
      makeExpense({ id: "expense-1", tripId: "trip-1", convertedAmountProfile: 40 }),
      makeExpense({ id: "expense-2", tripId: "trip-2", convertedAmountProfile: 60 }),
    ];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.destinationBreakdown).toEqual([{ countryCode: "PT", countryName: "Portugal", total: 100 }]);
  });

  it("destinationBreakdown groups null countryCode as Unknown", () => {
    const trips = [makeTrip({ id: "trip-1", destinationCountryCode: undefined, destinationCountry: undefined })];
    const expenses = [makeExpense({ tripId: "trip-1", convertedAmountProfile: 15 })];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.destinationBreakdown).toEqual([{ countryCode: null, countryName: "Unknown", total: 15 }]);
  });

  it("budgetAdherence counts under/on/over using trip spend vs budget total within a +/-2% band", () => {
    const trips = [
      makeTrip({ id: "trip-under", budget: { currency: "USD", total: 200 } }),
      makeTrip({ id: "trip-on", budget: { currency: "USD", total: 100 } }),
      makeTrip({ id: "trip-over", budget: { currency: "USD", total: 50 } }),
    ];
    const expenses = [
      makeExpense({ id: "e1", tripId: "trip-under", convertedAmountProfile: 100 }),
      makeExpense({ id: "e2", tripId: "trip-on", convertedAmountProfile: 100 }),
      makeExpense({ id: "e3", tripId: "trip-over", convertedAmountProfile: 100 }),
    ];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.budgetAdherence).toEqual({ underBudget: 1, onBudget: 1, overBudget: 1 });
  });

  it("classifies spend at 97.9% as under budget (below 98% threshold)", () => {
    const trips = [makeTrip({ id: "trip-1", budget: { currency: "USD", total: 1000 } })];
    const expenses = [makeExpense({ tripId: "trip-1", convertedAmountProfile: 979 })];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.budgetAdherence).toEqual({ underBudget: 1, onBudget: 0, overBudget: 0 });
  });

  it("classifies spend at 98% as on budget (within +/-2%)", () => {
    const trips = [makeTrip({ id: "trip-1", budget: { currency: "USD", total: 1000 } })];
    const expenses = [makeExpense({ tripId: "trip-1", convertedAmountProfile: 980 })];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.budgetAdherence).toEqual({ underBudget: 0, onBudget: 1, overBudget: 0 });
  });

  it("classifies spend at 102% as on budget (within +/-2%)", () => {
    const trips = [makeTrip({ id: "trip-1", budget: { currency: "USD", total: 1000 } })];
    const expenses = [makeExpense({ tripId: "trip-1", convertedAmountProfile: 1020 })];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.budgetAdherence).toEqual({ underBudget: 0, onBudget: 1, overBudget: 0 });
  });

  it("classifies spend at 102.1% as over budget (above 102% threshold)", () => {
    const trips = [makeTrip({ id: "trip-1", budget: { currency: "USD", total: 1000 } })];
    const expenses = [makeExpense({ tripId: "trip-1", convertedAmountProfile: 1021 })];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.budgetAdherence).toEqual({ underBudget: 0, onBudget: 0, overBudget: 1 });
  });

  it("budget adherence excludes trips without a budget", () => {
    const trips = [makeTrip({ id: "trip-1", budget: undefined })];
    const expenses = [makeExpense({ tripId: "trip-1", convertedAmountProfile: 100 })];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.budgetAdherence).toEqual({ underBudget: 0, onBudget: 0, overBudget: 0 });
  });

  it("trips with neither dates nor a dayTotal are excluded from totalTripDays, and averageDailySpend/averageTripDuration are null rather than 0", () => {
    const trips = [makeTrip({ id: "trip-1", startDate: undefined, endDate: undefined })];
    const expenses = [makeExpense({ tripId: "trip-1", convertedAmountProfile: 100 })];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.totalTripDays).toBe(0);
    expect(summary.countedTripCount).toBe(0);
    expect(summary.averageDailySpend).toBeNull();
    expect(summary.averageTripDuration).toBeNull();
    expect(summary.totalSpend).toBe(100);
    expect(summary.averageTripSpend).toBe(100);
  });

  it("a dateless trip with a dayTotal counts its itinerary days toward totalTripDays/averageDailySpend — its spend was already counted, so its length must be too", () => {
    const trips = [makeTrip({ id: "trip-1", startDate: undefined, endDate: undefined, dayTotal: 4 })];
    const expenses = [makeExpense({ tripId: "trip-1", convertedAmountProfile: 100 })];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.totalTripDays).toBe(4);
    expect(summary.countedTripCount).toBe(1);
    expect(summary.averageDailySpend).toBe(25);
    expect(summary.averageTripDuration).toBe(4);
  });

  it("a dayTotal takes precedence over a calendar-derived day count when both are present", () => {
    const trips = [makeTrip({ id: "trip-1", startDate: "2026-01-01", endDate: "2026-01-03", dayTotal: 10 })];
    const expenses = [makeExpense({ tripId: "trip-1", convertedAmountProfile: 100 })];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.totalTripDays).toBe(10);
    expect(summary.averageDailySpend).toBe(10);
  });

  it("zero trips returns zeroes for all figures", () => {
    const summary = buildSpendingSummary([], [], SpendingDateRange.AllTime);

    expect(summary).toEqual({
      totalSpend: 0,
      averageTripSpend: 0,
      averageDailySpend: null,
      averageTripDuration: null,
      tripCount: 0,
      countedTripCount: 0,
      totalTripDays: 0,
      categoryBreakdown: [],
      destinationBreakdown: [],
      budgetAdherence: { underBudget: 0, onBudget: 0, overBudget: 0 },
    });
  });

  it("averageDailySpend is null (not $0.00) when a dated trip with no expenses coexists with a dateless trip that has spend", () => {
    const trips = [
      makeTrip({ id: "trip-dated", startDate: "2026-01-01", endDate: "2026-01-03" }),
      makeTrip({ id: "trip-dateless", startDate: undefined, endDate: undefined }),
    ];
    const expenses = [makeExpense({ tripId: "trip-dateless", convertedAmountProfile: 100 })];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.totalSpend).toBe(100);
    expect(summary.countedTripCount).toBe(1);
    expect(summary.totalTripDays).toBe(3);
    expect(summary.averageDailySpend).toBeNull();
    expect(summary.averageTripDuration).toBe(3);
  });

  it("averageDailySpend is a real figure when a dated trip itself has spend", () => {
    const trips = [makeTrip({ id: "trip-dated", startDate: "2026-01-01", endDate: "2026-01-03" })];
    const expenses = [makeExpense({ tripId: "trip-dated", convertedAmountProfile: 30 })];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.averageDailySpend).toBe(10);
  });

  it("each expense's convertedAmountProfile is used — no render-time conversion", () => {
    const trips = [makeTrip()];
    const expenses = [makeExpense({ amount: 999, currency: "EUR", convertedAmountProfile: 42 })];

    const summary = buildSpendingSummary(trips, expenses, SpendingDateRange.AllTime);

    expect(summary.totalSpend).toBe(42);
  });
});

describe("resolveSpendingDateRange", () => {
  it("resolves valid range values", () => {
    expect(resolveSpendingDateRange("last-year")).toBe(SpendingDateRange.LastYear);
    expect(resolveSpendingDateRange("all-time")).toBe(SpendingDateRange.AllTime);
  });

  it("defaults to This Year for missing or invalid values", () => {
    expect(resolveSpendingDateRange(undefined)).toBe(SpendingDateRange.ThisYear);
    expect(resolveSpendingDateRange("not-a-range")).toBe(SpendingDateRange.ThisYear);
  });
});

describe("getSpendingDateRangeBounds", () => {
  const now = new Date("2026-06-27T12:00:00.000Z");

  it("computes This Year as the calendar year of now", () => {
    expect(getSpendingDateRangeBounds(SpendingDateRange.ThisYear, now)).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
  });

  it("computes Last Year as the previous calendar year", () => {
    expect(getSpendingDateRangeBounds(SpendingDateRange.LastYear, now)).toEqual({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });
  });

  it("computes Last 12 Months as a rolling window ending today", () => {
    expect(getSpendingDateRangeBounds(SpendingDateRange.Last12Months, now)).toEqual({
      startDate: "2025-06-27",
      endDate: "2026-06-27",
    });
  });

  it("computes All Time as an unbounded range", () => {
    expect(getSpendingDateRangeBounds(SpendingDateRange.AllTime, now)).toEqual({
      startDate: "0001-01-01",
      endDate: "9999-12-31",
    });
  });
});
