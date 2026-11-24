import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireTripRole: vi.fn(),
  runTripWrite: vi.fn(),
  select: vi.fn(),
  lockClientIds: vi.fn(),
  refuseRecentlyDeleted: vi.fn(),
  extendTripDateRange: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("./trip-access", () => ({ requireTripRole: mocks.requireTripRole, TripNotFoundError: class extends Error {} }));
vi.mock("./trip-write", () => ({ runTripWrite: mocks.runTripWrite, lockTrip: vi.fn() }));
vi.mock("./client-ids", () => ({ lockClientIds: mocks.lockClientIds }));
vi.mock("./deletion-records", () => ({ refuseRecentlyDeleted: mocks.refuseRecentlyDeleted }));
vi.mock("@/lib/reservation-date-range", () => ({ extendTripDateRange: mocks.extendTripDateRange }));
import { createReservation, listReservations } from "./reservations";
import { documents, expenses, reservations, trips } from "@/db/schema";

const actor = { userId: "user" };
const tripId = "123e4567-e89b-12d3-a456-426614174000";
const id = "223e4567-e89b-12d3-a456-426614174000";
beforeEach(() => vi.resetAllMocks());

it("rejects missing required end before authorization or writes", async () => {
  await expect(createReservation(actor, tripId, { id, type: "lodging", provider: "Hotel" })).rejects.toThrow();
  expect(mocks.requireTripRole).not.toHaveBeenCalled();
  expect(mocks.runTripWrite).not.toHaveBeenCalled();
});

it("checks editor access before entering the transaction", async () => {
  mocks.requireTripRole.mockRejectedValue(new Error("denied"));
  await expect(createReservation(actor, tripId, { id, type: "other", provider: "Test" })).rejects.toThrow("denied");
  expect(mocks.runTripWrite).not.toHaveBeenCalled();
});

it("returns a matching stored reservation without marking a change and rejects changed content", async () => {
  const row = {
    id,
    tripId,
    type: "other",
    provider: "Test",
    startAt: null,
    endAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  const transaction = { select: () => ({ from: () => ({ where: async () => [row] }) }) };
  const changed = vi.fn();
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, changed);
    await operation.authorize();
    return operation.mutate();
  });
  await expect(createReservation(actor, tripId, { id, type: "other", provider: "Test" })).resolves.toMatchObject({
    id,
    tripId,
  });
  expect(changed).not.toHaveBeenCalled();
  await expect(createReservation(actor, tripId, { id, type: "other", provider: "Changed" })).rejects.toThrow(
    "different reservation"
  );
});

it("creates only once after locking and checking for a deleted ID", async () => {
  let stored: Record<string, unknown> | undefined;
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () =>
          table === reservations ? (stored ? [stored] : []) : [{ startDate: "2026-01-01", endDate: "2026-01-03" }],
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          expect(table).toBe(reservations);
          stored = { ...values, createdAt: new Date("2026-01-01T00:00:00Z") };
          return [stored];
        },
      }),
    }),
  };
  const changed = vi.fn();
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, changed);
    await operation.authorize();
    return operation.mutate();
  });
  const body = { id, type: "other", provider: " Test " };
  await expect(createReservation(actor, tripId, body)).resolves.toMatchObject({ id, provider: "Test" });
  await expect(createReservation(actor, tripId, body)).resolves.toMatchObject({ id, provider: "Test" });
  expect(mocks.lockClientIds).toHaveBeenCalledWith(transaction, [`reservation:${id}`]);
  expect(mocks.refuseRecentlyDeleted).toHaveBeenCalledTimes(1);
  expect(mocks.extendTripDateRange).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalledTimes(1);
});

it("rejects a dateless trip before creating a reservation", async () => {
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({ where: async () => (table === trips ? [{ startDate: null, endDate: null }] : []) }),
    }),
  };
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, vi.fn());
    await operation.authorize();
    return operation.mutate();
  });
  await expect(createReservation(actor, tripId, { id, type: "other", provider: "Test" })).rejects.toThrow(
    "Set trip dates"
  );
});

