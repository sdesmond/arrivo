import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireTripRole: vi.fn(),
  runTripWrite: vi.fn(),
  select: vi.fn(),
  lockClientIds: vi.fn(),
  lockTrip: vi.fn(),
  refuseRecentlyDeleted: vi.fn(),
  computeConversions: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("./trip-access", () => ({
  requireTripRole: mocks.requireTripRole,
  TripNotFoundError: class extends Error {},
}));
vi.mock("./trip-write", () => ({ runTripWrite: mocks.runTripWrite, lockTrip: mocks.lockTrip }));
vi.mock("./client-ids", () => ({ lockClientIds: mocks.lockClientIds }));
vi.mock("./deletion-records", () => ({ refuseRecentlyDeleted: mocks.refuseRecentlyDeleted }));
vi.mock("./expense-conversions", () => ({ computeConversions: mocks.computeConversions }));
import { createExpense, listExpenses } from "./expenses";
import { events, expenses, reservations } from "@/db/schema";

const actor = { userId: "user" };
const tripId = "123e4567-e89b-12d3-a456-426614174000";
const id = "223e4567-e89b-12d3-a456-426614174000";
const linkId = "423e4567-e89b-12d3-a456-426614174000";
const body = { id, category: "food", amount: 12.5, currency: "eur", date: "2026-08-01", note: " Lunch " };
const nullFields = {
  convertedAmountTrip: null,
  conversionRateTrip: null,
  convertedCurrencyTrip: null,
  convertedAmountProfile: null,
  conversionRateProfile: null,
  convertedCurrencyProfile: null,
};
const createdAt = new Date("2026-01-01T00:00:00Z");

function run(transaction: unknown, changed = vi.fn()) {
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, changed);
    await operation.authorize();
    return operation.mutate();
  });
  return changed;
}

/** A transaction whose expense table holds `stored`, with optional event and reservation rows. */
function fakeTransaction(options: { stored?: Record<string, unknown>; event?: boolean; reservation?: boolean } = {}) {
  const state = { stored: options.stored, inserted: undefined as Record<string, unknown> | undefined };
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === expenses) return state.stored ? [state.stored] : [];
          if (table === events) return options.event ? [{ id: linkId }] : [];
          if (table === reservations) return options.reservation ? [{ id: linkId }] : [];
          return [];
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          expect(table).toBe(expenses);
          state.inserted = values;
          state.stored = { ...values, createdAt };
          return [state.stored];
        },
      }),
    }),
  };
  return { transaction, state };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.computeConversions.mockResolvedValue({ fields: nullFields });
});

it("rejects an invalid body before authorization or writes", async () => {
  await expect(createExpense(actor, tripId, { ...body, amount: 0 })).rejects.toThrow();
  expect(mocks.requireTripRole).not.toHaveBeenCalled();
  expect(mocks.runTripWrite).not.toHaveBeenCalled();
});

it("checks editor access before entering the transaction", async () => {
  mocks.requireTripRole.mockRejectedValue(new Error("denied"));
  await expect(createExpense(actor, tripId, body)).rejects.toThrow("denied");
  expect(mocks.runTripWrite).not.toHaveBeenCalled();
});

it("creates once under the client-id and trip locks, then replays the stored expense", async () => {
  const { transaction, state } = fakeTransaction();
  const changed = run(transaction);
  await expect(createExpense(actor, tripId, body)).resolves.toMatchObject({
    id,
    tripId,
    amount: 12.5,
    currency: "EUR",
    note: "Lunch",
  });
  expect(state.inserted).toMatchObject({ id, tripId, amount: "12.5", currency: "EUR", note: "Lunch", eventId: null });
  const replayed = await createExpense(actor, tripId, body);
  expect(replayed).toMatchObject({ id });
  expect(replayed).not.toHaveProperty("conversionError");
  expect(mocks.lockClientIds).toHaveBeenCalledWith(transaction, [`expense:${id}`]);
  expect(mocks.lockTrip).toHaveBeenCalledWith(transaction, tripId);
  expect(mocks.requireTripRole).toHaveBeenCalledWith(tripId, "user", "editor", transaction);
  expect(mocks.refuseRecentlyDeleted).toHaveBeenCalledTimes(1);
  expect(mocks.refuseRecentlyDeleted).toHaveBeenCalledWith(transaction, "expense", id);
  expect(mocks.computeConversions).toHaveBeenCalledTimes(1);
  expect(mocks.computeConversions).toHaveBeenCalledWith(tripId, "user", 12.5, "EUR", "2026-08-01", transaction);
  expect(changed).toHaveBeenCalledTimes(1);
});

