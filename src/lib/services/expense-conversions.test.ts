// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  convertDual: vi.fn(),
  recalculate: vi.fn(),
  recalculateAll: vi.fn(),
  role: vi.fn(),
  lock: vi.fn(),
  run: vi.fn(),
  mark: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/currency", () => ({
  convertDual: mocks.convertDual,
  recalculate: mocks.recalculate,
  recalculateAll: mocks.recalculateAll,
}));

vi.mock("./trip-access", async (original) => ({
  ...(await original<typeof import("./trip-access")>()),
  requireTripRole: mocks.role,
}));
vi.mock("./trip-write", () => ({ lockTrip: mocks.lock, runTripWrite: mocks.run }));

import { computeConversions, recalculateTripExpenses, recalculateExpenseConversions } from "./expense-conversions";

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

const tripId = "123e4567-e89b-12d3-a456-426614174000";
const native = { id: "native", tripId, amount: "35.00", currency: "EUR", category: "food", date: "2026-01-01" };
const foreign = { ...native, id: "foreign", currency: "USD", amount: "100.00" };
function transaction(rows: unknown[], currency: string | null = "EUR") {
  const writes: unknown[] = [];
  const update = vi.fn(() => ({
    set: (fields: unknown) => ({
      where: async () => {
        writes.push(fields);
      },
    }),
  }));
  const select = vi
    .fn()
    .mockReturnValueOnce({ from: () => ({ where: async () => [{ budgetCurrency: currency }] }) })
    .mockReturnValueOnce({ from: () => ({ where: async () => rows }) });
  return { select, update, writes };
}
function runWith(tx: ReturnType<typeof transaction>) {
  mocks.run.mockImplementation(async (_actor, _trip, _options, steps) => {
    const work = steps(tx, mocks.mark);
    await work.authorize();
    return work.mutate();
  });
}
it("recalculates foreign and native amounts under the lock", async () => {
  const tx = transaction([native, foreign]);
  runWith(tx);
  mocks.recalculateAll.mockResolvedValue([{ expenseId: "foreign", convertedAmount: 92, rate: 0.92 }]);
  await expect(recalculateExpenseConversions({ userId: "user" }, tripId, {})).resolves.toEqual({ recalculated: true });
  expect(mocks.role).toHaveBeenCalledWith(tripId, "user", "editor");
  expect(mocks.lock).toHaveBeenCalledWith(tx, tripId);
  expect(mocks.role).toHaveBeenCalledWith(tripId, "user", "editor", tx);
  expect(tx.writes).toEqual([
    expect.objectContaining({ convertedAmountTrip: "92", conversionRateTrip: "0.92", convertedCurrencyTrip: "EUR" }),
    expect.objectContaining({ convertedAmountTrip: "35.00", conversionRateTrip: "1", convertedCurrencyTrip: "EUR" }),
  ]);
  expect(mocks.mark).toHaveBeenCalledOnce();
  for (const fields of tx.writes) expect(fields).toEqual(expect.objectContaining({ updatedAt: expect.any(Date) }));
});
it("checks null currency through the legacy stale-row calculation", async () => {
  const tx = transaction([], null);
  runWith(tx);
  mocks.recalculate.mockResolvedValue([]);
  await recalculateExpenseConversions({ userId: "user" }, tripId, {});
  expect(mocks.recalculate).toHaveBeenCalledWith([], "");
  expect(tx.update).not.toHaveBeenCalled();
  expect(mocks.mark).not.toHaveBeenCalled();
});
it("propagates null-currency and lookup failures without writes", async () => {
  const tx = transaction([foreign], null);
  runWith(tx);
  mocks.recalculate.mockRejectedValue(new Error("missing currency"));
  await expect(recalculateExpenseConversions({ userId: "user" }, tripId, {})).rejects.toThrow("missing currency");
  expect(tx.update).not.toHaveBeenCalled();
});
it("rejects access before writes and rechecks after locking", async () => {
  const tx = transaction([]);
  runWith(tx);
  mocks.role.mockRejectedValueOnce(new Error("denied"));
  await expect(recalculateExpenseConversions({ userId: "user" }, tripId, {})).rejects.toThrow("denied");
  expect(mocks.run).not.toHaveBeenCalled();
  mocks.role.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("revoked"));
  await expect(recalculateExpenseConversions({ userId: "user" }, tripId, {})).rejects.toThrow("revoked");
  expect(tx.update).not.toHaveBeenCalled();
});
it("propagates a batch lookup failure before updating", async () => {
  const tx = transaction([foreign]);
  await tx.select();
  mocks.recalculateAll.mockRejectedValue(new Error("rates down"));
  await expect(recalculateTripExpenses(tx as never, tripId, "EUR")).rejects.toThrow("rates down");
  expect(tx.update).not.toHaveBeenCalled();
});

it("succeeds without effects for an empty trip", async () => {
  const tx = transaction([]);
  runWith(tx);
  mocks.recalculateAll.mockResolvedValue([]);
  await expect(recalculateExpenseConversions({ userId: "user" }, tripId, {})).resolves.toEqual({ recalculated: true });
  expect(tx.update).not.toHaveBeenCalled();
  expect(mocks.mark).not.toHaveBeenCalled();
});
it("propagates a database update failure without marking the write changed", async () => {
  const tx = transaction([native, foreign]);
  runWith(tx);
  mocks.recalculateAll.mockResolvedValue([{ expenseId: "foreign", convertedAmount: 92, rate: 0.92 }]);
  tx.update.mockReturnValueOnce({
    set: () => ({
      where: async () => {
        throw new Error("update failed");
      },
    }),
  });
  await expect(recalculateExpenseConversions({ userId: "user" }, tripId, {})).rejects.toThrow("update failed");
  expect(mocks.mark).not.toHaveBeenCalled();
});
it("rejects a trip removed under the lock", async () => {
  const tx = transaction([]);
  tx.select.mockReset().mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
  runWith(tx);
  await expect(recalculateExpenseConversions({ userId: "user" }, tripId, {})).rejects.toThrow();
  expect(tx.update).not.toHaveBeenCalled();
});

it("uses real stale filtering when the target currency is missing", async () => {
  const actualCurrency = await vi.importActual<typeof import("@/lib/currency")>("@/lib/currency");
  mocks.recalculate.mockImplementation(actualCurrency.recalculate);
  const fresh = { ...foreign, date: "2020-01-01", updatedAt: new Date("2021-01-01") };
  const noEligible = transaction([fresh], null);
  runWith(noEligible);
  await expect(recalculateExpenseConversions({ userId: "user" }, tripId, {})).resolves.toEqual({ recalculated: true });
  expect(noEligible.update).not.toHaveBeenCalled();
  const stale = transaction([{ ...foreign, date: "2099-01-01", updatedAt: new Date("2021-01-01") }], null);
  runWith(stale);
  await expect(recalculateExpenseConversions({ userId: "user" }, tripId, {})).rejects.toThrow();
  expect(stale.update).not.toHaveBeenCalled();
});
