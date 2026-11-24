// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), convertDual: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/currency", () => ({ convertDual: mocks.convertDual }));

import { computeConversions } from "./expense-conversions";

function lookups(budgetCurrency: string | null, profileCurrency: string | null, executor = mocks) {
  executor.select
    .mockReturnValueOnce({ from: () => ({ where: async () => [{ budgetCurrency }] }) })
    .mockReturnValueOnce({ from: () => ({ where: async () => [{ currency: profileCurrency }] }) });
}

beforeEach(() => vi.resetAllMocks());

it("skips the rate lookup when no target differs from the expense currency", async () => {
  lookups("USD", "usd");
  const result = await computeConversions("trip", "user", 10, "usd", "2026-01-01");
  expect(mocks.convertDual).not.toHaveBeenCalled();
  expect(result.conversionError).toBeUndefined();
  expect(result.fields.convertedAmountTrip).toBeNull();
});

it("converts to the trip and profile currencies", async () => {
  lookups("eur", "GBP");
  mocks.convertDual.mockResolvedValue({
    EUR: { convertedAmount: 9, rate: 0.9 },
    GBP: { convertedAmount: 8, rate: 0.8 },
  });
  const result = await computeConversions("trip", "user", 10, "USD", "2026-01-01");
  expect(mocks.convertDual).toHaveBeenCalledWith(10, "USD", ["EUR", "GBP"], "2026-01-01");
  expect(result.fields).toEqual({
    convertedAmountTrip: "9",
    conversionRateTrip: "0.9",
    convertedCurrencyTrip: "EUR",
    convertedAmountProfile: "8",
    conversionRateProfile: "0.8",
    convertedCurrencyProfile: "GBP",
  });
});

it("leaves a side unconverted when the rates omit it", async () => {
  lookups("EUR", null);
  mocks.convertDual.mockResolvedValue({});
  const result = await computeConversions("trip", "user", 10, "USD", "2026-01-01");
  expect(result.fields.convertedAmountTrip).toBeNull();
  expect(result.conversionError).toBeUndefined();
});

it("saves unconverted and flags a failed lookup", async () => {
  lookups("EUR", "GBP");
  mocks.convertDual.mockRejectedValue(new Error("rates down"));
  const result = await computeConversions("trip", "user", 10, "USD", "2026-01-01");
  expect(result.conversionError).toBe(true);
  expect(result.fields.convertedAmountProfile).toBeNull();
});

it("reads through a supplied executor and tolerates missing rows", async () => {
  const executor = { select: vi.fn() };
  executor.select
    .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
    .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
  const result = await computeConversions("trip", "user", 10, "USD", "2026-01-01", executor as never);
  expect(executor.select).toHaveBeenCalledTimes(2);
  expect(mocks.select).not.toHaveBeenCalled();
  expect(result.fields.convertedCurrencyTrip).toBeNull();
});
