import "server-only";
import { eq } from "drizzle-orm";
import { trips } from "@/db/schema";
import type { Actor, IdempotentRequest } from "@/data/types";
import { setTripCover as setContract, deleteTripCover } from "@/lib/api/contract/covers";
import { queueFileDeletions, removeQueuedFiles, type QueuedFileDeletion } from "@/lib/file-cleanup";
import { isValidCoverImageUrl, parseOwnStorageUrl } from "@/lib/url-policy";
import { deriveGraphicCover } from "@/lib/utils";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite } from "./trip-write";
import { ValidationFailedError } from "./validation-failed-error";

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
      if (current.coverImageUrl && current.coverImageUrl !== next.coverImageUrl) {
        const stored = parseOwnStorageUrl(current.coverImageUrl);
        if (stored?.scope === "trip-cover" && stored.ownerId === tripId)
          queued = await queueFileDeletions(transaction, [current.coverImageUrl]);
      }
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
