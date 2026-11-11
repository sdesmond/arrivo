import "server-only";
import { db } from "@/db";
import { days, itineraryNotes } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Actor, IdempotentRequest, Note } from "@/data/types";
import { dbNoteToType } from "@/lib/db-mappers";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, readDayTripId, runTripWrite, type ReadExecutor } from "./trip-write";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { appendPosition, shiftFromPosition } from "./timeline-positions";
import {
  createDayNote as createContract,
  deleteDayNote as deleteContract,
  updateDayNote as updateContract,
} from "@/lib/api/contract/itinerary-notes";
import { getNow } from "@/lib/mock-date";

/** A note with the trip its day belongs to; the note row carries no trip of its own. */
async function readNote(executor: ReadExecutor, noteId: string) {
  const [row] = await executor
    .select({ note: itineraryNotes, tripId: days.tripId })
    .from(itineraryNotes)
    .innerJoin(days, eq(itineraryNotes.dayId, days.id))
    .where(eq(itineraryNotes.id, noteId));
  return row;
}

/**
 * Adds a note to a day, at `insertAtPosition` (opening the slot) or last. A client `id` makes the create retry-safe: the
 * same id with the same trip, day and content returns the stored row with no shift, write or effect (its position may
 * have moved since), and any other use of that id is a 409. A day removed while the client edited is a `ConflictError`;
 * one already gone cannot be authorized and is not found.
 */
export async function createDayNote(
  actor: Actor,
  dayId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<Note> {
  dayId = createContract.params.parse({ dayId }).dayId;
  const draft = createContract.body.parse(input);
  const tripId = await readDayTripId(db, dayId);
  if (!tripId) throw new TripNotFoundError();
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<Note>(actor, tripId, { replay, payload: draft }, (transaction, markChanged) => ({
    authorize: async () => {
      // Claim the client UUID before the trip lock, in the namespace every day-note create shares.
      await lockClientIds(transaction, [draft.id && `itinerary-note:${draft.id}`]);
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
      if ((await readDayTripId(transaction, dayId)) !== tripId) {
        throw new ConflictError("This day changed since it was loaded.");
      }
      if (draft.id) {
        const existing = await readNote(transaction, draft.id);
        if (existing && existing.tripId !== tripId)
          await requireTripRole(existing.tripId, actor.userId, "viewer", transaction);
      }
    },
    mutate: async () => {
      if (draft.id) {
        const existing = await readNote(transaction, draft.id);
        if (existing) {
          // `position` is excluded: other inserts shift it, so a retry after a shift is still a replay.
          if (existing.tripId !== tripId || existing.note.dayId !== dayId || existing.note.content !== draft.content) {
            throw new ConflictError("This ID was already used for different note content.");
          }
          return dbNoteToType(existing.note);
        }
      }
      let position: number;
      if (draft.insertAtPosition !== undefined) {
        await shiftFromPosition(transaction, dayId, draft.insertAtPosition);
        position = draft.insertAtPosition;
      } else {
        position = await appendPosition(transaction, dayId);
      }
      const now = getNow();
      const [created] = await transaction
        .insert(itineraryNotes)
        .values({
          ...(draft.id ? { id: draft.id } : {}),
          dayId,
          content: draft.content,
          position,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      markChanged();
      return dbNoteToType(created);
    },
  }));
}

/** Replaces the content. Content equal to the stored text returns the stored note and writes nothing. */
export async function updateDayNote(
  actor: Actor,
  noteId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<Note> {
  noteId = updateContract.params.parse({ noteId }).noteId;
  const patch = updateContract.body.parse(input);
  const found = await readNote(db, noteId);
  if (!found) throw new TripNotFoundError();
  const tripId = found.tripId;
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<Note>(actor, tripId, { replay, payload: patch }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      const current = await readNote(transaction, noteId);
      if (!current || current.tripId !== tripId) throw new TripNotFoundError();
      await requireTripRole(tripId, actor.userId, "editor", transaction);
    },
    mutate: async () => {
      const current = await readNote(transaction, noteId);
      if (!current) throw new TripNotFoundError();
      if (current.note.content === patch.content) return dbNoteToType(current.note);
      const [updated] = await transaction
        .update(itineraryNotes)
        .set({ content: patch.content, updatedAt: getNow() })
        .where(eq(itineraryNotes.id, noteId))
        .returning();
      if (!updated) throw new TripNotFoundError();
      markChanged();
      return dbNoteToType(updated);
    },
  }));
}

/** Deleting a note that is already gone succeeds once the caller is authorized for the supplied trip. */
export async function deleteDayNote(
  actor: Actor,
  noteId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<null> {
  noteId = deleteContract.params.parse({ noteId }).noteId;
  const body = deleteContract.body.parse(input);
  const { tripId } = body;
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<null>(actor, tripId, { replay, payload: body }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
      const current = await readNote(transaction, noteId);
      if (current && current.tripId !== tripId) throw new TripNotFoundError();
    },
    mutate: async () => {
      if (await readNote(transaction, noteId)) {
        await transaction.delete(itineraryNotes).where(eq(itineraryNotes.id, noteId));
        markChanged();
      }
      return null;
    },
  }));
}
