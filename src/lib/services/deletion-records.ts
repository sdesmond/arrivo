import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { idempotencyKeys } from "@/db/schema";
import { IDEMPOTENCY_RETENTION_MS } from "@/lib/idempotency-retention";
import { getNow } from "@/lib/mock-date";
import type { DbTransaction } from "@/lib/server-action-locks";

/**
 * Prefix for rows that remember a deleted resource's client id, so a retried create sent after the delete conflicts
 * instead of bringing the resource back. They share `idempotency_keys`, so the retention sweep removes them.
 */
export const DELETION_RECORD_NAMESPACE = "deleted:";

/** Resources whose creates accept a client id and record their deletions. */
export type DeletionRecordResource = "document";

function recordKey(resource: DeletionRecordResource, id: string): string {
  return `${DELETION_RECORD_NAMESPACE}${resource}:${id.toLowerCase()}`;
}

/** Call inside the deleting transaction, so the record commits or rolls back with the delete. */
export async function recordDeletion(
  transaction: DbTransaction,
  resource: DeletionRecordResource,
  id: string,
  userId: string
): Promise<void> {
  const now = getNow();
  await transaction
    .insert(idempotencyKeys)
    .values({ key: recordKey(resource, id), userId, result: {}, createdAt: now })
    .onConflictDoUpdate({ target: [idempotencyKeys.key, idempotencyKeys.userId], set: { createdAt: now } });
}

/** True when any user deleted this resource within the retention window (the 24-hour replay window). */
export async function wasRecentlyDeleted(
  transaction: DbTransaction,
  resource: DeletionRecordResource,
  id: string
): Promise<boolean> {
  const cutoff = new Date(getNow().getTime() - IDEMPOTENCY_RETENTION_MS);
  const rows = await transaction
    .select({ key: idempotencyKeys.key })
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.key, recordKey(resource, id)), gt(idempotencyKeys.createdAt, cutoff)))
    .limit(1);
  return rows.length > 0;
}
