import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireTripRole: vi.fn(),
  runTripWrite: vi.fn(),
  select: vi.fn(),
  lockClientIds: vi.fn(),
  lockTrip: vi.fn(),
  refuseRecentlyDeleted: vi.fn(),
  extendTripDateRange: vi.fn(),
  recordDeletion: vi.fn(),
  recordDeletions: vi.fn(),
  queue: vi.fn(),
  cleanup: vi.fn(),
  ancestry: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("./trip-access", () => ({
  requireTripRole: mocks.requireTripRole,
  TripNotFoundError: class extends Error {},
  TripForbiddenError: class extends Error {},
}));
vi.mock("./trip-write", () => ({ runTripWrite: mocks.runTripWrite, lockTrip: mocks.lockTrip }));
vi.mock("./client-ids", () => ({ lockClientIds: mocks.lockClientIds }));
vi.mock("./deletion-records", () => ({
  refuseRecentlyDeleted: mocks.refuseRecentlyDeleted,
  recordDeletion: mocks.recordDeletion,
  recordDeletions: mocks.recordDeletions,
}));
vi.mock("@/lib/file-cleanup", () => ({ queueFileDeletions: mocks.queue, removeQueuedFiles: mocks.cleanup }));
vi.mock("@/lib/document-ancestry", () => ({ resolveDocumentTripId: mocks.ancestry }));
vi.mock("@/lib/reservation-date-range", () => ({ extendTripDateRange: mocks.extendTripDateRange }));
import {
  createReservation,
  deleteReservation,
  getReservation,
  listReservations,
  updateReservation,
} from "./reservations";
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

const reservationId = id;
const stored = {
  id: reservationId,
  tripId,
  type: "other",
  provider: "Hotel",
  startAt: new Date("2030-06-10T12:00:00Z"),
  endAt: new Date("2030-06-11T12:00:00Z"),
  startAddress: "1 Main St",
  startLocationName: "Lobby",
  startLocationLat: 10,
  startLocationLng: 20,
  endAddress: "2 Main St",
  endLocationName: "Dock",
  endLocationLat: 11,
  endLocationLng: 21,
  confirmationCode: "ABC",
  serviceNumber: "42",
  notes: "Note",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function runUpdate(
  row: Record<string, unknown> | undefined,
  body: unknown,
  trip: { startDate: string; endDate: string } | null = { startDate: "2030-06-10", endDate: "2030-06-11" }
) {
  const set = vi.fn();
  const changed = vi.fn();
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => (table === trips ? (trip ? [trip] : []) : row ? [row] : []),
      }),
    }),
    update: (): unknown => ({
      set: (values: Record<string, unknown>) => {
        set(values);
        return { where: () => ({ returning: async () => [{ ...row, ...values }] }) };
      },
    }),
  };
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => (row ? [row] : []) }) }));
  mocks.requireTripRole.mockResolvedValue("editor");
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, changed);
    await operation.authorize();
    return operation.mutate();
  });
  return { result: updateReservation(actor, reservationId, body), set, changed, transaction };
}

it("patches only the named fields, trims the provider and marks one change", async () => {
  const { result, set, changed } = runUpdate(stored, { provider: " Inn ", notes: null });
  await expect(result).resolves.toMatchObject({ id: reservationId, provider: "Inn" });
  expect(set).toHaveBeenCalledWith({ provider: "Inn", notes: null, updatedAt: expect.any(Date) });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(mocks.extendTripDateRange).not.toHaveBeenCalled();
});

it("clears the location name, lat and lng with a cleared address", async () => {
  for (const startAddress of [null, ""]) {
    const { result, set } = runUpdate(stored, { startAddress, endAddress: null });
    await result;
    expect(set).toHaveBeenLastCalledWith({
      startAddress: null,
      startLocationName: null,
      startLocationLat: null,
      startLocationLng: null,
      endAddress: null,
      endLocationName: null,
      endLocationLat: null,
      endLocationLng: null,
      updatedAt: expect.any(Date),
    });
  }
});

it("sets a new address with its location details and ignores details sent with a cleared address", async () => {
  const kept = runUpdate(stored, {
    startAddress: "9 Elm St",
    startLocationName: "",
    startLocationLat: 1,
    startLocationLng: 2,
  });
  await kept.result;
  expect(kept.set).toHaveBeenCalledWith({
    startAddress: "9 Elm St",
    startLocationName: null,
    startLocationLat: 1,
    startLocationLng: 2,
    updatedAt: expect.any(Date),
  });
  const cleared = runUpdate(stored, { endAddress: null, endLocationName: "Kept?", endLocationLat: 5 });
  await cleared.result;
  expect(cleared.set.mock.calls[0][0]).toMatchObject({ endLocationName: null, endLocationLat: null });
});

