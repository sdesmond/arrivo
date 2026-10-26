import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { db } from "@/db";
import { activityEvents } from "@/db/schema";
import { ActivityEventType, type ActivityBatchInput } from "@/data/types";

/** Takes a database handle (not the singleton) so real-Postgres tests can bind it to an isolated schema. */
export type ActivityBatchDatabase = Pick<typeof db, "transaction">;

export const BATCH_GAP_MS = 10 * 60 * 1000;
// Below ACTIVITY_WRITE_TIMEOUT_MS: the caller's timeout only abandons the promise, so a queued writer must give up on
// its own or it keeps pinning a pooled connection behind a stuck lock holder.
export const BATCH_LOCK_TIMEOUT_MS = 4_000;

/** Event types persisted as one summary row per burst instead of one row per event. */
export const BATCHED_TYPES: ReadonlySet<string> = new Set([ActivityEventType.TripUpdated]);

interface IntervalRow {
  id: string;
  startedAt: Date;
  endedAt: Date;
}

export interface MergePlan {
  keepId: string;
  startedAt: Date;
  endedAt: Date;
  dropIds: string[];
}

/** Rows whose interval ends no earlier than `from` and starts no later than `to` touch the event (inclusive). */
export function connectionWindow(occurredAt: Date): { from: Date; to: Date } {
  return {
    from: new Date(occurredAt.getTime() - BATCH_GAP_MS),
    to: new Date(occurredAt.getTime() + BATCH_GAP_MS),
  };
}

/** Interval union: arrival order cannot change the result. `rows` must be non-empty and sorted earliest first. */
export function planMerge(rows: readonly IntervalRow[], occurredAt: Date): MergePlan {
  const [keep, ...rest] = rows;
  let startedAt = occurredAt;
  let endedAt = occurredAt;
  for (const row of rows) {
    if (row.startedAt < startedAt) startedAt = row.startedAt;
    if (row.endedAt > endedAt) endedAt = row.endedAt;
  }
  return { keepId: keep.id, startedAt, endedAt, dropIds: rest.map((row) => row.id) };
}

/**
 * Merges one event into its burst, atomically. The partition is actor ID + trip ID + the username at event time, so a
 * rename starts a new row. A transaction-scoped advisory lock serializes writers per partition; row locks cannot cover
 * the "no row yet" case. Invariant: no two rows in a partition are connected, so an event bridges at most the rows it
 * touches.
 */
export async function mergeActivityInterval(
  database: ActivityBatchDatabase,
  input: ActivityBatchInput,
  occurredAt: Date
): Promise<void> {
  const tripId = input.tripId ?? null;
  const partitionKey = JSON.stringify([input.type, input.actor.id, tripId, input.actor.username]);
  const { from, to } = connectionWindow(occurredAt);

  await database.transaction(async (transaction) => {
    await transaction.execute(sql`select set_config('lock_timeout', ${`${BATCH_LOCK_TIMEOUT_MS}ms`}, true)`);
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${partitionKey}, 0))`);
    const connected = await transaction
      .select({ id: activityEvents.id, startedAt: activityEvents.startedAt, endedAt: activityEvents.endedAt })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.type, input.type),
          eq(activityEvents.actorId, input.actor.id),
          eq(activityEvents.actorUsername, input.actor.username),
          tripId === null ? isNull(activityEvents.tripId) : eq(activityEvents.tripId, tripId),
          lte(activityEvents.startedAt, to),
          gte(activityEvents.endedAt, from)
        )
      )
      .orderBy(asc(activityEvents.startedAt), asc(activityEvents.id));

    if (connected.length === 0) {
      await transaction.insert(activityEvents).values({
        type: input.type,
        startedAt: occurredAt,
        endedAt: occurredAt,
        actorId: input.actor.id,
        actorUsername: input.actor.username,
        targetId: null,
        targetUsername: null,
        tripId,
      });
      return;
    }

    const plan = planMerge(connected, occurredAt);
    await transaction
      .update(activityEvents)
      .set({ startedAt: plan.startedAt, endedAt: plan.endedAt })
      .where(eq(activityEvents.id, plan.keepId));
    if (plan.dropIds.length > 0) {
      await transaction.delete(activityEvents).where(inArray(activityEvents.id, plan.dropIds));
    }
  });
}
