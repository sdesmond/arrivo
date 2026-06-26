// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convert, convertDual, recalculate } from "./currency";
import { ExpenseCategory } from "@/data/types";
import type { Expense } from "@/data/types";

const TODAY = "2026-06-25";
const PAST = "2024-01-15";

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    tripId: "trip-1",
    category: ExpenseCategory.Misc,
    amount: 100,
    currency: "USD",
    date: PAST,
    ...overrides,
  };
}

function mockFetchRates(rates: Record<string, number>, base = "USD", date = TODAY) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () =>
      Object.entries(rates).map(([quote, rate]) => ({
        date,
        base,
        quote,
        rate,
      })),
  } as Response);
}

function lastFetchUrl(spy: ReturnType<typeof vi.spyOn>): string {
  return String(spy.mock.calls.at(-1)?.[0]);
}

describe("lib/currency", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
    globalThis.__currencyCache = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("convert", () => {
    it("calls Frankfurter with the v2 historical URL and returns converted amount + rate", async () => {
      const fetchSpy = mockFetchRates({ EUR: 0.92 });

      const result = await convert(100, "USD", "EUR", PAST);

      expect(lastFetchUrl(fetchSpy)).toBe(`https://api.frankfurter.dev/v2/rates?date=${PAST}&base=USD&quotes=EUR`);
      expect(result).toEqual({ convertedAmount: 92, rate: 0.92 });
    });

    it("supports source currencies that v1 misses but v2 serves", async () => {
      const fetchSpy = mockFetchRates({ USD: 0.014 }, "AFN", PAST);

      const result = await convert(100, "AFN", "USD", PAST);

      expect(lastFetchUrl(fetchSpy)).toBe(`https://api.frankfurter.dev/v2/rates?date=${PAST}&base=AFN&quotes=USD`);
      expect(result).toEqual({ convertedAmount: 1.4, rate: 0.014 });
    });

    it("rounds the converted amount to 2 decimal places", async () => {
      mockFetchRates({ EUR: 0.9237 });

      const result = await convert(100, "USD", "EUR", PAST);

      expect(result.convertedAmount).toBe(92.37);
    });

    it("returns identity with no API call when source equals target", async () => {
      const fetchSpy = mockFetchRates({ EUR: 0.92 });

      const result = await convert(50, "USD", "USD", PAST);

      expect(result).toEqual({ convertedAmount: 50, rate: 1 });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("convertDual", () => {
    it("fetches both targets in a single call with comma-joined symbols", async () => {
      const fetchSpy = mockFetchRates({ EUR: 0.92, GBP: 0.79 });

      const result = await convertDual(200, "USD", ["EUR", "GBP"], PAST);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(lastFetchUrl(fetchSpy)).toBe(`https://api.frankfurter.dev/v2/rates?date=${PAST}&base=USD&quotes=EUR,GBP`);
      expect(result).toEqual({
        EUR: { convertedAmount: 184, rate: 0.92 },
        GBP: { convertedAmount: 158, rate: 0.79 },
      });
    });

    it("returns an empty result with no API call when no real targets remain", async () => {
      const fetchSpy = mockFetchRates({ EUR: 0.92 });

      const result = await convertDual(100, "USD", ["USD", "USD"], PAST);

      expect(result).toEqual({});
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("drops the matching target and fetches only the differing one", async () => {
      const fetchSpy = mockFetchRates({ GBP: 0.79 });

      const result = await convertDual(100, "USD", ["USD", "GBP"], PAST);

      expect(lastFetchUrl(fetchSpy)).toBe(`https://api.frankfurter.dev/v2/rates?date=${PAST}&base=USD&quotes=GBP`);
      expect(result).toEqual({ GBP: { convertedAmount: 79, rate: 0.79 } });
    });

    it("throws when the response is missing a requested rate", async () => {
      mockFetchRates({ EUR: 0.92 });

      await expect(convertDual(100, "USD", ["EUR", "GBP"], PAST)).rejects.toThrow(
        "Currency conversion missing rate for GBP."
      );
    });

    it("uses today's date for a future-dated entry", async () => {
      const fetchSpy = mockFetchRates({ EUR: 0.92 });

      await convertDual(100, "USD", ["EUR"], "2030-01-01");

      expect(lastFetchUrl(fetchSpy)).toBe(`https://api.frankfurter.dev/v2/rates?date=${TODAY}&base=USD&quotes=EUR`);
    });
  });

  describe("cache", () => {
    it("caches today's rate and serves the second lookup without a fetch", async () => {
      const fetchSpy = mockFetchRates({ EUR: 0.92 });

      await convert(100, "USD", "EUR", TODAY);
      const second = await convert(250, "USD", "EUR", TODAY);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(second).toEqual({ convertedAmount: 230, rate: 0.92 });
    });

    it("bypasses the cache for historical dates and fetches every time", async () => {
      const fetchSpy = mockFetchRates({ EUR: 0.92 });

      await convert(100, "USD", "EUR", PAST);
      await convert(100, "USD", "EUR", PAST);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("re-fetches a today's rate once the 1hr TTL elapses", async () => {
      const fetchSpy = mockFetchRates({ EUR: 0.92 });

      await convert(100, "USD", "EUR", TODAY);
      vi.setSystemTime(new Date("2026-06-25T13:00:01Z"));
      await convert(100, "USD", "EUR", TODAY);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("failure handling", () => {
    it("throws a descriptive error on a non-OK response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 503 } as Response);

      await expect(convert(100, "USD", "EUR", PAST)).rejects.toThrow("Currency conversion failed (HTTP 503).");
    });

    it("throws when the response omits the rates object", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ date: PAST, base: "USD", quote: "EUR", rate: 0.92 }),
      } as Response);

      await expect(convert(100, "USD", "EUR", PAST)).rejects.toThrow("Currency conversion returned no rates.");
    });

    it("propagates a network error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

      await expect(convert(100, "USD", "EUR", PAST)).rejects.toThrow("network down");
    });
  });

  describe("recalculate", () => {
    it("calls convertDual only for expenses whose currency differs from the trip currency", async () => {
      const fetchSpy = mockFetchRates({ USD: 1.08 }, "EUR", PAST);
      const expenses = [
        makeExpense({ id: "a", currency: "EUR", amount: 50, date: PAST }),
        makeExpense({ id: "b", currency: "USD", amount: 30 }),
      ];

      await recalculate(expenses, "USD");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(lastFetchUrl(fetchSpy)).toBe(`https://api.frankfurter.dev/v2/rates?date=${PAST}&base=EUR&quotes=USD`);
    });

    it("skips expenses already matching the trip currency (case-insensitive)", async () => {
      const fetchSpy = mockFetchRates({ USD: 1.08 }, "EUR", PAST);
      const expenses = [makeExpense({ id: "a", currency: "usd" })];

      const results = await recalculate(expenses, "USD");

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });

    it("returns correct results for multiple mismatched expenses, using each expense's own date", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const urlString = String(url);
        if (urlString.includes("date=2024-01-15")) {
          return {
            ok: true,
            json: async () => [{ date: "2024-01-15", base: "EUR", quote: "USD", rate: 1.08 }],
          } as Response;
        }
        return {
          ok: true,
          json: async () => [{ date: "2024-02-20", base: "GBP", quote: "USD", rate: 1.25 }],
        } as Response;
      });

      const expenses = [
        makeExpense({ id: "a", currency: "EUR", amount: 50, date: "2024-01-15" }),
        makeExpense({ id: "b", currency: "GBP", amount: 20, date: "2024-02-20" }),
      ];

      const results = await recalculate(expenses, "USD");

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(results).toEqual([
        { expenseId: "a", convertedAmount: 54, rate: 1.08 },
        { expenseId: "b", convertedAmount: 25, rate: 1.25 },
      ]);
    });

    it("throws on fetch failure with no partial results (all-or-nothing)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 503 } as Response);

      const expenses = [makeExpense({ id: "a", currency: "EUR" })];

      await expect(recalculate(expenses, "USD")).rejects.toThrow("Currency conversion failed (HTTP 503).");
    });

    it("returns an empty array for an empty expenses list", async () => {
      const results = await recalculate([], "USD");

      expect(results).toEqual([]);
    });

    it("skips a past-dated mismatched expense already computed on/after its date (fixed historical rate)", async () => {
      const fetchSpy = mockFetchRates({ USD: 1.08 }, "EUR", PAST);
      const expenses = [makeExpense({ id: "a", currency: "EUR", date: PAST, updatedAt: `${PAST}T18:00:00.000Z` })];

      const results = await recalculate(expenses, "USD");

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });

    it("recalculates a past-dated mismatched expense computed before its date (proxy rate from entry time)", async () => {
      const fetchSpy = mockFetchRates({ USD: 1.08 }, "EUR", PAST);
      const expenses = [makeExpense({ id: "a", currency: "EUR", date: PAST, updatedAt: "2023-01-01T00:00:00.000Z" })];

      const results = await recalculate(expenses, "USD");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(results).toEqual([{ expenseId: "a", convertedAmount: 108, rate: 1.08 }]);
    });

    it("always recalculates a future-dated mismatched expense, regardless of when it was last computed", async () => {
      const futureDate = "2030-01-01";
      const fetchSpy = mockFetchRates({ USD: 1.08 }, "EUR", TODAY);
      const expenses = [
        makeExpense({ id: "a", currency: "EUR", date: futureDate, updatedAt: `${TODAY}T00:00:00.000Z` }),
      ];

      const results = await recalculate(expenses, "USD");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(results).toEqual([{ expenseId: "a", convertedAmount: 108, rate: 1.08 }]);
    });
  });
});