it("clears codes and times with null or an empty string", async () => {
  const { result, set } = runUpdate(stored, { confirmationCode: null, serviceNumber: null, endAt: "" });
  await result;
  expect(set).toHaveBeenCalledWith({
    confirmationCode: null,
    serviceNumber: null,
    endAt: null,
    updatedAt: expect.any(Date),
  });
});

it("widens the trip with normalized instants when a date moves outside it", async () => {
  const { result, transaction } = runUpdate(stored, { startAt: "2030-06-09T00:30:00+02:00" });
  await result;
  expect(mocks.extendTripDateRange).toHaveBeenCalledWith(
    transaction,
    tripId,
    "2030-06-10",
    "2030-06-11",
    "2030-06-08T22:30:00.000Z",
    "2030-06-11T12:00:00.000Z"
  );
});

it("does not widen when only the time of day changes", async () => {
  const { result } = runUpdate(stored, { startAt: "2030-06-10T15:00:00Z" });
  await result;
  expect(mocks.extendTripDateRange).not.toHaveBeenCalled();
});

it("maps the 45-day limit to a validation failure and rethrows other widening errors", async () => {
  mocks.extendTripDateRange.mockRejectedValueOnce(new Error("Trip cannot exceed 45 days."));
  const limit = runUpdate(stored, { endAt: "2031-01-01T00:00:00Z" });
  await expect(limit.result).rejects.toMatchObject({
    name: "ValidationFailedError",
    message: "Trip cannot exceed 45 days.",
  });
  expect(limit.set).not.toHaveBeenCalled();
  mocks.extendTripDateRange.mockRejectedValueOnce(new Error("boom"));
  await expect(runUpdate(stored, { endAt: "2031-01-01T00:00:00Z" }).result).rejects.toThrow("boom");
});

it("rejects an end before the start, an end without a start and a removed required end with no write", async () => {
  const before = runUpdate(stored, { endAt: "2030-06-09T12:00:00Z" });
  await expect(before.result).rejects.toMatchObject({ name: "ValidationFailedError", message: /after the start/ });
  const orphan = runUpdate({ ...stored, startAt: null, endAt: null }, { endAt: "2030-06-10T12:00:00Z" });
  await expect(orphan.result).rejects.toMatchObject({ message: /start date and time is required/ });
  const required = runUpdate({ ...stored, type: "lodging" }, { endAt: null });
  await expect(required.result).rejects.toMatchObject({ message: /end date and time is required/ });
  const clearedStart = runUpdate(stored, { startAt: null });
  await expect(clearedStart.result).rejects.toMatchObject({ message: /start date and time is required/ });
  for (const attempt of [before, orphan, required, clearedStart]) expect(attempt.set).not.toHaveBeenCalled();
});

it("returns the stored reservation without a write or activity when nothing changes", async () => {
  const same = runUpdate(stored, {
    provider: "Hotel",
    startAt: "2030-06-10T12:00:00.000Z",
    notes: "Note",
    startAddress: "1 Main St",
    startLocationLat: 10,
  });
  await expect(same.result).resolves.toMatchObject({ id: reservationId, provider: "Hotel" });
  const empty = runUpdate(stored, {});
  await empty.result;
  expect(same.set).not.toHaveBeenCalled();
  expect(empty.set).not.toHaveBeenCalled();
  expect(same.changed).not.toHaveBeenCalled();
  expect(empty.changed).not.toHaveBeenCalled();
});

it("returns an unchanged null field without a write", async () => {
  const { result, set } = runUpdate({ ...stored, notes: null }, { notes: null, startAt: "2030-06-10T12:00:00Z" });
  await result;
  expect(set).not.toHaveBeenCalled();
});

it("denies a viewer before entering the transaction and conceals unknown IDs", async () => {
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [stored] }) }));
  mocks.requireTripRole.mockRejectedValue(new Error("forbidden"));
  await expect(updateReservation(actor, reservationId, { notes: "x" })).rejects.toThrow("forbidden");
  expect(mocks.runTripWrite).not.toHaveBeenCalled();
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [] }) }));
  await expect(updateReservation(actor, reservationId, { notes: "x" })).rejects.toThrow();
  expect(mocks.runTripWrite).not.toHaveBeenCalled();
});

it("rejects invalid bodies and IDs before reading", async () => {
  await expect(updateReservation(actor, "nope", {})).rejects.toThrow();
  await expect(updateReservation(actor, reservationId, { type: "flight" })).rejects.toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
});

