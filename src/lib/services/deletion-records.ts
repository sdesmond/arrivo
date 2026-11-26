import { and, eq, gt } from "drizzle-orm";
import { idempotencyKeys } from "@/db/schema";
import { IDEMPOTENCY_RETENTION_MS } from "@/lib/idempotency-retention";
import { getNow } from "@/lib/mock-date";
import type { DbTransaction } from "@/lib/server-action-locks";
import { ConflictError } from "./conflict-error";

/**
 * Prefix for rows that remember a deleted resource's client id, so a retried create sent after the delete conflicts
 * instead of bringing the resource back. They share `idempotency_keys`, so the retention sweep removes them.
 */
export const DELETION_RECORD_NAMESPACE = "deleted:";
// Four bound values per row and one for the conflict update must fit in a single statement.
const DELETION_RECORD_BATCH_SIZE = 10_000;

/** Resources whose creates accept a client id and record their deletions. */
export type DeletionRecordResource =
  | "document"
  | "event"
  | "reservation"
  | "expense"
  | "day"
  | "checklist"
  | "checklist-item"
  | "itinerary-note"
  | "trip-note"
  | "trip"
  | "packing-item"
  | "packing-list"
  | "packing-template"
  | "packing-template-item";

/** Shown when a create reuses a deleted id. The client mints a new id on the 409, so doing it again creates. */
const DELETED_MESSAGES: Record<DeletionRecordResource, string> = {
  document: "This document was deleted. Upload the file again to add it as a new document.",
  event: "This event was deleted. Save again to add it as a new event.",
  reservation: "This reservation was deleted. Save again to add it as a new reservation.",
  expense: "This expense was deleted. Save again to add it as a new expense.",
  day: "This day was deleted. Add a day again to create a new one.",
  checklist: "This checklist was deleted. Save again to add it as a new checklist.",
  "checklist-item": "This item was deleted. Add it again to create a new item.",
  "itinerary-note": "This note was deleted. Save again to add it as a new note.",
  "trip-note": "This note was deleted. Save again to add it as a new note.",
  trip: "This trip was deleted. Create it again to start a new trip.",
  // Sections are packing item rows (`isLabel`), so they share this resource and its message.
  "packing-item": "This packing item was deleted. Add it again to create a new one.",
  "packing-list": "This packing list was deleted. Create it again to start a new list.",
  "packing-template": "This template was deleted. Create it again to start a new template.",
  // Template sections are template item rows (`isLabel`), so they share this resource and its message.
  "packing-template-item": "This template item was deleted. Add it again to create a new one.",
};

function recordKey(resource: DeletionRecordResource, id: string): string {
  return `${DELETION_RECORD_NAMESPACE}${resource}:${id.toLowerCase()}`;
}

/** Call inside the deleting transaction, so the records commit or roll back with the delete. */
export async function recordDeletions(
  transaction: DbTransaction,
  resource: DeletionRecordResource,
  ids: string[],
  userId: string
): Promise<void> {
  if (ids.length === 0) return;
  const now = getNow();
  for (let offset = 0; offset < ids.length; offset += DELETION_RECORD_BATCH_SIZE) {
    await transaction
      .insert(idempotencyKeys)
      .values(
        ids
          .slice(offset, offset + DELETION_RECORD_BATCH_SIZE)
          .map((id) => ({ key: recordKey(resource, id), userId, result: {}, createdAt: now }))
      )
      .onConflictDoUpdate({ target: [idempotencyKeys.key, idempotencyKeys.userId], set: { createdAt: now } });
  }
}

/** Call inside the deleting transaction, so the record commits or rolls back with the delete. */
export function recordDeletion(
  transaction: DbTransaction,
  resource: DeletionRecordResource,
  id: string,
  userId: string
): Promise<void> {
  return recordDeletions(transaction, resource, [id], userId);
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

/**
 * For a create whose client id names no row: a 409 (`ConflictError`) when that id was deleted within the retention
 * window, so a retry sent after the delete cannot bring the resource back.
 */
export async function refuseRecentlyDeleted(
  transaction: DbTransaction,
  resource: DeletionRecordResource,
  id: string
): Promise<void> {
  if (await wasRecentlyDeleted(transaction, resource, id)) throw new ConflictError(DELETED_MESSAGES[resource]);
}