it("widens using the UTC calendar dates of offset timestamps", async () => {
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => (table === trips ? [{ startDate: "2030-06-10", endDate: "2030-06-12" }] : []),
      }),
    }),
    insert: () => ({ values: (values: Record<string, unknown>) => ({ returning: async () => [values] }) }),
  };
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, vi.fn());
    await operation.authorize();
    return operation.mutate();
  });
  await createReservation(actor, tripId, {
    id,
    type: "other",
    provider: "Air",
    startAt: "2030-06-10T00:30:00+02:00",
    endAt: "2030-06-12T23:30:00-02:00",
  });
  expect(mocks.extendTripDateRange).toHaveBeenCalledWith(
    transaction,
    tripId,
    "2030-06-10",
    "2030-06-12",
    "2030-06-09T22:30:00.000Z",
    "2030-06-13T01:30:00.000Z"
  );
});

it("checks membership before listing reservations", async () => {
  mocks.requireTripRole.mockRejectedValue(new Error("not found"));
  await expect(listReservations(actor, tripId)).rejects.toThrow("not found");
  expect(mocks.select).not.toHaveBeenCalled();
});

it.each(["viewer", "editor"])("lists documents and applies expense visibility for a %s", async (role) => {
  const row = { id, tripId, type: "other", provider: "Test" };
  const doc = {
    id: "doc",
    reservationId: id,
    tripId,
    name: "Ticket",
    kind: "other",
    addedAt: new Date("2026-01-01T00:00:00Z"),
  };
  const cost = { id: "cost", reservationId: id, tripId, category: "misc", amount: "20", currency: "USD" };
  mocks.requireTripRole.mockResolvedValue(role);
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => ({
      where: () => ({
        orderBy: async () =>
          table === reservations ? [row] : table === documents ? [doc] : table === expenses ? [cost] : [],
      }),
    }),
  }));
  const result = await listReservations(actor, tripId);
  expect(result.reservations[0]).toMatchObject({ id, documents: [{ id: "doc", name: "Ticket" }] });
  if (role === "viewer") expect(result.reservations[0].expense).toBeUndefined();
  else expect(result.reservations[0].expense).toMatchObject({ id: "cost", amount: 20 });
});

it("conceals an ID belonging to a trip the actor cannot view", async () => {
  const otherTrip = "323e4567-e89b-12d3-a456-426614174000";
  const transaction = { select: () => ({ from: () => ({ where: async () => [{ id, tripId: otherTrip }] }) }) };
  mocks.requireTripRole.mockImplementation(async (target) => {
    if (target === otherTrip) throw new Error("not found");
    return "editor";
  });
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, vi.fn());
    await operation.authorize();
    return operation.mutate();
  });
  await expect(createReservation(actor, tripId, { id, type: "other", provider: "Test" })).rejects.toThrow("not found");
});

it("conflicts when an ID belongs to another visible trip", async () => {
  const otherTrip = "323e4567-e89b-12d3-a456-426614174000";
  const row = { id, tripId: otherTrip, type: "other", provider: "Test" };
  const transaction = { select: () => ({ from: () => ({ where: async () => [row] }) }) };
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, vi.fn());
    await operation.authorize();
    return operation.mutate();
  });
  await expect(createReservation(actor, tripId, { id, type: "other", provider: "Test" })).rejects.toThrow(
    "different reservation"
  );
  expect(mocks.requireTripRole).toHaveBeenCalledWith(otherTrip, actor.userId, "viewer", transaction);
});

it("checks deletion retention before creating a missing ID", async () => {
  const transaction = { select: () => ({ from: () => ({ where: async () => [] }) }) };
  mocks.refuseRecentlyDeleted.mockRejectedValue(new Error("deleted"));
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, vi.fn());
    await operation.authorize();
    return operation.mutate();
  });
  await expect(createReservation(actor, tripId, { id, type: "other", provider: "Test" })).rejects.toThrow("deleted");
});

it("validates a keyed replay against the still-existing reservation", async () => {
  const createdAt = new Date("2026-01-01T00:00:00Z");
  let row: Record<string, unknown> | undefined = { id, tripId, createdAt };
  const transaction = { select: () => ({ from: () => ({ where: async () => (row ? [row] : []) }) }) };
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, vi.fn());
    await operation.authorize();
    await operation.validateReplay({ createdAt: createdAt.toISOString() });
    return { id };
  });
  const body = { id, type: "other", provider: "Test" };
  await expect(createReservation(actor, tripId, body)).resolves.toEqual({ id });
  row = undefined;
  mocks.refuseRecentlyDeleted.mockRejectedValueOnce(new Error("deleted"));
  await expect(createReservation(actor, tripId, body)).rejects.toThrow("deleted");
});