it("rechecks the row and the role under the lock and fails when the row vanishes", async () => {
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [stored] }) }));
  mocks.requireTripRole.mockResolvedValue("editor");
  let current: Record<string, unknown> | undefined = { ...stored, tripId: "other-trip" };
  const transaction = { select: () => ({ from: () => ({ where: async () => (current ? [current] : []) }) }) };
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, vi.fn());
    await operation.authorize();
    return operation.mutate();
  });
  await expect(updateReservation(actor, reservationId, { notes: "x" })).rejects.toThrow();
  current = undefined;
  await expect(updateReservation(actor, reservationId, { notes: "x" })).rejects.toThrow();
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) =>
    steps(transaction, vi.fn()).mutate()
  );
  await expect(updateReservation(actor, reservationId, { notes: "x" })).rejects.toThrow();
});

it("fails when the trip or the updated row disappears during the write", async () => {
  const noTrip = runUpdate(stored, { startAt: "2030-06-01T12:00:00Z" }, null);
  await expect(noTrip.result).rejects.toThrow();
  const gone = runUpdate(stored, { notes: "x" });
  gone.transaction.update = () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) });
  await expect(gone.result).rejects.toThrow();
});

it("reads a reservation with documents and role-based expense visibility", async () => {
  const doc = {
    id: "doc",
    reservationId,
    tripId,
    name: "Ticket",
    kind: "other",
    addedAt: new Date("2026-01-01T00:00:00Z"),
  };
  const cost = { id: "cost", reservationId, tripId, category: "misc", amount: "20", currency: "USD" };
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => ({
      where: () =>
        Object.assign(Promise.resolve(table === reservations ? [stored] : []), {
          orderBy: async () => (table === documents ? [doc] : table === expenses ? [cost] : []),
        }),
    }),
  }));
  mocks.requireTripRole.mockResolvedValue("viewer");
  const asViewer = await getReservation(actor, reservationId);
  expect(asViewer).toMatchObject({ id: reservationId, documents: [{ id: "doc" }] });
  expect(asViewer.expense).toBeUndefined();
  mocks.requireTripRole.mockResolvedValue("manager");
  expect((await getReservation(actor, reservationId, {})).expense).toMatchObject({ id: "cost", amount: 20 });
  mocks.select.mockImplementation(() => ({
    from: () => ({ where: () => Object.assign(Promise.resolve([stored]), { orderBy: async () => [] }) }),
  }));
  expect((await getReservation(actor, reservationId)).expense).toBeUndefined();
});

it("conceals a missing or foreign reservation on read", async () => {
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [] }) }));
  await expect(getReservation(actor, reservationId)).rejects.toThrow();
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [stored] }) }));
  mocks.requireTripRole.mockRejectedValue(new Error("not found"));
  await expect(getReservation(actor, reservationId)).rejects.toThrow("not found");
  await expect(getReservation(actor, "nope")).rejects.toThrow();
  await expect(getReservation(actor, reservationId, { extra: 1 })).rejects.toThrow();
});

it("records reservation, all expenses and documents before the cascade and cleans up after commit", async () => {
  const order: string[] = [];
  const document = { id: "doc", url: "/file" };
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () =>
          table === reservations ? [stored] : table === documents ? [document] : [{ id: "cost-1" }, { id: "cost-2" }],
      }),
    }),
    delete: () => ({
      where: async () => {
        order.push("delete");
      },
    }),
  };
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [stored] }) }));
  mocks.ancestry.mockResolvedValue(tripId);
  mocks.queue.mockResolvedValue([{ id: "queue", url: "/file" }]);
  mocks.recordDeletion.mockImplementation(async () => {
    order.push("reservation");
  });
  mocks.recordDeletions.mockImplementation(async (_tx, kind) => {
    order.push(kind);
  });
  mocks.cleanup.mockImplementation(async () => {
    order.push("cleanup");
  });
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, vi.fn());
    await operation.authorize();
    const result = await operation.mutate();
    order.push("commit");
    return result;
  });
  await expect(deleteReservation(actor, id)).resolves.toBeNull();
  expect(mocks.recordDeletions).toHaveBeenCalledWith(transaction, "expense", ["cost-1", "cost-2"], actor.userId);
  expect(mocks.recordDeletions).toHaveBeenCalledWith(transaction, "document", ["doc"], actor.userId);
  expect(order).toEqual(["reservation", "expense", "document", "delete", "commit", "cleanup"]);
});

it("treats a missing reservation as an effect-free retry", async () => {
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [] }) }));
  await expect(deleteReservation(actor, id)).resolves.toBeNull();
  expect(mocks.runTripWrite).not.toHaveBeenCalled();
  expect(mocks.cleanup).not.toHaveBeenCalled();
});

