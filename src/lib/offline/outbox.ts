"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { OfflineDb } from "./db";
import { useOfflineDb } from "./db";
import type { OfflineEntityType, OfflineOperation, OfflineOutboxEntry } from "./schema";

export async function enqueueOutbox(
  database: OfflineDb,
  entityType: OfflineEntityType,
  entityId: string,
  operation: OfflineOperation,
  payload: unknown
): Promise<string> {
  const outboxId = crypto.randomUUID();

  await database.outbox.put({
    id: outboxId,
    entityType,
    entityId,
    operation,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });

  return outboxId;
}

export async function clearOutboxEntry(database: OfflineDb, outboxId: string): Promise<void> {
  await database.outbox.delete(outboxId);
}

export async function getPendingOutboxEntries(database: OfflineDb): Promise<OfflineOutboxEntry[]> {
  const entries = await database.outbox.toArray();
  return [...entries].sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

export function usePendingCount(): number {
  const database = useOfflineDb();

  const pendingCount = useLiveQuery(async () => {
    if (!database) return 0;
    const entries = await database.outbox.toArray();
    return entries.length;
  }, [database]);

  return pendingCount ?? 0;
}
