import "server-only";
import { eq } from "drizzle-orm";
import { trips } from "@/db/schema";
import type { Actor, IdempotentRequest } from "@/data/types";
import { db } from "@/db";
import {
  setTripCover as setContract,
  deleteTripCover,
  uploadTripCoverImage as uploadContract,
} from "@/lib/api/contract/covers";
import { discardStoredFile, queueFileDeletions, removeQueuedFiles, type QueuedFileDeletion } from "@/lib/file-cleanup";
import { getStorageAdapter } from "@/lib/storage/storage-adapter";
import { assertUploadContentMatchesType, assertValidCoverUpload, createUploadStorageName } from "@/lib/upload-policy";
import { isValidCoverImageUrl, parseOwnStorageUrl } from "@/lib/url-policy";
import { deriveGraphicCover } from "@/lib/utils";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite } from "./trip-write";
import { ValidationFailedError } from "./validation-failed-error";
import type { DbTransaction } from "@/lib/server-action-locks";

/** Queues the replaced cover for removal when it is this trip's own stored file; any other cover is never ours to delete. */
async function queueReplacedCover(
  transaction: DbTransaction,
  tripId: string,
  previousUrl: string | null,
  nextUrl: string
): Promise<QueuedFileDeletion[]> {
  if (!previousUrl || previousUrl === nextUrl) return [];
  const stored = parseOwnStorageUrl(previousUrl);
  if (stored?.scope !== "trip-cover" || stored.ownerId !== tripId) return [];
  return queueFileDeletions(transaction, [previousUrl]);
}

async function writeCover(
  actor: Actor,
  tripId: string,
  payload: unknown,
  selection: { coverImageUrl: string; coverPhotographer?: string | null; coverPhotographerUrl?: string | null } | null,
  replay?: IdempotentRequest
): Promise<null> {
  await requireTripRole(tripId, actor.userId, "editor");
  let queued: QueuedFileDeletion[] = [];
  await runTripWrite<null>(actor, tripId, { replay, payload }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
    },
    mutate: async () => {
      queued = [];
      const [current] = await transaction
        .select({
          name: trips.name,
          coverImageUrl: trips.coverImageUrl,
          coverPhotographer: trips.coverPhotographer,
          coverPhotographerUrl: trips.coverPhotographerUrl,
        })
        .from(trips)
        .where(eq(trips.id, tripId));
      if (!current) throw new TripNotFoundError();
      const next = {
        coverImageUrl: selection?.coverImageUrl ?? deriveGraphicCover(current.name),
        coverPhotographer: selection?.coverPhotographer ?? null,
        coverPhotographerUrl: selection?.coverPhotographerUrl ?? null,
      };
      if (
        current.coverImageUrl === next.coverImageUrl &&
        current.coverPhotographer === next.coverPhotographer &&
        current.coverPhotographerUrl === next.coverPhotographerUrl
      )
        return null;
      await transaction.update(trips).set(next).where(eq(trips.id, tripId));
      queued = await queueReplacedCover(transaction, tripId, current.coverImageUrl, next.coverImageUrl);
      markChanged();
      return null;
    },
  }));
  if (queued.length) await removeQueuedFiles(queued);
  return null;
}
export async function setTripCover(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<null> {
  tripId = setContract.params.parse({ tripId }).tripId;
  const selection = setContract.body.parse(input);
  if (!isValidCoverImageUrl(selection.coverImageUrl, tripId))
    throw new ValidationFailedError("Invalid cover image URL.", { coverImageUrl: ["Invalid cover image URL."] });
  return writeCover(actor, tripId, selection, selection, replay);
}
export async function removeTripCover(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<null> {
  tripId = deleteTripCover.params.parse({ tripId }).tripId;
  const body = deleteTripCover.body.parse(input);
  return writeCover(actor, tripId, body, null, replay);
}

/**
 * Stores an uploaded image as the trip's cover and clears its attribution. The role check and the upload policy
 * (type, size, content) run before anything is stored. The cover update and the queued removal of the replaced own
 * file share one transaction; the old file is removed only after it commits. A write that fails before the commit
 * removes the new file; one that fails after it keeps the file, since the trip row now points at it. There is no
 * `Idempotency-Key`: every attempt stores a fresh file, so a retry replaces the cover again.
 */
export async function uploadTripCoverImage(actor: Actor, tripId: string, input: unknown, file: File): Promise<null> {
  tripId = uploadContract.params.parse({ tripId }).tripId;
  uploadContract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  assertValidCoverUpload(file);
  await assertUploadContentMatchesType(file);
  const url = await getStorageAdapter().put(createUploadStorageName("trip-cover", tripId, file.type), file);
  let queued: QueuedFileDeletion[] = [];
  try {
    await runTripWrite<null>(actor, tripId, { payload: {} }, (transaction, markChanged) => ({
      authorize: async () => {
        await lockTrip(transaction, tripId);
        await requireTripRole(tripId, actor.userId, "editor", transaction);
      },
      mutate: async () => {
        queued = [];
        const [current] = await transaction
          .select({ coverImageUrl: trips.coverImageUrl })
          .from(trips)
          .where(eq(trips.id, tripId));
        if (!current) throw new TripNotFoundError();
        await transaction
          .update(trips)
          .set({ coverImageUrl: url, coverPhotographer: null, coverPhotographerUrl: null })
          .where(eq(trips.id, tripId));
        queued = await queueReplacedCover(transaction, tripId, current.coverImageUrl, url);
        markChanged();
        return null;
      },
    }));
  } catch (error) {
    // A failure after the commit (the write effects) leaves a trip row that points at this file: keep it.
    const [committed] = await db.select({ id: trips.id }).from(trips).where(eq(trips.coverImageUrl, url));
    if (!committed) await discardStoredFile(url);
    throw error;
  }
  if (queued.length) await removeQueuedFiles(queued);
  return null;
}
