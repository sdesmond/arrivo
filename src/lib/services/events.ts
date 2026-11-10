import "server-only";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Actor, IdempotentRequest, TripEvent } from "@/data/types";
import { dbEventToType } from "@/lib/db-mappers";
import type { DbTransaction } from "@/lib/server-action-locks";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite } from "./trip-write";
import { updateEvent as updateContract } from "@/lib/api/contract/events";
import { getNow } from "@/lib/mock-date";
import type { z } from "zod";

type EventPatch = z.infer<typeof updateContract.body>;
type EventChanges = Partial<
  Pick<
    typeof events.$inferInsert,
    | "name"
    | "startAt"
    | "endAt"
    | "locationName"
    | "locationAddress"
    | "locationLat"
    | "locationLng"
    | "confirmationNumber"
    | "note"
  >
>;

async function readEvent(executor: Pick<DbTransaction, "select">, eventId: string) {
  const [row] = await executor.select().from(events).where(eq(events.id, eventId));
  return row;
}

/** Explicit allow-list: a patch can never reach `id`, `tripId`, `dayId`, `position` or `displacedDate`. */
function columnChanges(patch: EventPatch): EventChanges {
  const changes: EventChanges = {};
  if (patch.name !== undefined) changes.name = patch.name;
  // An empty time means "no time set", the same as null.
  if (patch.startAt !== undefined) changes.startAt = patch.startAt ? new Date(patch.startAt) : null;
  if (patch.endAt !== undefined) changes.endAt = patch.endAt ? new Date(patch.endAt) : null;
  if (patch.locationName !== undefined) changes.locationName = patch.locationName;
  if (patch.locationAddress !== undefined) changes.locationAddress = patch.locationAddress;
  if (patch.locationLat !== undefined) changes.locationLat = patch.locationLat;
  if (patch.locationLng !== undefined) changes.locationLng = patch.locationLng;
  if (patch.confirmationNumber !== undefined) changes.confirmationNumber = patch.confirmationNumber;
  if (patch.note !== undefined) changes.note = patch.note;
  return changes;
}

/**
 * Applies only the supplied fields: absent leaves a column alone and `null` clears it. Scheduled and day-less events
 * are both editable; an empty patch returns the stored event and writes nothing.
 */
export async function updateEvent(
  actor: Actor,
  eventId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<TripEvent> {
  eventId = updateContract.params.parse({ eventId }).eventId;
  const patch = updateContract.body.parse(input);
  const found = await readEvent(db, eventId);
  if (!found) throw new TripNotFoundError();
  const tripId = found.tripId;
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<TripEvent>(actor, tripId, { replay, payload: patch }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      const current = await readEvent(transaction, eventId);
      if (!current || current.tripId !== tripId) throw new TripNotFoundError();
      await requireTripRole(tripId, actor.userId, "editor", transaction);
    },
    mutate: async () => {
      const current = await readEvent(transaction, eventId);
      if (!current) throw new TripNotFoundError();
      const changes = columnChanges(patch);
      if (Object.keys(changes).length === 0) return dbEventToType(current);
      const [updated] = await transaction
        .update(events)
        .set({ ...changes, updatedAt: getNow() })
        .where(eq(events.id, eventId))
        .returning();
      if (!updated) throw new TripNotFoundError();
      markChanged();
      return dbEventToType(updated);
    },
  }));
}
