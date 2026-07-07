import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CurrencyOption, SpendingSummary, TripListEntry } from "@/data/types";

const {
  mockCookies,
  mockHeaders,
  mockRequireUser,
  mockGetServerNow,
  mockGetUserById,
  mockListExpensesForUserInRange,
  mockListSupportedCurrencies,
  mockListTripsForUser,
  mockBuildSpendingSummary,
  mockGetSpendingDateRangeBounds,
  mockResolveSpendingDateRange,
  travelHistoryPageClientSpy,
} = vi.hoisted(() => ({
  mockCookies: vi.fn(),
  mockHeaders: vi.fn(),
  mockRequireUser: vi.fn(),
  mockGetServerNow: vi.fn(),
  mockGetUserById: vi.fn(),
  mockListExpensesForUserInRange: vi.fn(),
  mockListSupportedCurrencies: vi.fn(),
  mockListTripsForUser: vi.fn(),
  mockBuildSpendingSummary: vi.fn(),
  mockGetSpendingDateRangeBounds: vi.fn(),
  mockResolveSpendingDateRange: vi.fn(),
  travelHistoryPageClientSpy: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
  headers: mockHeaders,
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("@/lib/currencies", () => ({
  listSupportedCurrencies: mockListSupportedCurrencies,
}));

vi.mock("@/lib/queries", () => ({
  getUserById: mockGetUserById,
  listExpensesForUserInRange: mockListExpensesForUserInRange,
  listTripsForUser: mockListTripsForUser,
}));

vi.mock("@/lib/server-now", () => ({
  getServerNow: mockGetServerNow,
}));

vi.mock("@/lib/spending", () => ({
  buildSpendingSummary: mockBuildSpendingSummary,
  getSpendingDateRangeBounds: mockGetSpendingDateRangeBounds,
  resolveSpendingDateRange: mockResolveSpendingDateRange,
}));

vi.mock("@/lib/utils", () => ({
  detectDefaultDateFormat: vi.fn(() => "MM/DD/YYYY"),
}));

vi.mock("./page-client", () => ({
  TravelHistoryPageClient: (props: unknown) => {
    travelHistoryPageClientSpy(props);
    return <div>Travel history client</div>;
  },
}));

import TravelHistoryPage from "./page";

const now = new Date("2026-07-07T12:00:00.000Z");

const entries: TripListEntry[] = [
  {
    trip: { id: "trip-1", name: "Tokyo", status: "past", startDate: "2026-06-01", endDate: "2026-06-05" },
    todayEvents: [],
    summaryEvents: [],
  },
];

const currencyOptions: CurrencyOption[] = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
];

const spendingSummary: SpendingSummary = {
  totalSpend: 250,
  averageTripSpend: 250,
  averageDailySpend: 50,
  averageTripDuration: 5,
  tripCount: 1,
  countedTripCount: 1,
  totalTripDays: 5,
  categoryBreakdown: [],
  destinationBreakdown: [],
  budgetAdherence: { underBudget: 1, onBudget: 0, overBudget: 0 },
};

describe("TravelHistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({
      get: vi.fn((key: string) => (key === "travel-history-view-mode" ? { value: "list" } : undefined)),
    });
    mockHeaders.mockResolvedValue(new Headers([["accept-language", "en-US"]]));
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetServerNow.mockResolvedValue(now);
    mockGetUserById.mockResolvedValue({ id: "user-1", dateFormat: "DD/MM/YYYY", currency: "EUR" });
    mockListTripsForUser.mockResolvedValue(entries);
    mockListSupportedCurrencies.mockResolvedValue(currencyOptions);
    mockResolveSpendingDateRange.mockReturnValue("this-year");
    mockGetSpendingDateRangeBounds.mockReturnValue({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    mockListExpensesForUserInRange.mockResolvedValue({ trips: [entries[0].trip], expenses: [] });
    mockBuildSpendingSummary.mockReturnValue(spendingSummary);
  });

  it("passes spending bootstrap data when opened in spending view", async () => {
    const page = await TravelHistoryPage({
      searchParams: Promise.resolve({ view: "spending", range: "this-year" }),
    });

    render(page);

    expect(screen.getByText("Travel history client")).toBeInTheDocument();
    expect(mockResolveSpendingDateRange).toHaveBeenCalledWith("this-year");
    expect(mockGetSpendingDateRangeBounds).toHaveBeenCalledWith("this-year", now);
    expect(mockListExpensesForUserInRange).toHaveBeenCalledWith("user-1", "2026-01-01", "2026-12-31");
    expect(mockBuildSpendingSummary).toHaveBeenCalledWith([entries[0].trip], [], "this-year");
    expect(travelHistoryPageClientSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialEntries: entries,
        initialViewMode: "list",
        dateFormat: "DD/MM/YYYY",
        currencyOptions,
        initialSummary: spendingSummary,
        initialRange: "this-year",
        currency: "EUR",
      })
    );
  });

  it("skips spending queries outside spending view and falls back to USD", async () => {
    mockCookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
    mockGetUserById.mockResolvedValue({ id: "user-1", dateFormat: "YYYY-MM-DD" });

    const page = await TravelHistoryPage({
      searchParams: Promise.resolve({ view: "trips", range: "all-time" }),
    });

    render(page);

    expect(mockResolveSpendingDateRange).toHaveBeenCalledWith("all-time");
    expect(mockGetSpendingDateRangeBounds).not.toHaveBeenCalled();
    expect(mockListExpensesForUserInRange).not.toHaveBeenCalled();
    expect(mockBuildSpendingSummary).not.toHaveBeenCalled();
    expect(travelHistoryPageClientSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialViewMode: "cards",
        initialSummary: undefined,
        currency: "USD",
      })
    );
  });
});