it("aborts without cleanup when ancestry or file queue fails", async () => {
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () =>
          table === reservations ? [stored] : table === documents ? [{ id: "doc", url: "/file" }] : [],
      }),
    }),
    delete: vi.fn(),
  };
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [stored] }) }));
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, vi.fn());
    await operation.authorize();
    return operation.mutate();
  });
  mocks.ancestry.mockResolvedValueOnce("foreign");
  await expect(deleteReservation(actor, id)).rejects.toThrow();
  expect(mocks.queue).not.toHaveBeenCalled();
  mocks.ancestry.mockResolvedValue(tripId);
  mocks.queue.mockRejectedValueOnce(new Error("queue failed"));
  await expect(deleteReservation(actor, id)).rejects.toThrow("queue failed");
  expect(transaction.delete).not.toHaveBeenCalled();
  expect(mocks.cleanup).not.toHaveBeenCalled();
});

it("keeps a committed deletion when file cleanup fails", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const transaction = {
    select: () => ({ from: (table: unknown) => ({ where: async () => (table === reservations ? [stored] : []) }) }),
    delete: () => ({ where: async () => undefined }),
  };
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [stored] }) }));
  mocks.queue.mockResolvedValue([]);
  mocks.cleanup.mockRejectedValue(new Error("storage unavailable"));
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, vi.fn());
    await operation.authorize();
    return operation.mutate();
  });
  await expect(deleteReservation(actor, id)).resolves.toBeNull();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

it("denies preflight and conceals a role revoked under the trip lock", async () => {
  const { TripForbiddenError, TripNotFoundError } = await import("./trip-access");
  const transaction = { select: () => ({ from: () => ({ where: async () => [stored] }) }) };
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [stored] }) }));
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, vi.fn());
    await operation.authorize();
    return operation.mutate();
  });
  mocks.requireTripRole.mockRejectedValueOnce(new TripForbiddenError("editor"));
  await expect(deleteReservation(actor, id)).rejects.toBeInstanceOf(TripForbiddenError);
  expect(mocks.runTripWrite).not.toHaveBeenCalled();
  mocks.requireTripRole.mockResolvedValueOnce("editor").mockRejectedValueOnce(new TripForbiddenError("editor"));
  await expect(deleteReservation(actor, id)).rejects.toBeInstanceOf(TripNotFoundError);
  expect(mocks.queue).not.toHaveBeenCalled();
});

it("skips cleanup if the deletion transaction rolls back", async () => {
  const transaction = {
    select: () => ({ from: (table: unknown) => ({ where: async () => (table === reservations ? [stored] : []) }) }),
    delete: () => ({
      where: async () => {
        throw new Error("rollback");
      },
    }),
  };
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [stored] }) }));
  mocks.queue.mockResolvedValue([]);
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, vi.fn());
    await operation.authorize();
    return operation.mutate();
  });
  await expect(deleteReservation(actor, id)).rejects.toThrow("rollback");
  expect(mocks.cleanup).not.toHaveBeenCalled();
});

it("handles a concurrent deletion and missing trip without effects, but propagates other lock failures", async () => {
  const { TripNotFoundError } = await import("./trip-access");
  const transaction = { select: () => ({ from: () => ({ where: async () => [] }) }), delete: vi.fn() };
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [stored] }) }));
  const changed = vi.fn();
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, changed);
    await operation.authorize();
    return operation.mutate();
  });
  await expect(deleteReservation(actor, id)).resolves.toBeNull();
  mocks.lockTrip.mockRejectedValueOnce(new TripNotFoundError());
  await expect(deleteReservation(actor, id)).resolves.toBeNull();
  mocks.lockTrip.mockRejectedValueOnce(new Error("lock timeout"));
  await expect(deleteReservation(actor, id)).rejects.toThrow("lock timeout");
  expect(transaction.delete).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(mocks.cleanup).not.toHaveBeenCalled();
});

it("conceals a reservation moved to a foreign trip while waiting for the lock", async () => {
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [stored] }) }));
  const transaction = { select: () => ({ from: () => ({ where: async () => [{ ...stored, tripId: "foreign" }] }) }) };
  mocks.runTripWrite.mockImplementation(async (_actor, _tripId, _options, steps) => {
    const operation = steps(transaction, vi.fn());
    await operation.authorize();
    return operation.mutate();
  });
  await expect(deleteReservation(actor, id)).rejects.toThrow();
  expect(mocks.queue).not.toHaveBeenCalled();
});