it("conflicts when the same ID carries different content", async () => {
  const { transaction } = fakeTransaction({
    stored: { id, tripId, category: "food", amount: "12.5", currency: "EUR", date: "2026-08-01", createdAt },
  });
  run(transaction);
  for (const change of [
    { amount: 13 },
    { category: "misc" },
    { currency: "USD" },
    { date: "2026-08-02" },
    { note: "Lunch" },
    { eventId: linkId },
    { reservationId: linkId },
  ])
    await expect(
      createExpense(actor, tripId, { ...body, currency: "EUR", note: undefined, ...change })
    ).rejects.toThrow("different expense");
});

it("matches a stored linked expense with a null note", async () => {
  const { transaction } = fakeTransaction({
    stored: { id, tripId, eventId: linkId, category: "food", amount: "12.5", currency: "EUR", date: "2026-08-01" },
  });
  const changed = run(transaction);
  await expect(
    createExpense(actor, tripId, { ...body, note: null, eventId: linkId.toUpperCase() })
  ).resolves.toMatchObject({ id, eventId: linkId });
  expect(changed).not.toHaveBeenCalled();
});

it("conflicts when an ID belongs to another visible trip", async () => {
  const otherTrip = "323e4567-e89b-12d3-a456-426614174000";
  const { transaction } = fakeTransaction({
    stored: { id, tripId: otherTrip, category: "food", amount: "12.5", currency: "EUR", date: "2026-08-01" },
  });
  mocks.requireTripRole.mockResolvedValue("editor");
  run(transaction);
  await expect(createExpense(actor, tripId, { ...body, currency: "EUR", note: undefined })).rejects.toThrow(
    "different expense"
  );
  expect(mocks.requireTripRole).toHaveBeenCalledWith(otherTrip, "user", "viewer", transaction);
});

it("conceals an ID belonging to a trip the actor cannot view", async () => {
  const otherTrip = "323e4567-e89b-12d3-a456-426614174000";
  const { transaction } = fakeTransaction({ stored: { id, tripId: otherTrip } });
  mocks.requireTripRole.mockImplementation(async (target) => {
    if (target === otherTrip) throw new Error("not found");
    return "editor";
  });
  run(transaction);
  await expect(createExpense(actor, tripId, body)).rejects.toThrow("not found");
});

it("refuses a recently deleted ID without writing", async () => {
  const { transaction, state } = fakeTransaction();
  mocks.refuseRecentlyDeleted.mockRejectedValue(new Error("deleted"));
  const changed = run(transaction);
  await expect(createExpense(actor, tripId, body)).rejects.toThrow("deleted");
  expect(state.inserted).toBeUndefined();
  expect(changed).not.toHaveBeenCalled();
  expect(mocks.computeConversions).not.toHaveBeenCalled();
});

it("saves a linked expense when the link is in this trip", async () => {
  const withEvent = fakeTransaction({ event: true });
  run(withEvent.transaction);
  await createExpense(actor, tripId, { ...body, eventId: linkId });
  expect(withEvent.state.inserted).toMatchObject({ eventId: linkId, reservationId: null });

  const withReservation = fakeTransaction({ reservation: true });
  run(withReservation.transaction);
  await createExpense(actor, tripId, { ...body, reservationId: linkId });
  expect(withReservation.state.inserted).toMatchObject({ eventId: null, reservationId: linkId });
});

it("rejects a link into another trip with no write", async () => {
  for (const link of [{ eventId: linkId }, { reservationId: linkId }]) {
    const { transaction, state } = fakeTransaction();
    const changed = run(transaction);
    await expect(createExpense(actor, tripId, { ...body, ...link })).rejects.toThrow(/not found/);
    expect(state.inserted).toBeUndefined();
    expect(changed).not.toHaveBeenCalled();
  }
});

