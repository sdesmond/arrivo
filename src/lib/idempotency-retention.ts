import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * How long an `idempotency_keys` row is kept. The sweep deletes rows by age, so no replay record may expire later than
 * this: API replay caps its expiry here and packing's template window reads it.
 */
export const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;
export const IDEMPOTENCY_SWEEP_BATCH = 1000;
export const IDEMPOTENCY_SWEEP_MAX_BATCHES = 20;

export type IdempotencyRetentionDatabase = Pick<typeof db, "transaction">;

/**
 * Deletes replay records older than the retention, a bounded batch per short transaction. Rows a writer holds are
 * skipped: a key being replaced right now gets a fresh `created_at`. Never throws.
 */
export async function purgeExpiredIdempotencyKeys(
  database: IdempotencyRetentionDatabase = db,
  now: Date = new Date()
): Promise<void> {
  const cutoff = new Date(now.getTime() - IDEMPOTENCY_RETENTION_MS).toISOString();
  try {
    for (let batch = 0; batch < IDEMPOTENCY_SWEEP_MAX_BATCHES; batch += 1) {
      const deleted = await database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('statement_timeout', '2000ms', true)`);
        return transaction.execute(sql`
          with candidates as materialized (
            select key, user_id from idempotency_keys
            where created_at < ${cutoff}::timestamptz
            limit ${IDEMPOTENCY_SWEEP_BATCH} for update skip locked
          )
          delete from idempotency_keys stored using candidates
          where stored.key = candidates.key and stored.user_id = candidates.user_id
            and stored.created_at < ${cutoff}::timestamptz
          returning 1 as deleted
        `);
      });
      if (deleted.length < IDEMPOTENCY_SWEEP_BATCH) return;
    }
  } catch (error) {
    console.error(`[idempotency-retention] sweep failed (${error instanceof Error ? error.name : "UnknownError"})`);
  }
}
