import { beforeEach, expect, it, vi } from "vitest";
import { trips, expenses } from "@/db/schema";
const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  lock: vi.fn(),
  run: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  recalculate: vi.fn(),
  markChanged: vi.fn(),
}));
vi.mock("./trip-access", async (original) => ({
  ...(await original<typeof import("./trip-access")>()),
  requireTripRole: mocks.requireRole,
}));
vi.mock("./trip-write", () => ({ lockTrip: mocks.lock, runTripWrite: mocks.run }));
vi.mock("@/lib/currency", () => ({ recalculateAll: mocks.recalculate }));
import { updateTrip } from "./trips";
const tripId = "123e4567-e89b-12d3-a456-426614174000";
const actor = { userId: "user" };
const row = {
  id: tripId,
  name: "Old",
  startDate: null,
  endDate: null,
  tags: [],
  transitMode: null,
  budgetTotal: null,
  budgetCurrency: "USD",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({ from: (table: unknown) => ({ where: async () => (table === trips ? [row] : []) }) });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: () => ({ returning: async () => [{ ...row, name: "New" }] }) });
  mocks.run.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const work = steps({ select: mocks.select, update: mocks.update }, mocks.markChanged);
    await work.authorize();
    return work.mutate();
  });
  mocks.recalculate.mockResolvedValue([]);
});
it("locks and rechecks editor access, preserving omitted metadata", async () => {
  await updateTrip(actor, tripId, { name: "New", budgetTotal: 0 });
  expect(mocks.requireRole).toHaveBeenCalledTimes(2);
  expect(mocks.lock).toHaveBeenCalled();
  expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ name: "New", budgetTotal: "0" }));
  expect(mocks.update).toHaveBeenCalledWith(trips);
  expect(mocks.markChanged).toHaveBeenCalledOnce();
  expect(mocks.run).toHaveBeenCalledWith(
    actor,
    tripId,
    expect.objectContaining({ revalidate: ["/trips"] }),
    expect.any(Function)
  );
});
it("recalculates within the write transaction and aborts on failure", async () => {
  mocks.recalculate.mockRejectedValueOnce(new Error("conversion failed"));
  await expect(updateTrip(actor, tripId, { budgetCurrency: "eur", convertCurrency: true })).rejects.toThrow(
    "conversion failed"
  );
  expect(mocks.update).not.toHaveBeenCalledWith(trips);
  expect(mocks.recalculate).toHaveBeenCalledWith([], "EUR");
  expect(mocks.select).toHaveBeenCalled();
  expect(expenses).toBeDefined();
});
it("rejects access before starting the write and rechecks inside the lock", async () => {
  mocks.requireRole.mockRejectedValueOnce(new Error("denied"));
  await expect(updateTrip(actor, tripId, { name: "New" })).rejects.toThrow("denied");
  expect(mocks.run).not.toHaveBeenCalled();
  mocks.requireRole.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("revoked"));
  await expect(updateTrip(actor, tripId, { name: "New" })).rejects.toThrow("revoked");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("returns unchanged data for an empty patch", async () => {
  await expect(updateTrip(actor, tripId, {})).resolves.toMatchObject({ id: tripId, name: "Old" });
  expect(mocks.update).not.toHaveBeenCalled();
});
it("converts expenses and persists their rates before the trip update", async () => {
  mocks.recalculate.mockResolvedValue([{ expenseId: "expense", convertedAmount: 12, rate: 1.2 }]);
  mocks.set.mockReturnValue({ where: () => ({ returning: async () => [{ ...row, budgetCurrency: "EUR" }] }) });
  await updateTrip(actor, tripId, { budgetCurrency: "EUR", convertCurrency: true });
  expect(mocks.update).toHaveBeenCalledWith(expenses);
  expect(mocks.set).toHaveBeenCalledWith(
    expect.objectContaining({ convertedAmountTrip: "12", conversionRateTrip: "1.2", convertedCurrencyTrip: "EUR" })
  );
});
it("rejects missing rows before or after updating", async () => {
  mocks.select.mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
  await expect(updateTrip(actor, tripId, { name: "New" })).rejects.toThrow();
  mocks.set.mockReturnValueOnce({ where: () => ({ returning: async () => [] }) });
  await expect(updateTrip(actor, tripId, { name: "New" })).rejects.toThrow();
});

it("ignores a conversion flag without a currency or metadata", async () => {
  await updateTrip(actor, tripId, { convertCurrency: true });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.markChanged).not.toHaveBeenCalled();
});
it("resets native-currency expenses while converting other expenses", async () => {
  const native = {
    id: "native",
    tripId,
    category: "Food",
    amount: "35.00",
    currency: "EUR",
    date: "2025-01-01",
    convertedAmountTrip: "40.00",
    conversionRateTrip: "1.14",
    convertedCurrencyTrip: "USD",
  };
  const foreign = { ...native, id: "foreign", currency: "USD", amount: "100.00" };
  mocks.select.mockReturnValue({
    from: (table: unknown) => ({ where: async () => (table === trips ? [row] : [native, foreign]) }),
  });
  mocks.recalculate.mockResolvedValue([{ expenseId: "foreign", convertedAmount: 92, rate: 0.92 }]);
  await updateTrip(actor, tripId, { budgetCurrency: "EUR", convertCurrency: true });
  expect(mocks.set).toHaveBeenCalledWith(
    expect.objectContaining({ convertedAmountTrip: "35.00", conversionRateTrip: "1", convertedCurrencyTrip: "EUR" })
  );
  expect(mocks.set).toHaveBeenCalledWith(
    expect.objectContaining({ convertedAmountTrip: "92", conversionRateTrip: "0.92", convertedCurrencyTrip: "EUR" })
  );
});
it("changes currency without touching expenses when conversion is not requested", async () => {
  mocks.set.mockReturnValue({ where: () => ({ returning: async () => [{ ...row, budgetCurrency: "EUR" }] }) });
  await updateTrip(actor, tripId, { budgetCurrency: "EUR" });
  expect(mocks.recalculate).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalledWith(expenses);
  expect(mocks.update).toHaveBeenCalledWith(trips);
});
