import { getNow } from "@/lib/mock-date";
import { needsRecalculation } from "@/lib/budget";
import type { Expense } from "@/data/types";

/**
 * Frankfurter (ECB) currency conversion client.
 *
 * This is the ONLY module that calls Frankfurter or holds the rate cache.
 * All conversion call sites import from here — never duplicate fetch logic.
 *
 * Uses the v2 rates endpoint with `date`, `base`, and comma-joined `quotes`.
 * Frankfurter v2 covers more active country currencies than v1, which keeps
 * entry-time conversion aligned with the expanded currency picker.
 */

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v2/rates";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1hr — only applies to today-dated lookups
const E2E_RATES_BY_BASE: Record<string, Record<string, number>> = {
  EUR: { GBP: 0.86, USD: 1.08 },
  GBP: { EUR: 1.16, USD: 1.25 },
  INR: { GBP: 0.0095, USD: 0.012 },
  USD: { EUR: 0.92, GBP: 0.79 },
};

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
  if (process.env.PACKT_E2E === "true") {
    const baseRates = E2E_RATES_BY_BASE[fromCurrency] ?? {};
    return Object.fromEntries(toCurrencies.map((currency) => [currency, baseRates[currency] ?? 1]));
  }

  const url = `${FRANKFURTER_BASE}?date=${date}&base=${fromCurrency}&quotes=${toCurrencies.join(",")}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Currency conversion failed (HTTP ${response.status}).`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Currency conversion returned no rates.");
  }

  const rates: Record<string, number> = {};

  for (const row of data) {
    const quote = typeof row?.quote === "string" ? row.quote : null;
    const rate = typeof row?.rate === "number" ? row.rate : null;

    if (quote && rate !== null) {
      rates[quote] = rate;
    }
  }

  if (Object.keys(rates).length === 0) {
    throw new Error("Currency conversion returned no rates.");
  }

  return rates;
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
  const today = todayISO();
  const useCache = lookupDate === today;
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
  if (!toCurrency) {
    throw new Error("Target currency is required.");
  }

  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount, rate: 1 };
  }

  const dual = await convertDual(amount, fromCurrency, [toCurrency], date);
  return dual[toCurrency];
}

export interface RecalculateResult {
  expenseId: string;
  convertedAmount: number;
  rate: number;
}

/**
 * Fetch one rate per distinct (currency, date) pair among `expenses` and apply it to
 * every expense in that pair, in a single batch of parallel requests. All-or-nothing:
 * if any conversion fetch fails, the whole call rejects and the caller persists nothing.
 */
async function convertExpenseBatch(expenses: Expense[], tripCurrency: string): Promise<RecalculateResult[]> {
  const byKey = new Map<string, Expense[]>();
  for (const expense of expenses) {
    const key = `${expense.currency}:${expense.date}`;
    const group = byKey.get(key);
    if (group) {
      group.push(expense);
    } else {
      byKey.set(key, [expense]);
    }
  }

  const groupEntries = Array.from(byKey.entries());
  const groupResults = await Promise.all(
    groupEntries.map(async ([, group]) => {
      const [{ currency, date }] = group;
      const conversions = await convertDual(1, currency, [tripCurrency], date);
      const conversion = conversions[tripCurrency];
      if (!conversion) {
        throw new Error(`Currency conversion missing rate for ${tripCurrency}.`);
      }
      return { rate: conversion.rate, group };
    })
  );

  const results: RecalculateResult[] = [];
  for (const { rate, group } of groupResults) {
    for (const expense of group) {
      results.push({
        expenseId: expense.id,
        convertedAmount: roundMoney(expense.amount * rate),
        rate,
      });
    }
  }

  return results;
}

/**
 * Batch-recalculate Trip Currency conversions for every expense that still
 * needs one (see `needsRecalculation` in `lib/budget.ts` — currency mismatch
 * plus a rate that may still be a proxy rather than the fixed historical
 * value), using each expense's own `date`. Powers the standalone "Recalculate
 * Conversions" action (Story 1.6), where re-running repeatedly shouldn't
 * re-fetch rates that are already fixed.
 */
export async function recalculate(expenses: Expense[], tripCurrency: string): Promise<RecalculateResult[]> {
  const now = getNow();
  const stale = expenses.filter((expense) => needsRecalculation(expense, tripCurrency, now));
  return convertExpenseBatch(stale, tripCurrency);
}

/**
 * Batch-recalculate Trip Currency conversions for every expense whose currency
 * differs from `tripCurrency`, with no staleness gate — unlike `recalculate()`,
 * this is for when the trip currency itself just changed, so every existing
 * conversion (computed against the *old* trip currency) is wrong regardless of
 * how recently it was computed. Powers the Trip Currency change "Convert" path.
 */
export async function recalculateAll(expenses: Expense[], tripCurrency: string): Promise<RecalculateResult[]> {
  const normalizedTripCurrency = tripCurrency.toUpperCase();
  const mismatched = expenses.filter((expense) => expense.currency.toUpperCase() !== normalizedTripCurrency);
  return convertExpenseBatch(mismatched, tripCurrency);
}
