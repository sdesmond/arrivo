import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { pendingFileDeletions } from "@/db/schema";
import type { DbTransaction } from "@/lib/server-action-locks";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";

export interface QueuedFileDeletion {
  id: string;
  url: string;
}

const DRAIN_BATCH = 200;

/**
 * Names files to delete inside the transaction that deletes their rows, so a crash after the commit cannot lose the
 * names. The rows roll back with the transaction, so a rolled-back or replayed write queues nothing.
 */
export async function queueFileDeletions(transaction: DbTransaction, urls: string[]): Promise<QueuedFileDeletion[]> {
  if (urls.length === 0) return [];
  return transaction
    .insert(pendingFileDeletions)
    .values(urls.map((url) => ({ url })))
    .returning({ id: pendingFileDeletions.id, url: pendingFileDeletions.url });
}

/**
 * Removes each file, then clears its queue row. A failure is logged and its row moves to the back of the queue, so
 * files that keep failing cannot fill every drain batch and starve newer rows.
 */
export async function removeQueuedFiles(queued: QueuedFileDeletion[]): Promise<void> {
  const failedIds: string[] = [];
  await Promise.all(
    queued.map(async ({ id, url }) => {
      try {
        await getStorageAdapter().del(url);
      } catch (error) {
        console.warn(`Cleanup failed for ${url}`, error);
        failedIds.push(id);
        return;
      }
      try {
        await db.delete(pendingFileDeletions).where(eq(pendingFileDeletions.id, id));
      } catch (error) {
        console.warn(`Could not clear queued deletion ${url}`, error);
      }
    })
  );
  if (failedIds.length === 0) return;
  try {
    await db
      .update(pendingFileDeletions)
      .set({ createdAt: sql`now()` })
      .where(inArray(pendingFileDeletions.id, failedIds));
  } catch (error) {
    console.warn("Could not requeue failed deletions", error);
  }
}

/** Retries the oldest queued deletions, which only exist after a crash or a storage failure. Never throws. */
export async function drainPendingFileDeletions(): Promise<void> {
  try {
    const queued = await db
      .select({ id: pendingFileDeletions.id, url: pendingFileDeletions.url })
      .from(pendingFileDeletions)
      .orderBy(asc(pendingFileDeletions.createdAt))
      .limit(DRAIN_BATCH);
    await removeQueuedFiles(queued);
  } catch (error) {
    console.error(`[file-cleanup] drain failed (${error instanceof Error ? error.name : "UnknownError"})`);
  }
}
