import "server-only";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { Actor, IdempotentRequest, TripNote, TripNoteOrder } from "@/data/types";
import { dbTripNoteToType } from "@/lib/db-mappers";
import type { DbTransaction } from "@/lib/server-action-locks";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite } from "./trip-write";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import {
  createTripNote as createContract,
  deleteTripNote as deleteContract,
  reorderTripNotes as reorderContract,
  updateTripNote as updateContract,
} from "@/lib/api/contract/trip-notes";
import { getNow } from "@/lib/mock-date";

type Executor = Pick<DbTransaction, "select">;

async function readNote(executor: Executor, noteId: string) {
  const [row] = await executor.select().from(notes).where(eq(notes.id, noteId));
  return row;
}

/** Blank text is no text: it is stored as null. */
function normalize(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/**
 * Prepends a note, shifting every trip note down one. A client `id` makes the create retry-safe: the same id with the
 * same trip, title and body returns the stored row with no shift, write or effect (its position may have moved since),
 * and any other use of that id is a 409. An id held by a trip the actor cannot see is not found.
 */
export async function createTripNote(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<TripNote> {
  tripId = createContract.params.parse({ tripId }).tripId;
  const draft = createContract.body.parse(input);
  const title = normalize(draft.title);
  const body = normalize(draft.body);
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<TripNote>(actor, tripId, { replay, payload: draft }, (transaction, markChanged) => ({
    authorize: async () => {
      // Claim the client UUID before the trip lock, in the namespace every trip-note create shares.
      await lockClientIds(transaction, [draft.id && `trip-note:${draft.id}`]);
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
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
          // `position` is excluded: other creates shift it, so a retry after a shift is still a replay.
          if (existing.tripId !== tripId || existing.title !== title || existing.body !== body) {
            throw new ConflictError("This ID was already used for a different note.");
          }
          return dbTripNoteToType(existing);
        }
      }
      await transaction
        .update(notes)
        .set({ position: sql`${notes.position} + 1` })
        .where(eq(notes.tripId, tripId));
      const now = getNow();
      const [created] = await transaction
        .insert(notes)
        .values({
          ...(draft.id ? { id: draft.id } : {}),
          tripId,
          position: 0,
          title,
          body,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      markChanged();
      return dbTripNoteToType(created);
    },
  }));
}

/**
 * A partial edit: an absent field is kept, a null or blank one is cleared. An edit that changes nothing writes nothing;
 * one that would leave the note with neither field fails validation.
 */
export async function updateTripNote(
  actor: Actor,
  noteId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<TripNote> {
  noteId = updateContract.params.parse({ noteId }).noteId;
  const patch = updateContract.body.parse(input);
  const found = await readNote(db, noteId);
  if (!found) throw new TripNotFoundError();
  const tripId = found.tripId;
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<TripNote>(actor, tripId, { replay, payload: patch }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      const current = await readNote(transaction, noteId);
      if (!current || current.tripId !== tripId) throw new TripNotFoundError();
      await requireTripRole(tripId, actor.userId, "editor", transaction);
    },
    mutate: async () => {
      const current = await readNote(transaction, noteId);
      if (!current) throw new TripNotFoundError();
      const title = patch.title === undefined ? current.title : normalize(patch.title);
      const body = patch.body === undefined ? current.body : normalize(patch.body);
      // The merged note must still hold text; the create contract states that rule.
      createContract.body.parse({ title: title ?? undefined, body: body ?? undefined });
      if (title === current.title && body === current.body) return dbTripNoteToType(current);
      const [updated] = await transaction
        .update(notes)
        .set({ title, body, updatedAt: getNow() })
        .where(eq(notes.id, noteId))
        .returning();
      if (!updated) throw new TripNotFoundError();
      markChanged();
      return dbTripNoteToType(updated);
    },
  }));
}

/** Deleting a note that is already gone succeeds once the caller is authorized for the supplied trip. */
export async function deleteTripNote(
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
        await transaction.delete(notes).where(eq(notes.id, noteId));
        markChanged();
      }
      return null;
    },
  }));
}

/**
 * Replaces the trip's complete note order. A list that is not exactly the trip's notes right now is a `ConflictError`
 * with nothing written; notes already at their position are not written, so an unchanged order writes nothing.
 */
export async function reorderTripNotes(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<TripNoteOrder> {
  tripId = reorderContract.params.parse({ tripId }).tripId;
  const body = reorderContract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<TripNoteOrder>(actor, tripId, { replay, payload: body }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
    },
    mutate: async () => {
      const current = await transaction
        .select({ id: notes.id, position: notes.position })
        .from(notes)
        .where(eq(notes.tripId, tripId));
      const stored = new Map(current.map((row) => [row.id, row.position]));
      if (stored.size !== body.noteIds.length || body.noteIds.some((noteId) => !stored.has(noteId))) {
        throw new ConflictError("The notes changed since they were loaded.");
      }
      for (const [index, noteId] of body.noteIds.entries()) {
        if (stored.get(noteId) === index) continue;
        await transaction
          .update(notes)
          .set({ position: index })
          .where(and(eq(notes.id, noteId), eq(notes.tripId, tripId)));
        markChanged();
      }
      return { tripId, noteIds: body.noteIds };
    },
  }));
}
