import "server-only";
import { db } from "@/db";
import { days } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Actor, IdempotentRequest } from "@/data/types";
import { lockTripForUpdate, TRIP_NOT_FOUND_MESSAGE, type DbTransaction } from "@/lib/server-action-locks";
import { TripNotFoundError } from "./trip-access";
import { afterTripWrite } from "./trip-write-effects";
import { withIdempotency } from "@/lib/api/idempotency";

/** Anything that can run a read: the client or a transaction. */
export type ReadExecutor = Pick<DbTransaction, "select">;

/** The trip a day belongs to, or undefined when the day is gone. */
export async function readDayTripId(executor: ReadExecutor, dayId: string): Promise<string | undefined> {
  const [day] = await executor.select({ tripId: days.tripId }).from(days).where(eq(days.id, dayId));
  return day?.tripId;
}

export async function lockTrip(transaction: DbTransaction, tripId: string): Promise<void> {
  try {
    await lockTripForUpdate(transaction, tripId);
  } catch (error) {
    if (error instanceof Error && error.message === TRIP_NOT_FOUND_MESSAGE) throw new TripNotFoundError();
    throw error;
  }
}

/**
 * Runs one write in a transaction with idempotency, then the after-commit effect. `mutate` calls `markChanged` only
 * when it wrote, so an unchanged or replayed result, or a rolled-back transaction, runs no effect. `revalidate` names
 * further pages the effect refreshes once.
 */
export async function runTripWrite<Result>(
  actor: Actor,
  tripId: string,
  input: { replay?: IdempotentRequest; payload: unknown; revalidate?: string[] },
  steps: (
    transaction: DbTransaction,
    markChanged: () => void
  ) => { authorize: () => Promise<void>; mutate: () => Promise<Result> }
): Promise<Result> {
  let changed = false;
  const { value, replayed } = await db.transaction((transaction) =>
    withIdempotency<Result>(
      transaction,
      { actor, request: input.replay, payload: input.payload },
      steps(transaction, () => {
        changed = true;
      })
    )
  );
  if (changed && !replayed) {
    if (input.revalidate) afterTripWrite(actor, tripId, input.revalidate);
    else afterTripWrite(actor, tripId);
  }
  return value;
}
