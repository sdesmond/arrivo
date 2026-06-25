import { getNow } from "@/lib/mock-date";
import type { Expense } from "@/data/types";

/**
 * Frankfurter (ECB) currency conversion client.
 *
 * This is the ONLY module that calls Frankfurter or holds the rate cache.
 * All conversion call sites import from here — never duplicate fetch logic.
 *
 * Uses the v1 historical endpoint (`/v1/{date}`), not `/latest`. The v1 target
 * parameter is `symbols` (not `to`). Base currency is always specified explicitly.
 */

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1hr — only applies to today-dated lookups

interface ConversionResult {
  convertedAmount: number;
  rate: number;
}

interface CacheEntry {
  rate: number;
  fetchedAt: number;
}

declare global {
  var __currencyCache: Map<string, CacheEntry> | undefined;
}

/**
 * Rate cache persisted across hot reloads via `globalThis` (mirrors the
 * `globalThis.__pgClient` pattern in `src/db/index.ts`). Keyed by currency-pair
 * only (`${from}:${to}`) so the key-space is bounded by pair count, not date.
 */
const getCache = (): Map<string, CacheEntry> => {
  if (!globalThis.__currencyCache) {
    globalThis.__currencyCache = new Map();
  }
  return globalThis.__currencyCache;
};

const todayISO = (): string => getNow().toISOString().slice(0, 10);

/** Clamp future dates to today — Frankfurter has no rates for future dates. */
const resolveLookupDate = (date: string): string => {
  const today = todayISO();
  return date > today ? today : date;
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

async function fetchRates(fromCurrency: string, toCurrencies: string[], date: string): Promise<Record<string, number>> {
  const url = `${FRANKFURTER_BASE}/${date}?base=${fromCurrency}&symbols=${toCurrencies.join(",")}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Currency conversion failed (HTTP ${response.status}).`);
  }

  const data = (await response.json()) as { rates?: Record<string, number> };
  if (!data.rates) {
    throw new Error("Currency conversion returned no rates.");
  }

  return data.rates;
}

/**
 * Convert `amount` from one currency to several targets in a single API call.
 *
 * Targets equal to `fromCurrency` (and duplicates) are dropped — when no real
 * targets remain, no request is made and an empty result is returned. Today-dated
 * lookups read/write the rate cache; any earlier date bypasses the cache entirely.
 */
export async function convertDual(
  amount: number,
  fromCurrency: string,
  toCurrencies: string[],
  date: string
): Promise<Record<string, ConversionResult>> {
  const targets = [...new Set(toCurrencies)].filter((currency) => currency.length > 0 && currency !== fromCurrency);

  const result: Record<string, ConversionResult> = {};
  if (targets.length === 0) {
    return result;
  }

  const lookupDate = resolveLookupDate(date);
  const useCache = lookupDate === todayISO();
  const cache = getCache();

  const rates: Record<string, number> = {};
  const toFetch: string[] = [];

  for (const target of targets) {
    if (useCache) {
      const cached = cache.get(`${fromCurrency}:${target}`);
      if (cached && Date.now() - cached.fetchedAt <= CACHE_TTL_MS) {
        rates[target] = cached.rate;
        continue;
      }
    }
    toFetch.push(target);
  }

  if (toFetch.length > 0) {
    const fetched = await fetchRates(fromCurrency, toFetch, lookupDate);
    for (const target of toFetch) {
      const rate = fetched[target];
      if (typeof rate !== "number") {
        throw new Error(`Currency conversion missing rate for ${target}.`);
      }
      rates[target] = rate;
      if (useCache) {
        cache.set(`${fromCurrency}:${target}`, { rate, fetchedAt: Date.now() });
      }
    }
  }

  for (const target of targets) {
    const rate = rates[target];
    result[target] = { convertedAmount: roundMoney(amount * rate), rate };
  }

  return result;
}

/**
 * Convert `amount` to a single target currency. When the target equals the
 * source, returns the identity result with no API call.
 */
export async function convert(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: string
): Promise<ConversionResult> {
  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount, rate: 1 };
  }

  const dual = await convertDual(amount, fromCurrency, [toCurrency], date);
  return dual[toCurrency];
}

/**
 * Batch-recalculate conversions for a set of expenses.
 *
 * Stubbed for Story 1.6 ("Recalculate Conversions") — wired up when the manual
 * retry / Trip-currency-change recalculation flows land.
 */
export async function recalculate(expenses: Expense[]): Promise<void> {
  void expenses;
}
