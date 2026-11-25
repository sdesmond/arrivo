import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireTripRole: vi.fn(),
  runTripWrite: vi.fn(),
  select: vi.fn(),
  lockClientIds: vi.fn(),
  lockTrip: vi.fn(),
  refuseRecentlyDeleted: vi.fn(),
  computeConversions: vi.fn(),
  recordDeletion: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("./trip-access", () => ({
  requireTripRole: mocks.requireTripRole,
  TripNotFoundError: class TripNotFoundError extends Error {},
  TripForbiddenError: class TripForbiddenError extends Error {},
}));
vi.mock("./trip-write", () => ({ runTripWrite: mocks.runTripWrite, lockTrip: mocks.lockTrip }));
vi.mock("./client-ids", () => ({ lockClientIds: mocks.lockClientIds }));
vi.mock("./deletion-records", () => ({
  refuseRecentlyDeleted: mocks.refuseRecentlyDeleted,
  recordDeletion: mocks.recordDeletion,
}));
vi.mock("./expense-conversions", () => ({ computeConversions: mocks.computeConversions }));
import { createExpense, deleteExpense, listExpenses, updateExpense } from "./expenses";
import { TripForbiddenError, TripNotFoundError } from "./trip-access";
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

const stored = {
  id,
  tripId,
  eventId: null,
  reservationId: null,
  category: "food",
  amount: "12.50",
  currency: "EUR",
  date: "2026-08-01",
  note: "Lunch",
  convertedAmountTrip: "13.5",
  createdAt,
};
const otherTrip = "323e4567-e89b-12d3-a456-426614174000";

/** A transaction holding one expense, recording its update and delete. */
function editTransaction(options: { row?: Record<string, unknown>; event?: boolean; reservation?: boolean } = {}) {
  const row = "row" in options ? options.row : stored;
  const state = { set: undefined as Record<string, unknown> | undefined, deleted: false };
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === expenses) return row ? [row] : [];
          if (table === events) return options.event ? [{ id: linkId }] : [];
          if (table === reservations) return options.reservation ? [{ id: linkId }] : [];
          return [];
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.set = values;
        return { where: () => ({ returning: async () => [{ ...row, ...values }] }) };
      },
    }),
    delete: () => ({
      where: async () => {
        state.deleted = true;
      },
    }),
  };
  return { transaction, state };
}

function readsOutside(row: Record<string, unknown> | undefined) {
  mocks.select.mockReturnValue({ from: () => ({ where: async () => (row ? [row] : []) }) });
}

