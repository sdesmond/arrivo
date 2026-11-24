import { expect, it, vi } from "vitest";
import { reservations, trips } from "@/db/schema";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), afterTripWrite: vi.fn(), widen: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("./trip-access", () => ({ requireTripRole: vi.fn(), TripNotFoundError: class extends Error {} }));
vi.mock("./client-ids", () => ({ lockClientIds: vi.fn() }));
vi.mock("./deletion-records", () => ({ refuseRecentlyDeleted: vi.fn() }));
vi.mock("@/lib/reservation-date-range", () => ({ extendTripDateRange: mocks.widen }));
vi.mock("@/lib/server-action-locks", () => ({ lockTripForUpdate: vi.fn(), TRIP_NOT_FOUND_MESSAGE: "Trip not found." }));
vi.mock("./trip-write-effects", () => ({ afterTripWrite: mocks.afterTripWrite }));
vi.mock("@/lib/request-deadline", () => ({
  guardTransactionDeadline: (_transaction: unknown, run: () => unknown) => run(),
}));
vi.mock("@/lib/api/idempotency", () => ({
  withIdempotency: async (
    _transaction: unknown,
    _options: unknown,
    steps: { authorize: () => Promise<void>; mutate: () => Promise<unknown> }
  ) => {
    await steps.authorize();
    return { value: await steps.mutate(), replayed: false };
  },
}));

import { createReservation } from "./reservations";

it("runs trip activity and refresh only for the first same-ID creation", async () => {
  const tripId = "123e4567-e89b-12d3-a456-426614174000";
  const id = "223e4567-e89b-12d3-a456-426614174000";
  const actor = { userId: "user" };
  let stored: Record<string, unknown> | undefined;
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === reservations) return stored ? [stored] : [];
          expect(table).toBe(trips);
          return [{ startDate: "2030-06-10", endDate: "2030-06-12" }];
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          stored = { ...values, createdAt: new Date("2030-01-01T00:00:00Z") };
          return [stored];
        },
      }),
    }),
  };
  mocks.transaction.mockImplementation(async (run) => run(transaction));
  const body = { id, type: "other", provider: "Air", startAt: "2030-06-13T12:00:00.000Z" };
  await createReservation(actor, tripId, body);
  await createReservation(actor, tripId, body);
  expect(mocks.widen).toHaveBeenCalledOnce();
  expect(mocks.afterTripWrite).toHaveBeenCalledExactlyOnceWith(actor, tripId);
});
