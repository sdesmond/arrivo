import "server-only";
import { sql } from "drizzle-orm";
import type { DbTransaction } from "@/lib/server-action-locks";

/** Serializes client UUIDs across trips. Sorted, so concurrent claims always lock in one order. */
export async function lockClientIds(transaction: DbTransaction, resources: (string | undefined)[]): Promise<void> {
  for (const resource of resources.filter((entry): entry is string => Boolean(entry)).sort()) {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${resource}, 0))`);
  }
}