describe("updateExpense", () => {
  beforeEach(() => readsOutside(stored));

  it("keeps the stored conversion and does no rate lookup for a note-only edit", async () => {
    const { transaction, state } = editTransaction();
    const changed = run(transaction);
    await expect(updateExpense(actor, id, { note: " Dinner " })).resolves.toMatchObject({
      note: "Dinner",
      convertedAmountTrip: 13.5,
    });
    expect(mocks.computeConversions).not.toHaveBeenCalled();
    expect(state.set).toEqual({ note: "Dinner", updatedAt: expect.any(Date) });
    expect(mocks.lockTrip).toHaveBeenCalledWith(transaction, tripId);
    expect(mocks.requireTripRole).toHaveBeenCalledWith(tripId, "user", "editor", transaction);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("recomputes conversions when the amount, currency or date changes", async () => {
    const cases: [Record<string, unknown>, unknown[]][] = [
      [{ amount: 20 }, [20, "EUR", "2026-08-01"]],
      [{ currency: " usd " }, [12.5, "USD", "2026-08-01"]],
      [{ date: "2026-08-02" }, [12.5, "EUR", "2026-08-02"]],
    ];
    for (const [patch, args] of cases) {
      mocks.computeConversions.mockClear();
      const { transaction, state } = editTransaction();
      run(transaction);
      await updateExpense(actor, id, patch);
      expect(mocks.computeConversions).toHaveBeenCalledWith(tripId, "user", ...args, transaction);
      expect(state.set).toMatchObject(nullFields);
    }
  });

  it("saves unconverted and flags a failed rate lookup", async () => {
    mocks.computeConversions.mockResolvedValue({ fields: nullFields, conversionError: true });
    const { transaction } = editTransaction();
    run(transaction);
    await expect(updateExpense(actor, id, { amount: 20 })).resolves.toMatchObject({ conversionError: true });
  });

  it("returns the stored row and writes nothing for an unchanged or empty patch", async () => {
    for (const patch of [{}, { amount: 12.5, currency: "eur", note: "Lunch", eventId: null }]) {
      const { transaction, state } = editTransaction();
      const changed = run(transaction);
      await expect(updateExpense(actor, id, patch)).resolves.toMatchObject({ id, amount: 12.5 });
      expect(state.set).toBeUndefined();
      expect(changed).not.toHaveBeenCalled();
    }
    expect(mocks.computeConversions).not.toHaveBeenCalled();
  });

  it("links and clears links and the note", async () => {
    const linked = editTransaction({ event: true });
    run(linked.transaction);
    await updateExpense(actor, id, { eventId: linkId });
    expect(linked.state.set).toMatchObject({ eventId: linkId });
    const cleared = editTransaction({ row: { ...stored, eventId: linkId } });
    run(cleared.transaction);
    await updateExpense(actor, id, { eventId: null, note: null, reservationId: null });
    expect(cleared.state.set).toMatchObject({ eventId: null, note: null });
    expect(cleared.state.set).not.toHaveProperty("reservationId");
    const reserved = editTransaction({ reservation: true });
    run(reserved.transaction);
    await updateExpense(actor, id, { reservationId: linkId });
    expect(reserved.state.set).toMatchObject({ reservationId: linkId });
  });

  it("rejects a foreign link with no write", async () => {
    for (const [patch, message] of [
      [{ eventId: linkId }, "Event not found."],
      [{ reservationId: linkId }, "Reservation not found."],
    ] as const) {
      const { transaction, state } = editTransaction();
      const changed = run(transaction);
      await expect(updateExpense(actor, id, patch)).rejects.toThrow(message);
      expect(state.set).toBeUndefined();
      expect(changed).not.toHaveBeenCalled();
    }
  });

  it("rejects a merged double link with no write", async () => {
    readsOutside({ ...stored, eventId: linkId });
    const { transaction, state } = editTransaction({
      row: { ...stored, eventId: linkId },
      event: true,
      reservation: true,
    });
    const changed = run(transaction);
    await expect(updateExpense(actor, id, { reservationId: linkId })).rejects.toThrow(
      "both an event and a reservation"
    );
    expect(state.set).toBeUndefined();
    expect(changed).not.toHaveBeenCalled();
  });

  it("rejects an invalid patch before reading", async () => {
    await expect(updateExpense(actor, id, { amount: 0 })).rejects.toThrow();
    await expect(updateExpense(actor, id, { eventId: linkId, reservationId: linkId })).rejects.toThrow();
    await expect(updateExpense(actor, "bad", {})).rejects.toThrow();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("conceals a missing expense and denies a non-editor before the transaction", async () => {
    readsOutside(undefined);
    await expect(updateExpense(actor, id, { note: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
    readsOutside(stored);
    mocks.requireTripRole.mockRejectedValue(new Error("denied"));
    await expect(updateExpense(actor, id, { note: "x" })).rejects.toThrow("denied");
    expect(mocks.runTripWrite).not.toHaveBeenCalled();
  });

  it("rechecks the row and the role under the lock", async () => {
    const { transaction: missing, state: missingState } = editTransaction({ row: undefined });
    run(missing);
    await expect(updateExpense(actor, id, { note: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
    expect(missingState.set).toBeUndefined();

    const { transaction: moved, state: movedState } = editTransaction({ row: { ...stored, tripId: otherTrip } });
    run(moved);
    await expect(updateExpense(actor, id, { note: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
    expect(movedState.set).toBeUndefined();

    mocks.requireTripRole.mockReset();
    mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new TripForbiddenError("viewer"));
    const { transaction: revoked, state: revokedState } = editTransaction();
    run(revoked);
    await expect(updateExpense(actor, id, { note: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
    expect(revokedState.set).toBeUndefined();

    mocks.requireTripRole.mockReset();
    mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("other"));
    run(editTransaction().transaction);
    await expect(updateExpense(actor, id, { note: "x" })).rejects.toThrow("other");
  });

  it("is not found when the row disappears before the update lands", async () => {
    const { transaction } = editTransaction();
    transaction.update = () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) });
    run(transaction);
    await expect(updateExpense(actor, id, { note: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
  });

  it("is not found when the row is gone inside the mutation", async () => {
    let reads = 0;
    const { transaction } = editTransaction();
    transaction.select = () => ({
      from: () => ({ where: async () => (reads++ === 0 ? [stored] : []) }),
    });
    run(transaction);
    await expect(updateExpense(actor, id, { note: "x" })).rejects.toBeInstanceOf(TripNotFoundError);
  });
});

describe("deleteExpense", () => {
  beforeEach(() => readsOutside(stored));

  it("deletes under the lock, records the id and counts one change", async () => {
    const { transaction, state } = editTransaction();
    const changed = run(transaction);
    await expect(deleteExpense(actor, id)).resolves.toBeNull();
    expect(state.deleted).toBe(true);
    expect(mocks.recordDeletion).toHaveBeenCalledWith(transaction, "expense", id, "user");
    expect(changed).toHaveBeenCalledTimes(1);
    expect(mocks.lockTrip).toHaveBeenCalledWith(transaction, tripId);
  });

  it("succeeds with no effects when the expense is already gone", async () => {
    readsOutside(undefined);
    await expect(deleteExpense(actor, id)).resolves.toBeNull();
    expect(mocks.runTripWrite).not.toHaveBeenCalled();
    readsOutside(stored);
    const { transaction, state } = editTransaction({ row: undefined });
    const changed = run(transaction);
    await expect(deleteExpense(actor, id)).resolves.toBeNull();
    expect(state.deleted).toBe(false);
    expect(mocks.recordDeletion).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it("does nothing when the trip vanished under the lock", async () => {
    mocks.lockTrip.mockRejectedValueOnce(new TripNotFoundError());
    const { transaction, state } = editTransaction();
    run(transaction);
    await expect(deleteExpense(actor, id)).resolves.toBeNull();
    expect(state.deleted).toBe(false);
    mocks.lockTrip.mockRejectedValueOnce(new Error("boom"));
    await expect(deleteExpense(actor, id)).rejects.toThrow("boom");
  });

  it("conceals a role revoked under the lock and denies a non-editor outside it", async () => {
    mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new TripForbiddenError("viewer"));
    const { transaction, state } = editTransaction();
    run(transaction);
    await expect(deleteExpense(actor, id)).rejects.toBeInstanceOf(TripNotFoundError);
    expect(state.deleted).toBe(false);
    mocks.requireTripRole.mockReset();
    mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new Error("other"));
    await expect(deleteExpense(actor, id)).rejects.toThrow("other");
    mocks.requireTripRole.mockReset();
    mocks.requireTripRole.mockRejectedValue(new Error("denied"));
    mocks.runTripWrite.mockClear();
    await expect(deleteExpense(actor, id)).rejects.toThrow("denied");
    expect(mocks.runTripWrite).not.toHaveBeenCalled();
  });

  it("conceals an expense that moved to another trip", async () => {
    const { transaction } = editTransaction({ row: { ...stored, tripId: otherTrip } });
    run(transaction);
    await expect(deleteExpense(actor, id)).rejects.toBeInstanceOf(TripNotFoundError);
  });

  it("rejects a malformed id or body before reading", async () => {
    mocks.select.mockClear();
    await expect(deleteExpense(actor, "bad")).rejects.toThrow();
    await expect(deleteExpense(actor, id, { extra: 1 })).rejects.toThrow();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
