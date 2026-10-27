import { after } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type ActivityMaintenanceDatabase = Pick<typeof db, "transaction">;
// Independent namespace scoped to the active schema; never shares lifecycle or per-partition writer locks.
export const ACTIVITY_MAINTENANCE_LOCK = "arrivo:activity-retention-maintenance";

function failure(stage: string, error: unknown): void {
  console.error(`[activity-maintenance] ${stage} failed (${error instanceof Error ? error.name : "UnknownError"})`);
}

/** One nonwaiting pass, with latest-event cutoff semantics for the entire batch. */
export async function cleanupActivity(
  database: ActivityMaintenanceDatabase = db,
  now: Date = new Date()
): Promise<void> {
  try {
    await database.transaction(async (transaction) => {
      await transaction.execute(sql`select set_config('statement_timeout', '2000ms', true)`);
      await transaction.execute(sql`select set_config('lock_timeout', '1ms', true)`);
      const locks = await transaction.execute(
        sql`select pg_try_advisory_xact_lock(hashtextextended(current_schema() || ':' || ${ACTIVITY_MAINTENANCE_LOCK}, 0)) as locked`
      );
      if (!locks[0]?.locked) return;
      // Both candidates and deletion recheck use saved policy from this statement's snapshot. No lifecycle locks.
      await transaction.execute(sql`
        with policy as materialized (
          select ${now.toISOString()}::timestamptz - activity_retention_days * interval '1 day' as cutoff from instance_state where id = true
        ), candidates as materialized (
          select events.id from activity_events events, policy
          where events.ended_at < policy.cutoff
          order by events.ended_at, events.id limit 500 for update of events skip locked
        )
        delete from activity_events events using candidates, policy
        where events.id = candidates.id and events.ended_at < policy.cutoff
      `);
    });
  } catch (error) {
    failure("cleanup", error);
  }
}

// Per server process: layouts render often, and each pass costs a transaction before it can know anything is expired.
export const ACTIVITY_MAINTENANCE_INTERVAL_HOURS = 12;
const HOUR_MS = 60 * 60 * 1000;
let lastScheduledAt = Number.NEGATIVE_INFINITY;

/** Test seam: forget the last scheduled pass. */
export function resetActivityMaintenanceThrottle(): void {
  lastScheduledAt = Number.NEGATIVE_INFINITY;
}

// E2E sets the override to 0 so a scenario's seeded expired rows are not hidden behind an earlier render's pass.
function intervalMs(): number {
  const raw = process.env.ACTIVITY_MAINTENANCE_INTERVAL_HOURS;
  const override = Number(raw);
  return raw && Number.isFinite(override) && override >= 0
    ? override * HOUR_MS
    : ACTIVITY_MAINTENANCE_INTERVAL_HOURS * HOUR_MS;
}

export function scheduleActivityMaintenance(nowMs: number = Date.now()): void {
  if (nowMs - lastScheduledAt < intervalMs()) return;
  try {
    after(() => cleanupActivity());
    lastScheduledAt = nowMs;
  } catch (error) {
    failure("schedule", error);
  }
}
