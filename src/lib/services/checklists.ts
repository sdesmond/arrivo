import "server-only";
import { db } from "@/db";
import { checklistItems, itineraryChecklists, days, events, itineraryNotes } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Actor, Checklist, ChecklistItem, IdempotentRequest } from "@/data/types";
import { dbChecklistItemToType, dbChecklistToType } from "@/lib/db-mappers";
import { lockTripForUpdate, TRIP_NOT_FOUND_MESSAGE, type DbTransaction } from "@/lib/server-action-locks";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { afterTripWrite } from "./trip-write-effects";
import { updateChecklistItem as endpoint } from "@/lib/api/contract/checklists";
import { withIdempotency } from "@/lib/api/idempotency";
import {
  createChecklist as createContract,
  updateChecklistTitle as titleContract,
  deleteChecklist as deleteContract,
} from "@/lib/api/contract/checklists";
import { ApiError } from "@/lib/api/errors";
import { getNow } from "@/lib/mock-date";

async function lockTrip(transaction: DbTransaction, tripId: string): Promise<void> {
  try {
    await lockTripForUpdate(transaction, tripId);
  } catch (error) {
    if (error instanceof Error && error.message === TRIP_NOT_FOUND_MESSAGE) throw new TripNotFoundError();
    throw error;
  }
}
async function readChecklist(executor: Pick<DbTransaction, "select">, checklistId: string) {
  const [row] = await executor
    .select({ checklist: itineraryChecklists, tripId: days.tripId })
    .from(itineraryChecklists)
    .innerJoin(days, eq(itineraryChecklists.dayId, days.id))
    .where(eq(itineraryChecklists.id, checklistId));
  return row;
}
async function mappedChecklist(
  transaction: DbTransaction,
  row: typeof itineraryChecklists.$inferSelect
): Promise<Checklist> {
  const items = await transaction
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.checklistId, row.id))
    .orderBy(checklistItems.createdAt);
  return dbChecklistToType(row, items);
}
function collision(): never {
  throw new ApiError(409, "conflict", "This ID was already used for different checklist content.");
}

