import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import type { Actor, Document, IdempotentRequest } from "@/data/types";
import { dbDocToType } from "@/lib/db-mappers";
import { readEventTripId, readReservationTripId, resolveDocumentTripId } from "@/lib/document-ancestry";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import {
  assertUploadContentMatchesType,
  assertValidDocumentUpload,
  createUploadStorageName,
} from "@/lib/upload-policy";
import { formatFileSize, inferDocKind } from "@/lib/utils";
import {
  updateDocument as updateContract,
  deleteDocument as deleteContract,
  uploadTripDocument as uploadContract,
  uploadEventDocument as eventContract,
  uploadReservationDocument as reservationContract,
} from "@/lib/api/contract/documents";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite, type ReadExecutor } from "./trip-write";
import { lockClientIds } from "./client-ids";
import { discardStoredFile, queueFileDeletions, removeQueuedFiles, type QueuedFileDeletion } from "@/lib/file-cleanup";
import { ConflictError } from "./conflict-error";

async function readDocument(executor: ReadExecutor, documentId: string) {
  const [row] = await executor.select().from(documents).where(eq(documents.id, documentId));
  return row;
}

/**
 * Stores one file in its trip, event or reservation scope. The policy checks (type, size, content) and the role check run before
 * anything is stored; a failed insert, a replay or a conflict removes the file just stored. A client `id` makes a retry
 * of the same file safe: the same id with the same trip, scope, name, type and size returns the stored row with no
 * write or effect (its `url` differs, since every attempt stores a fresh file), and any other use of that id is a 409.
 * An id held by a trip the actor cannot see is not found, so a stranger never reads that row.
 */
async function uploadDocument(
  actor: Actor,
  tripId: string,
  input: unknown,
  file: File,
  target?: { eventId?: string; reservationId?: string }
): Promise<Document> {
  const draft = uploadContract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  assertValidDocumentUpload(file);
  await assertUploadContentMatchesType(file);
  const name = file.name;
  const kind = inferDocKind(file.type);
  const size = formatFileSize(file.size);
  const url = await getStorageAdapter().put(
    createUploadStorageName(
      target?.eventId ? "event-document" : target?.reservationId ? "reservation-document" : "trip-document",
      target?.eventId ?? target?.reservationId ?? tripId,
      file.type
    ),
    file
  );
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
          if (target) {
            const currentTripId = await readTargetTripId(transaction, target);
            if (currentTripId !== tripId) throw new TripNotFoundError();
          }
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
                (existing.eventId ?? null) !== (target?.eventId ?? null) ||
                (existing.reservationId ?? null) !== (target?.reservationId ?? null) ||
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
            .values({ ...(draft.id ? { id: draft.id } : {}), tripId, ...target, name, kind, size, url })
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

async function readTargetTripId(
  executor: ReadExecutor,
  target: { eventId?: string; reservationId?: string }
): Promise<string | undefined> {
  return target.eventId
    ? readEventTripId(executor, target.eventId)
    : readReservationTripId(executor, target.reservationId!);
}

export async function uploadTripDocument(actor: Actor, tripId: string, input: unknown, file: File): Promise<Document> {
  tripId = uploadContract.params.parse({ tripId }).tripId;
  return uploadDocument(actor, tripId, input, file);
}

export async function uploadEventDocument(
  actor: Actor,
  eventId: string,
  input: unknown,
  file: File
): Promise<Document> {
  eventId = eventContract.params.parse({ eventId }).eventId;
  eventContract.body.parse(input);
  const tripId = await readTargetTripId(db, { eventId });
  if (!tripId) throw new TripNotFoundError();
  return uploadDocument(actor, tripId, input, file, { eventId });
}

export async function uploadReservationDocument(
  actor: Actor,
  reservationId: string,
  input: unknown,
  file: File
): Promise<Document> {
  reservationId = reservationContract.params.parse({ reservationId }).reservationId;
  reservationContract.body.parse(input);
  const tripId = await readTargetTripId(db, { reservationId });
  if (!tripId) throw new TripNotFoundError();
  return uploadDocument(actor, tripId, input, file, { reservationId });
}

export async function updateDocument(
  actor: Actor,
  documentId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<Document> {
  documentId = updateContract.params.parse({ documentId }).documentId;
  const patch = updateContract.body.parse(input);
  const row = await readDocument(db, documentId);
  const tripId = row && (await resolveDocumentTripId(db, row));
  if (!tripId) throw new TripNotFoundError();
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<Document>(actor, tripId, { replay, payload: patch }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
      const current = await readDocument(transaction, documentId);
      if (!current || (await resolveDocumentTripId(transaction, current)) !== tripId) throw new TripNotFoundError();
      const target = patch.eventId
        ? { eventId: patch.eventId }
        : patch.reservationId
          ? { reservationId: patch.reservationId }
          : undefined;
      if (target && (await readTargetTripId(transaction, target)) !== tripId) throw new TripNotFoundError();
    },
    mutate: async () => {
      const current = await readDocument(transaction, documentId);
      if (!current) throw new TripNotFoundError();
      const changesScope = "eventId" in patch || "reservationId" in patch;
      const name = patch.name ?? current.name;
      // No effective rename leaves legacy rows untouched. Effective writes normalize once, using mapper precedence.
      if (!changesScope && name === current.name) return dbDocToType(current);
      const reservationId = changesScope ? (patch.reservationId ?? null) : current.reservationId;
      const eventId = changesScope ? (patch.eventId ?? null) : reservationId ? null : current.eventId;
      if (
        name === current.name &&
        current.tripId === tripId &&
        current.eventId === eventId &&
        current.reservationId === reservationId
      ) {
        return dbDocToType(current);
      }
      const [updated] = await transaction
        .update(documents)
        .set({ name, tripId, eventId, reservationId })
        .where(eq(documents.id, documentId))
        .returning();
      if (!updated) throw new TripNotFoundError();
      markChanged();
      return dbDocToType(updated);
    },
  }));
}
export async function removeDocument(
  actor: Actor,
  documentId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<null> {
  documentId = deleteContract.params.parse({ documentId }).documentId;
  const body = deleteContract.body.parse(input);
  const { tripId } = body;
  await requireTripRole(tripId, actor.userId, "editor");
  let queued: QueuedFileDeletion[] = [];
  await runTripWrite<null>(actor, tripId, { replay, payload: body }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
      const current = await readDocument(transaction, documentId);
      if (current && (await resolveDocumentTripId(transaction, current)) !== tripId) throw new TripNotFoundError();
    },
    mutate: async () => {
      queued = [];
      const current = await readDocument(transaction, documentId);
      if (!current) return null;
      queued = await queueFileDeletions(transaction, current.url ? [current.url] : []);
      await transaction.delete(documents).where(eq(documents.id, documentId));
      markChanged();
      return null;
    },
  }));
  await removeQueuedFiles(queued);
  return null;
}
