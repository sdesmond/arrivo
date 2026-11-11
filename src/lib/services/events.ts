import "server-only";
import { db } from "@/db";
import { days, documents, events } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { Actor, IdempotentRequest, TripEvent } from "@/data/types";
import { dbEventToType } from "@/lib/db-mappers";
import type { DbTransaction } from "@/lib/server-action-locks";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite } from "./trip-write";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { appendPosition, shiftFromPosition } from "./timeline-positions";
import {
  createEvent as createContract,
  deleteEvent as deleteContract,
  updateEvent as updateContract,
} from "@/lib/api/contract/events";
import { queueFileDeletions, removeQueuedFiles, type QueuedFileDeletion } from "@/lib/file-cleanup";
import { getNow } from "@/lib/mock-date";
import type { z } from "zod";

type EventPatch = z.infer<typeof updateContract.body>;
type EventDraft = z.infer<typeof createContract.body>;
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

async function readDayTripId(executor: Pick<DbTransaction, "select">, dayId: string): Promise<string | undefined> {
  const [day] = await executor.select({ tripId: days.tripId }).from(days).where(eq(days.id, dayId));
  return day?.tripId;
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

function idCollision(): never {
  throw new ConflictError("This ID was already used for different event content.");
}

/** Absent and an empty time both mean "no time set". */
function draftTime(value: string | undefined): Date | null {
  return value ? new Date(value) : null;
}

/** Same content as the draft; `position` is excluded because other inserts shift it, so a retry after a shift replays. */
function matchesDraft(row: typeof events.$inferSelect, dayId: string, tripId: string, draft: EventDraft): boolean {
  return (
    row.tripId === tripId &&
    row.dayId === dayId &&
    row.name === draft.name &&
    (row.startAt?.getTime() ?? null) === (draftTime(draft.startAt)?.getTime() ?? null) &&
    (row.endAt?.getTime() ?? null) === (draftTime(draft.endAt)?.getTime() ?? null) &&
    (row.locationName ?? null) === (draft.locationName ?? null) &&
    (row.locationAddress ?? null) === (draft.locationAddress ?? null) &&
    (row.locationLat ?? null) === (draft.locationLat ?? null) &&
    (row.locationLng ?? null) === (draft.locationLng ?? null) &&
    (row.confirmationNumber ?? null) === (draft.confirmationNumber ?? null) &&
    (row.note ?? null) === (draft.note ?? null)
  );
}

/** Where the event lands: after a reference event of the day, else at the position, else last. Opens the slot first. */
async function openSlot(transaction: DbTransaction, dayId: string, draft: EventDraft): Promise<number> {
  if (draft.afterEventId) {
    const [reference] = await transaction
      .select({ position: events.position })
      .from(events)
      .where(and(eq(events.id, draft.afterEventId), eq(events.dayId, dayId)));
    if (reference) {
      await shiftFromPosition(transaction, dayId, reference.position + 1);
      return reference.position + 1;
    }
  }
  if (draft.insertAtPosition !== undefined) {
    await shiftFromPosition(transaction, dayId, draft.insertAtPosition);
    return draft.insertAtPosition;
  }
  return appendPosition(transaction, dayId);
}

/**
 * Adds an event to a day. A client `id` makes the create retry-safe: the same id with the same trip, day and content
 * returns the stored row with no shift, write or effect, and any other use of that id is a 409. A day removed while the
 * client edited is a `ConflictError`; one already gone cannot be authorized and is not found.
 */
export async function createEvent(
  actor: Actor,
  dayId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<TripEvent> {
  dayId = createContract.params.parse({ dayId }).dayId;
  const draft = createContract.body.parse(input);
  const tripId = await readDayTripId(db, dayId);
  if (!tripId) throw new TripNotFoundError();
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<TripEvent>(actor, tripId, { replay, payload: draft }, (transaction, markChanged) => ({
    authorize: async () => {
      // Claim the client UUID before the trip lock, in the namespace every event create shares.
      await lockClientIds(transaction, [draft.id && `event:${draft.id}`]);
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
      if ((await readDayTripId(transaction, dayId)) !== tripId) {
        throw new ConflictError("This day changed since it was loaded.");
      }
      if (draft.id) {
        const existing = await readEvent(transaction, draft.id);
        if (existing && existing.tripId !== tripId)
          await requireTripRole(existing.tripId, actor.userId, "viewer", transaction);
      }
    },
    mutate: async () => {
      if (draft.id) {
        const existing = await readEvent(transaction, draft.id);
        if (existing) {
          if (!matchesDraft(existing, dayId, tripId, draft)) idCollision();
          return dbEventToType(existing);
        }
      }
      const position = await openSlot(transaction, dayId, draft);
      const now = getNow();
      const [created] = await transaction
        .insert(events)
        .values({
          ...(draft.id ? { id: draft.id } : {}),
          dayId,
          tripId,
          name: draft.name,
          startAt: draftTime(draft.startAt),
          endAt: draftTime(draft.endAt),
          locationName: draft.locationName,
          locationAddress: draft.locationAddress,
          locationLat: draft.locationLat,
          locationLng: draft.locationLng,
          confirmationNumber: draft.confirmationNumber,
          note: draft.note,
          position,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      markChanged();
      return dbEventToType(created);
    },
  }));
}

/**
 * Deletes an event, day-less ones included; the DB cascades its expenses. Documents are detached as trip documents when
 * `keepDocuments` is true, otherwise deleted with their files. The file names are queued in the transaction, so the
 * files go only after the commit, never on a replay or rollback, and survive a crash in between for a later drain. An event that is already gone succeeds once the caller is authorized for the supplied trip.
 */
export async function deleteEvent(
  actor: Actor,
  eventId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<null> {
  eventId = deleteContract.params.parse({ eventId }).eventId;
  const body = deleteContract.body.parse(input);
  const { tripId } = body;
  await requireTripRole(tripId, actor.userId, "editor");
  let queued: QueuedFileDeletion[] = [];
  await runTripWrite<null>(actor, tripId, { replay, payload: body }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
      const current = await readEvent(transaction, eventId);
      if (current && current.tripId !== tripId) throw new TripNotFoundError();
    },
    mutate: async () => {
      queued = [];
      if (!(await readEvent(transaction, eventId))) return null;
      if (body.keepDocuments) {
        await transaction.update(documents).set({ eventId: null, tripId }).where(eq(documents.eventId, eventId));
      } else {
        const eventDocuments = await transaction
          .select({ url: documents.url })
          .from(documents)
          .where(eq(documents.eventId, eventId));
        const urls = eventDocuments.map((document) => document.url).filter((url): url is string => !!url);
        queued = await queueFileDeletions(transaction, urls);
        await transaction.delete(documents).where(eq(documents.eventId, eventId));
      }
      await transaction.delete(events).where(eq(events.id, eventId));
      markChanged();
      return null;
    },
  }));
  // Best effort: the rows are gone and the names are queued, so a failure only leaves the file for the next drain.
  await removeQueuedFiles(queued);
  return null;
}