it("saves unconverted and flags a failed rate lookup", async () => {
  const { transaction, state } = fakeTransaction();
  mocks.computeConversions.mockResolvedValue({ fields: nullFields, conversionError: true });
  const changed = run(transaction);
  await expect(createExpense(actor, tripId, body)).resolves.toMatchObject({ id, conversionError: true });
  expect(state.inserted).toMatchObject(nullFields);
  expect(changed).toHaveBeenCalledTimes(1);
});

it("stores converted totals", async () => {
  const { transaction, state } = fakeTransaction();
  mocks.computeConversions.mockResolvedValue({
    fields: { ...nullFields, convertedAmountTrip: "13.5", convertedCurrencyTrip: "USD", conversionRateTrip: "1.08" },
  });
  run(transaction);
  await expect(createExpense(actor, tripId, body)).resolves.toMatchObject({
    convertedAmountTrip: 13.5,
    convertedCurrencyTrip: "USD",
  });
  expect(state.inserted).toMatchObject({ convertedAmountTrip: "13.5" });
});

it("validates an idempotency-key replay against the stored row", async () => {
  const validate = async (rows: unknown[], result: Record<string, unknown>) => {
    const transaction = { select: () => ({ from: () => ({ where: async () => rows }) }) };
    let operation!: { validateReplay: (value: unknown) => Promise<void> };
    mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
      operation = steps(transaction, vi.fn());
      return undefined;
    });
    await createExpense(actor, tripId, body);
    return operation.validateReplay(result);
  };
  await expect(validate([{ tripId, createdAt }], { createdAt: createdAt.toISOString() })).resolves.toBeUndefined();
  await expect(validate([{ tripId, createdAt }], { createdAt: "other" })).rejects.toThrow();
  await expect(validate([{ tripId: "x", createdAt }], { createdAt: createdAt.toISOString() })).rejects.toThrow();
  await expect(validate([], {})).rejects.toThrow();
  expect(mocks.refuseRecentlyDeleted).toHaveBeenCalledWith(expect.anything(), "expense", id);
  mocks.refuseRecentlyDeleted.mockRejectedValue(new Error("deleted"));
  await expect(validate([], {})).rejects.toThrow("deleted");
});

it("requires editor access before listing and maps the rows", async () => {
  mocks.requireTripRole.mockRejectedValueOnce(new Error("forbidden"));
  await expect(listExpenses(actor, tripId)).rejects.toThrow("forbidden");
  expect(mocks.select).not.toHaveBeenCalled();
  let orderArgs: unknown[] = [];
  mocks.requireTripRole.mockResolvedValue("editor");
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({
        orderBy: async (...order: unknown[]) => {
          orderArgs = order;
          return [{ id, tripId, category: "food", amount: "20", currency: "USD", date: "2026-08-01" }];
        },
      }),
    }),
  });
  await expect(listExpenses(actor, tripId)).resolves.toEqual({
    expenses: [expect.objectContaining({ id, amount: 20, category: "food" })],
  });
  expect(mocks.requireTripRole).toHaveBeenLastCalledWith(tripId, "user", "editor");
  expect(orderArgs).toEqual([expenses.date, expenses.createdAt, expenses.id]);
});

it("rejects a keyed expense replay after cascade deletion before checking its missing reservation", async () => {
  const { transaction, state } = fakeTransaction();
  mocks.refuseRecentlyDeleted.mockRejectedValue(new Error("expense deleted"));
  let validateReplay!: (value: unknown) => Promise<void>;
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    validateReplay = steps(transaction, vi.fn()).validateReplay;
  });
  await createExpense(actor, tripId, { ...body, reservationId: linkId });
  await expect(validateReplay({ createdAt: createdAt.toISOString() })).rejects.toThrow("expense deleted");
  expect(mocks.refuseRecentlyDeleted).toHaveBeenCalledWith(transaction, "expense", id);
  expect(state.inserted).toBeUndefined();
});
