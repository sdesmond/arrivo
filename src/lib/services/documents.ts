import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import type { Actor, Document } from "@/data/types";
import { dbDocToType } from "@/lib/db-mappers";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import {
  assertUploadContentMatchesType,
  assertValidDocumentUpload,
  createUploadStorageName,
} from "@/lib/upload-policy";
import { formatFileSize, inferDocKind } from "@/lib/utils";
import { uploadTripDocument as uploadContract } from "@/lib/api/contract/documents";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite, type ReadExecutor } from "./trip-write";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";

async function readDocument(executor: ReadExecutor, documentId: string) {
  const [row] = await executor.select().from(documents).where(eq(documents.id, documentId));
  return row;
}

/** Removes a stored file the write did not keep. The original failure matters more than a failed cleanup. */
async function discardStoredFile(url: string): Promise<void> {
  try {
    await getStorageAdapter().del(url);
  } catch (error) {
    console.error("[documents] Could not remove an unused upload:", error instanceof Error ? error.name : "unknown");
  }
}

/**
 * Stores one file as a trip-scope document. The policy checks (type, size, content) and the role check run before
 * anything is stored; a failed insert, a replay or a conflict removes the file just stored. A client `id` makes a retry
 * of the same file safe: the same id with the same trip, scope, name, type and size returns the stored row with no
 * write or effect (its `url` differs, since every attempt stores a fresh file), and any other use of that id is a 409.
 * An id held by a trip the actor cannot see is not found, so a stranger never reads that row.
 */
export async function uploadTripDocument(actor: Actor, tripId: string, input: unknown, file: File): Promise<Document> {
  tripId = uploadContract.params.parse({ tripId }).tripId;
  const draft = uploadContract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  assertValidDocumentUpload(file);
  await assertUploadContentMatchesType(file);
  const name = file.name;
  const kind = inferDocKind(file.type);
  const size = formatFileSize(file.size);
  const url = await getStorageAdapter().put(createUploadStorageName("trip-document", tripId, file.type), file);
  let stored: Document;
  try {
    stored = await runTripWrite<Document>(
      actor,
      tripId,
      { payload: { ...draft, name, kind, size } },
      (transaction, markChanged) => ({
        authorize: async () => {
          // Claim the client UUID before the trip lock, in the namespace every document create shares.
          await lockClientIds(transaction, [draft.id && `document:${draft.id}`]);
          await lockTrip(transaction, tripId);
          await requireTripRole(tripId, actor.userId, "editor", transaction);
          if (draft.id) {
            const existing = await readDocument(transaction, draft.id);
            if (existing && existing.tripId !== tripId) {
              if (!existing.tripId) throw new TripNotFoundError();
              await requireTripRole(existing.tripId, actor.userId, "viewer", transaction);
            }
          }
        },
        mutate: async () => {
          if (draft.id) {
            const existing = await readDocument(transaction, draft.id);
            if (existing) {
              if (
                existing.tripId !== tripId ||
                existing.eventId ||
                existing.reservationId ||
                existing.name !== name ||
                existing.kind !== kind ||
                existing.size !== size
              ) {
                throw new ConflictError("This ID was already used for a different document.");
              }
              return dbDocToType(existing);
            }
          }
          const [created] = await transaction
            .insert(documents)
            .values({ ...(draft.id ? { id: draft.id } : {}), tripId, name, kind, size, url })
            .returning();
          markChanged();
          return dbDocToType(created);
        },
      })
    );
  } catch (error) {
    // A failure after the commit (the write effects) leaves a row that points at this file: keep it.
    const [committed] = await db.select({ id: documents.id }).from(documents).where(eq(documents.url, url));
    if (!committed) await discardStoredFile(url);
    throw error;
  }
  if (stored.url !== url) await discardStoredFile(url);
  return stored;
}