export async function createChecklist(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<Checklist> {
  tripId = createContract.params.parse({ tripId }).tripId;
  const body = createContract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  let changed = false;
  const { value, replayed } = await db.transaction((transaction) =>
    withIdempotency<Checklist>(
      transaction,
      { actor, request: replay, payload: body },
      {
        authorize: async () => {
          // Serialize client UUIDs across trips before taking the trip lock, including first-item IDs.
          for (const resource of [
            body.id && `checklist:${body.id}`,
            body.firstItem?.id && `checklist-item:${body.firstItem.id}`,
          ]
            .filter((entry): entry is string => Boolean(entry))
            .sort()) {
            await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${resource}, 0))`);
          }
          await lockTrip(transaction, tripId);
          await requireTripRole(tripId, actor.userId, "editor", transaction);
          const [day] = await transaction.select({ tripId: days.tripId }).from(days).where(eq(days.id, body.dayId));
          if (!day || day.tripId !== tripId) throw new TripNotFoundError();
          if (body.id) {
            const existing = await readChecklist(transaction, body.id);
            if (existing && existing.tripId !== tripId)
              await requireTripRole(existing.tripId, actor.userId, "viewer", transaction);
          }
        },
        mutate: async () => {
          if (body.id) {
            const existing = await readChecklist(transaction, body.id);
            if (existing) {
              const current = await mappedChecklist(transaction, existing.checklist);
              if (
                existing.tripId !== tripId ||
                current.tripDayId !== body.dayId ||
                current.position !== body.position ||
                (current.title ?? null) !== (body.title ?? null)
              )
                collision();
              if (
                body.firstItem
                  ? current.items.length !== 1 ||
                    current.items[0].content !== body.firstItem.content ||
                    (body.firstItem.id !== undefined && current.items[0].id !== body.firstItem.id) ||
                    current.items[0].isChecked
                  : current.items.length !== 0
              )
                collision();
              return current;
            }
          }
          if (body.firstItem?.id) {
            const [existingItem] = await transaction
              .select()
              .from(checklistItems)
              .where(eq(checklistItems.id, body.firstItem.id));
            if (existingItem) {
              const existingTripId = await itemTripId(transaction, body.firstItem.id);
              await requireTripRole(existingTripId, actor.userId, "viewer", transaction);
              collision();
            }
          }
          for (const table of [events, itineraryNotes, itineraryChecklists]) {
            await transaction
              .update(table)
              .set({ position: sql`${table.position} + 1` })
              .where(and(eq(table.dayId, body.dayId), gte(table.position, body.position)));
          }
          const now = getNow();
          const [created] = await transaction
            .insert(itineraryChecklists)
            .values({
              ...(body.id ? { id: body.id } : {}),
              dayId: body.dayId,
              position: body.position,
              title: body.title ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          const items = body.firstItem
            ? await transaction
                .insert(checklistItems)
                .values({
                  ...(body.firstItem.id ? { id: body.firstItem.id } : {}),
                  checklistId: created.id,
                  content: body.firstItem.content,
                  createdAt: now,
                })
                .returning()
            : [];
          changed = true;
          return dbChecklistToType(created, items);
        },
      }
    )
  );
  if (changed && !replayed) afterTripWrite(actor, tripId);
  return value;
}

export async function updateChecklistTitle(
  actor: Actor,
  checklistId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<Checklist> {
  checklistId = titleContract.params.parse({ checklistId }).checklistId;
  const patch = titleContract.body.parse(input);
  const ancestry = await readChecklist(db, checklistId);
  if (!ancestry) throw new TripNotFoundError();
  const tripId = ancestry.tripId;
  await requireTripRole(tripId, actor.userId, "editor");
  let changed = false;
  const { value, replayed } = await db.transaction((transaction) =>
    withIdempotency<Checklist>(
      transaction,
      { actor, request: replay, payload: patch },
      {
        authorize: async () => {
          await lockTrip(transaction, tripId);
          const current = await readChecklist(transaction, checklistId);
          if (!current || current.tripId !== tripId) throw new TripNotFoundError();
          await requireTripRole(tripId, actor.userId, "editor", transaction);
        },
        mutate: async () => {
          const current = await readChecklist(transaction, checklistId);
          if (!current) throw new TripNotFoundError();
          if (patch.title === undefined || patch.title === current.checklist.title)
            return mappedChecklist(transaction, current.checklist);
          const [updated] = await transaction
            .update(itineraryChecklists)
            .set({ title: patch.title, updatedAt: getNow() })
            .where(eq(itineraryChecklists.id, checklistId))
            .returning();
          if (!updated) throw new TripNotFoundError();
          changed = true;
          return mappedChecklist(transaction, updated);
        },
      }
    )
  );
  if (changed && !replayed) afterTripWrite(actor, tripId);
  return value;
}

export async function deleteChecklist(
  actor: Actor,
  checklistId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<null> {
  checklistId = deleteContract.params.parse({ checklistId }).checklistId;
  const body = deleteContract.body.parse(input);
  const { tripId } = body;
  await requireTripRole(tripId, actor.userId, "editor");
  let changed = false;
  const { value, replayed } = await db.transaction((transaction) =>
    withIdempotency<null>(
      transaction,
      { actor, request: replay, payload: body },
      {
        authorize: async () => {
          await lockTrip(transaction, tripId);
          await requireTripRole(tripId, actor.userId, "editor", transaction);
          const current = await readChecklist(transaction, checklistId);
          if (current && current.tripId !== tripId) throw new TripNotFoundError();
        },
        mutate: async () => {
          const current = await readChecklist(transaction, checklistId);
          if (current) {
            await transaction.delete(itineraryChecklists).where(eq(itineraryChecklists.id, checklistId));
            changed = true;
          }
          return null;
        },
      }
    )
  );
  if (changed && !replayed) afterTripWrite(actor, tripId);
  return value;
}
async function itemTripId(executor: Pick<DbTransaction, "select">, itemId: string): Promise<string> {
  const [ancestry] = await executor
    .select({ tripId: days.tripId })
    .from(checklistItems)
    .innerJoin(itineraryChecklists, eq(checklistItems.checklistId, itineraryChecklists.id))
    .innerJoin(days, eq(itineraryChecklists.dayId, days.id))
    .where(eq(checklistItems.id, itemId));
  if (!ancestry) throw new TripNotFoundError();
  return ancestry.tripId;
}
/** With `replay`, a retry of the same keyed request returns the first result and writes nothing. */
export async function updateChecklistItem(
  actor: Actor,
  itemId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<ChecklistItem> {
  endpoint.params.parse({ itemId });
  const patch = endpoint.body.parse(input);
  const tripId = await itemTripId(db, itemId);
  await requireTripRole(tripId, actor.userId, "editor");
  const { value, replayed } = await db.transaction((transaction) =>
    withIdempotency<ChecklistItem>(
      transaction,
      { actor, request: replay, payload: patch },
      {
        authorize: async () => {
          try {
            await lockTripForUpdate(transaction, tripId);
          } catch (error) {
            if (error instanceof Error && error.message === TRIP_NOT_FOUND_MESSAGE) throw new TripNotFoundError();
            throw error;
          }
          if ((await itemTripId(transaction, itemId)) !== tripId) throw new TripNotFoundError();
          await requireTripRole(tripId, actor.userId, "editor", transaction);
        },
        mutate: async () => {
          const [updated] = await transaction
            .update(checklistItems)
            .set(patch)
            .where(eq(checklistItems.id, itemId))
            .returning();
          if (!updated) throw new TripNotFoundError();
          return dbChecklistItemToType(updated);
        },
      }
    )
  );
  if (!replayed) afterTripWrite(actor, tripId);
  return value;
}
