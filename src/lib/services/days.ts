import "server-only";
import { db } from "@/db";
import { days } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Actor, DayItemOrder, IdempotentRequest } from "@/data/types";
import type { DbTransaction } from "@/lib/server-action-locks";
import { reorderDay as reorderContract } from "@/lib/api/contract/days";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite } from "./trip-write";
import { applyDayOrder } from "./timeline-positions";

async function readDayTripId(executor: Pick<DbTransaction, "select">, dayId: string): Promise<string | undefined> {
  const [day] = await executor.select({ tripId: days.tripId }).from(days).where(eq(days.id, dayId));
  return day?.tripId;
}

/**
 * Replaces a day's complete timeline order. A list that no longer matches the day's events, notes and checklists is a
 * `ConflictError`; a list already in stored order writes nothing and runs no effect. A day that was deleted while the
 * client edited is not found, not a conflict.
 */
export async function reorderDay(
  actor: Actor,
  dayId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<DayItemOrder> {
  dayId = reorderContract.params.parse({ dayId }).dayId;
  const body = reorderContract.body.parse(input);
  const tripId = await readDayTripId(db, dayId);
  if (!tripId) throw new TripNotFoundError();
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<DayItemOrder>(actor, tripId, { replay, payload: body }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
      if ((await readDayTripId(transaction, dayId)) !== tripId) throw new TripNotFoundError();
    },
    mutate: async () => {
      if (await applyDayOrder(transaction, dayId, body.items)) markChanged();
      return { dayId, items: body.items };
    },
  }));
}
