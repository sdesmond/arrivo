// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convert, convertDual, recalculate } from "./currency";

const TODAY = "2026-06-25";
const PAST = "2024-01-15";

function mockFetchRates(rates: Record<string, number>) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ amount: 1, base: "USD", date: TODAY, rates }),
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
    it("calls Frankfurter with the v1 historical URL and returns converted amount + rate", async () => {
      const fetchSpy = mockFetchRates({ EUR: 0.92 });

      const result = await convert(100, "USD", "EUR", PAST);

      expect(lastFetchUrl(fetchSpy)).toBe(`https://api.frankfurter.dev/v1/${PAST}?base=USD&symbols=EUR`);
      expect(result).toEqual({ convertedAmount: 92, rate: 0.92 });
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
      expect(lastFetchUrl(fetchSpy)).toBe(`https://api.frankfurter.dev/v1/${PAST}?base=USD&symbols=EUR,GBP`);
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

      expect(lastFetchUrl(fetchSpy)).toBe(`https://api.frankfurter.dev/v1/${PAST}?base=USD&symbols=GBP`);
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

      expect(lastFetchUrl(fetchSpy)).toBe(`https://api.frankfurter.dev/v1/${TODAY}?base=USD&symbols=EUR`);
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
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
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
        json: async () => ({ amount: 1, base: "USD", date: PAST }),
      } as Response);

      await expect(convert(100, "USD", "EUR", PAST)).rejects.toThrow("Currency conversion returned no rates.");
    });

    it("propagates a network error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

      await expect(convert(100, "USD", "EUR", PAST)).rejects.toThrow("network down");
    });
  });

  describe("recalculate", () => {
    it("resolves without throwing (Story 1.6 stub)", async () => {
      await expect(recalculate([])).resolves.toBeUndefined();
    });
  });
});
