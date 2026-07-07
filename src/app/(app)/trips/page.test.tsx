import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CurrencyOption, TripListEntry } from "@/data/types";

const {
  mockCookies,
  mockHeaders,
  mockRequireUser,
  mockGetServerNow,
  mockGetUserById,
  mockListSupportedCurrencies,
  mockListTripsForUser,
  tripsPageClientSpy,
} = vi.hoisted(() => ({
  mockCookies: vi.fn(),
  mockHeaders: vi.fn(),
  mockRequireUser: vi.fn(),
  mockGetServerNow: vi.fn(),
  mockGetUserById: vi.fn(),
  mockListSupportedCurrencies: vi.fn(),
  mockListTripsForUser: vi.fn(),
  tripsPageClientSpy: vi.fn(),
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
  listTripsForUser: mockListTripsForUser,
}));

vi.mock("@/lib/server-now", () => ({
  getServerNow: mockGetServerNow,
}));

vi.mock("@/lib/utils", () => ({
  detectDefaultDateFormat: vi.fn(() => "MM/DD/YYYY"),
}));

vi.mock("./page-client", () => ({
  TripsPageClient: (props: unknown) => {
    tripsPageClientSpy(props);
    return <div>Trips page client</div>;
  },
}));

import TripsPage from "./page";

const entries: TripListEntry[] = [
  {
    trip: { id: "trip-1", name: "Tokyo", status: "active", startDate: "2026-07-07", endDate: "2026-07-10" },
    todayEvents: [],
    summaryEvents: [],
  },
];

const currencyOptions: CurrencyOption[] = [{ code: "USD", name: "US Dollar" }];

describe("TripsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({
      get: vi.fn((key: string) => (key === "trips-view-mode" ? { value: "list" } : undefined)),
    });
    mockHeaders.mockResolvedValue(new Headers([["accept-language", "en-US"]]));
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetServerNow.mockResolvedValue(new Date("2026-07-07T12:00:00.000Z"));
    mockGetUserById.mockResolvedValue({ id: "user-1", dateFormat: "DD/MM/YYYY" });
    mockListTripsForUser.mockResolvedValue(entries);
    mockListSupportedCurrencies.mockResolvedValue(currencyOptions);
  });

  it("passes fetched currency options into the client page", async () => {
    const page = await TripsPage();

    render(page);

    expect(screen.getByText("Trips page client")).toBeInTheDocument();
    expect(mockListSupportedCurrencies).toHaveBeenCalledTimes(1);
    expect(tripsPageClientSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialEntries: entries,
        initialViewMode: "list",
        dateFormat: "DD/MM/YYYY",
        currencyOptions,
      })
    );
  });
});
