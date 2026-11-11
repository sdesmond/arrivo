import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lockTripForUpdate: vi.fn(),
  afterTripWrite: vi.fn(),
  withIdempotency: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/server-action-locks", () => ({
  lockTripForUpdate: mocks.lockTripForUpdate,
  TRIP_NOT_FOUND_MESSAGE: "Trip not found.",
}));
vi.mock("./trip-write-effects", () => ({ afterTripWrite: mocks.afterTripWrite }));
vi.mock("@/lib/api/idempotency", () => ({ withIdempotency: mocks.withIdempotency }));

import { days } from "@/db/schema";
import type { DbTransaction } from "@/lib/server-action-locks";
import { TripNotFoundError } from "./trip-access";
import { lockTrip, readDayTripId, runTripWrite, type ReadExecutor } from "./trip-write";

const actor = { userId: "user" };
const transaction = { tag: "transaction" } as unknown as DbTransaction;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation((callback: (tx: DbTransaction) => unknown) => callback(transaction));
});

it("locks the trip row and maps a missing trip to TripNotFoundError", async () => {
  await lockTrip(transaction, "trip");
  expect(mocks.lockTripForUpdate).toHaveBeenCalledWith(transaction, "trip");
  mocks.lockTripForUpdate.mockRejectedValueOnce(new Error("Trip not found."));
  await expect(lockTrip(transaction, "trip")).rejects.toBeInstanceOf(TripNotFoundError);
  mocks.lockTripForUpdate.mockRejectedValueOnce(new Error("db down"));
  await expect(lockTrip(transaction, "trip")).rejects.toThrow("db down");
  mocks.lockTripForUpdate.mockRejectedValueOnce("weird");
  await expect(lockTrip(transaction, "trip")).rejects.toBe("weird");
});

function stubIdempotency(options: { markChanged: boolean; replayed: boolean }) {
  mocks.withIdempotency.mockImplementation(
    async (
      _tx: DbTransaction,
      _input: unknown,
      steps: { authorize: () => Promise<void>; mutate: () => Promise<string> }
    ) => {
      await steps.authorize();
      return { value: await steps.mutate(), replayed: options.replayed };
    }
  );
  return (transactionArg: DbTransaction, markChanged: () => void) => ({
    authorize: async () => {
      expect(transactionArg).toBe(transaction);
    },
    mutate: async () => {
      if (options.markChanged) markChanged();
      return "result";
    },
  });
}

it("passes actor, replay and payload to withIdempotency and runs the effect after a real change", async () => {
  const steps = stubIdempotency({ markChanged: true, replayed: false });
  const replay = { key: "key", method: "PATCH", path: "/api/v1/events/id" };
  await expect(runTripWrite(actor, "trip", { replay, payload: { name: "x" } }, steps)).resolves.toBe("result");
  expect(mocks.withIdempotency).toHaveBeenCalledWith(
    transaction,
    { actor, request: replay, payload: { name: "x" } },
    expect.any(Object)
  );
  expect(mocks.afterTripWrite).toHaveBeenCalledWith(actor, "trip");
});

it("passes the extra paths to the effect after a real change", async () => {
  const steps = stubIdempotency({ markChanged: true, replayed: false });
  await runTripWrite(actor, "trip", { payload: {}, revalidate: ["/trips"] }, steps);
  expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, "trip", ["/trips"]);
});

it.each([
  ["nothing changed", { markChanged: false, replayed: false }],
  ["the result was replayed", { markChanged: true, replayed: true }],
])("runs no effect when %s", async (_name, options) => {
  const steps = stubIdempotency(options);
  await expect(runTripWrite(actor, "trip", { payload: {}, revalidate: ["/trips"] }, steps)).resolves.toBe("result");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

it("runs no effect when the transaction rejects", async () => {
  mocks.withIdempotency.mockRejectedValueOnce(new Error("rolled back"));
  await expect(
    runTripWrite(actor, "trip", { payload: {} }, () => ({ authorize: vi.fn(), mutate: vi.fn() }))
  ).rejects.toThrow("rolled back");
  expect(mocks.afterTripWrite).not.toHaveBeenCalled();
});

function dayLookup(rows: { tripId: string }[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { executor: { select } as unknown as ReadExecutor, select, from, where };
}

it("reads the trip a day belongs to", async () => {
  const { executor, select, from, where } = dayLookup([{ tripId: "trip-1" }]);
  await expect(readDayTripId(executor, "day-1")).resolves.toBe("trip-1");
  expect(select).toHaveBeenCalledExactlyOnceWith({ tripId: days.tripId });
  expect(from).toHaveBeenCalledExactlyOnceWith(days);
  expect(where).toHaveBeenCalledOnce();
});

it("reads no trip for a day that does not exist", async () => {
  const { executor } = dayLookup([]);
  await expect(readDayTripId(executor, "missing")).resolves.toBeUndefined();
});
