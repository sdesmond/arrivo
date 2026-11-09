import "server-only";
import { db } from "@/db";
import {
  checklistItems,
  itineraryChecklists,
  days,
  events,
  itineraryNotes,
  packingItems,
  packingTemplateItems,
  packingTemplates,
  tripPackingLists,
} from "@/db/schema";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import type { Actor, Checklist, ChecklistItem, IdempotentRequest } from "@/data/types";
import { dbChecklistItemToType, dbChecklistToType } from "@/lib/db-mappers";
import { lockTripForUpdate, TRIP_NOT_FOUND_MESSAGE, type DbTransaction } from "@/lib/server-action-locks";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { afterTripWrite } from "./trip-write-effects";
import { withIdempotency } from "@/lib/api/idempotency";
import {
  createChecklist as createContract,
  updateChecklistTitle as titleContract,
  deleteChecklist as deleteContract,
  createChecklistItem as createItemContract,
  updateChecklistItem as updateItemContract,
  deleteChecklistItem as deleteItemContract,
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
/** Serializes client UUIDs across trips. Sorted, so concurrent claims always lock in one order. */
async function lockClientIds(transaction: DbTransaction, resources: (string | undefined)[]): Promise<void> {
  for (const resource of resources.filter((entry): entry is string => Boolean(entry)).sort()) {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${resource}, 0))`);
  }
}
async function readItem(executor: Pick<DbTransaction, "select">, itemId: string) {
  const [item] = await executor.select().from(checklistItems).where(eq(checklistItems.id, itemId));
  return item;
}
async function readItemTripId(executor: Pick<DbTransaction, "select">, itemId: string): Promise<string | undefined> {
  const [ancestry] = await executor
    .select({ tripId: days.tripId })
    .from(checklistItems)
    .innerJoin(itineraryChecklists, eq(checklistItems.checklistId, itineraryChecklists.id))
    .innerJoin(days, eq(itineraryChecklists.dayId, days.id))
    .where(eq(checklistItems.id, itemId));
  return ancestry?.tripId;
}
async function itemTripId(executor: Pick<DbTransaction, "select">, itemId: string): Promise<string> {
  const tripId = await readItemTripId(executor, itemId);
  if (!tripId) throw new TripNotFoundError();
  return tripId;
}
/**
 * Runs one write in a transaction with idempotency, then the after-commit effect. `mutate` calls `markChanged` only
 * when it wrote, so an unchanged or replayed result, or a rolled-back transaction, runs no effect.
 */
async function runChecklistWrite<Result>(
  actor: Actor,
  tripId: string,
  input: { replay?: IdempotentRequest; payload: unknown },
  steps: (
    transaction: DbTransaction,
    markChanged: () => void
  ) => { authorize: () => Promise<void>; mutate: () => Promise<Result> }
): Promise<Result> {
  let changed = false;
  const { value, replayed } = await db.transaction((transaction) =>
    withIdempotency<Result>(
      transaction,
      { actor, request: input.replay, payload: input.payload },
      steps(transaction, () => {
        changed = true;
      })
    )
  );
  if (changed && !replayed) afterTripWrite(actor, tripId);
  return value;
}

interface PackingSourceCopy {
  title: string;
  contents: string[];
}

/**
 * Reads the title and ordered, non-label item text of a packing source. Templates must belong to the actor and lists to
 * the target trip; anything else is concealed as not found so no foreign name or item is ever read.
 */
async function readPackingSource(
  transaction: DbTransaction,
  actor: Actor,
  tripId: string,
  source: { type: "template" | "packing-list"; id: string }
): Promise<PackingSourceCopy> {
  if (source.type === "template") {
    const [template] = await transaction
      .select({ name: packingTemplates.name })
      .from(packingTemplates)
      .where(and(eq(packingTemplates.id, source.id), eq(packingTemplates.userId, actor.userId)));
    if (!template) throw new TripNotFoundError();
    const rows = await transaction
      .select({ text: packingTemplateItems.text })
      .from(packingTemplateItems)
      .where(and(eq(packingTemplateItems.templateId, source.id), eq(packingTemplateItems.isLabel, false)))
      .orderBy(asc(packingTemplateItems.position), asc(packingTemplateItems.id));
    return { title: template.name, contents: rows.map((row) => row.text) };
  }
  const [list] = await transaction
    .select({ name: tripPackingLists.name })
    .from(tripPackingLists)
    .where(and(eq(tripPackingLists.id, source.id), eq(tripPackingLists.tripId, tripId)));
  if (!list) throw new TripNotFoundError();
  const rows = await transaction
    .select({ name: packingItems.name })
    .from(packingItems)
    .where(and(eq(packingItems.listId, source.id), eq(packingItems.isLabel, false)))
    .orderBy(asc(packingItems.position), asc(packingItems.id));
  return { title: list.name, contents: rows.map((row) => row.name) };
}

/**
 * Creation stamps for a batch of copied items. `createdAt` is the only item order, and a multi-row insert shares one
 * statement time, so each row reads the clock and is pushed back by the number of rows after it: stamps strictly
 * increase in source order and the last equals the clock, so a later append (also `clock_timestamp()`) sorts after.
 */
function batchCreatedAt(index: number, count: number) {
  const behind = count - 1 - index;
  return behind === 0
    ? sql`clock_timestamp()`
    : sql`clock_timestamp() - (${sql.raw(String(behind))} * interval '1 microsecond')`;
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
  return runChecklistWrite<Checklist>(actor, tripId, { replay, payload: body }, (transaction, markChanged) => {
    let packed: PackingSourceCopy | undefined;
    return {
      authorize: async () => {
        // Claim client UUIDs, first-item IDs included, before the trip lock.
        await lockClientIds(transaction, [
          body.id && `checklist:${body.id}`,
          body.firstItem?.id && `checklist-item:${body.firstItem.id}`,
        ]);
        await lockTrip(transaction, tripId);
        await requireTripRole(tripId, actor.userId, "editor", transaction);
        const [day] = await transaction.select({ tripId: days.tripId }).from(days).where(eq(days.id, body.dayId));
        if (!day || day.tripId !== tripId) throw new TripNotFoundError();
        // Re-read the source on every attempt, before any stored result or UUID collision is considered.
        packed = body.source ? await readPackingSource(transaction, actor, tripId, body.source) : undefined;
        if (body.id) {
          const existing = await readChecklist(transaction, body.id);
          if (existing && existing.tripId !== tripId)
            await requireTripRole(existing.tripId, actor.userId, "viewer", transaction);
        }
      },
      mutate: async () => {
        const title = packed ? packed.title : (body.title ?? null);
        const contents = packed ? packed.contents : body.firstItem ? [body.firstItem.content] : [];
        if (body.id) {
          const existing = await readChecklist(transaction, body.id);
          if (existing) {
            const current = await mappedChecklist(transaction, existing.checklist);
            if (
              existing.tripId !== tripId ||
              current.tripDayId !== body.dayId ||
              current.position !== body.position ||
              (current.title ?? null) !== title
            )
              collision();
            if (
              current.items.length !== contents.length ||
              current.items.some((item, index) => item.content !== contents[index] || item.isChecked) ||
              (body.firstItem?.id !== undefined && current.items[0].id !== body.firstItem.id)
            )
              collision();
            return current;
          }
        }
        if (body.firstItem?.id) {
          const existingTripId = await readItemTripId(transaction, body.firstItem.id);
          if (existingTripId) {
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
            title,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        const items = packed
          ? packed.contents.length > 0
            ? await transaction
                .insert(checklistItems)
                .values(
                  packed.contents.map((content, index, all) => ({
                    checklistId: created.id,
                    content,
                    createdAt: batchCreatedAt(index, all.length),
                  }))
                )
                .returning()
            : []
          : body.firstItem
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
        markChanged();
        return dbChecklistToType(created, items);
      },
    };
  });
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
  return runChecklistWrite<Checklist>(actor, tripId, { replay, payload: patch }, (transaction, markChanged) => ({
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
      markChanged();
      return mappedChecklist(transaction, updated);
    },
  }));
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
  return runChecklistWrite<null>(actor, tripId, { replay, payload: body }, (transaction, markChanged) => ({
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
        markChanged();
      }
      return null;
    },
  }));
}
/**
 * Appends an item to a checklist. A client `id` makes the create retry-safe: the same id with the same checklist and
 * content returns the stored row, and any other use of that id is a 409. Items keep creation order.
 */
export async function createChecklistItem(
  actor: Actor,
  checklistId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<ChecklistItem> {
  checklistId = createItemContract.params.parse({ checklistId }).checklistId;
  const body = createItemContract.body.parse(input);
  const ancestry = await readChecklist(db, checklistId);
  if (!ancestry) throw new TripNotFoundError();
  const tripId = ancestry.tripId;
  await requireTripRole(tripId, actor.userId, "editor");
  return runChecklistWrite<ChecklistItem>(actor, tripId, { replay, payload: body }, (transaction, markChanged) => ({
    authorize: async () => {
      // Same namespace and order as first-item creation in `createChecklist`, so a UUID is claimed once across trips.
      await lockClientIds(transaction, [body.id && `checklist-item:${body.id}`]);
      await lockTrip(transaction, tripId);
      const current = await readChecklist(transaction, checklistId);
      if (!current || current.tripId !== tripId) throw new TripNotFoundError();
      await requireTripRole(tripId, actor.userId, "editor", transaction);
      if (body.id) {
        const existingTripId = await readItemTripId(transaction, body.id);
        if (existingTripId && existingTripId !== tripId)
          await requireTripRole(existingTripId, actor.userId, "viewer", transaction);
      }
    },
    mutate: async () => {
      if (body.id) {
        const existing = await readItem(transaction, body.id);
        if (existing) {
          if (existing.checklistId !== checklistId || existing.content !== body.content) collision();
          return dbChecklistItemToType(existing);
        }
      }
      // The DB clock is read after the trip lock, so creation order follows lock order.
      const [created] = await transaction
        .insert(checklistItems)
        .values({
          ...(body.id ? { id: body.id } : {}),
          checklistId,
          content: body.content,
          createdAt: sql`clock_timestamp()`,
        })
        .returning();
      markChanged();
      return dbChecklistItemToType(created);
    },
  }));
}

/** Applies only the supplied fields; an empty patch returns the stored item and writes nothing. */
export async function updateChecklistItem(
  actor: Actor,
  itemId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<ChecklistItem> {
  itemId = updateItemContract.params.parse({ itemId }).itemId;
  const patch = updateItemContract.body.parse(input);
  const tripId = await itemTripId(db, itemId);
  await requireTripRole(tripId, actor.userId, "editor");
  return runChecklistWrite<ChecklistItem>(actor, tripId, { replay, payload: patch }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      if ((await itemTripId(transaction, itemId)) !== tripId) throw new TripNotFoundError();
      await requireTripRole(tripId, actor.userId, "editor", transaction);
    },
    mutate: async () => {
      if (Object.keys(patch).length === 0) {
        const current = await readItem(transaction, itemId);
        if (!current) throw new TripNotFoundError();
        return dbChecklistItemToType(current);
      }
      const [updated] = await transaction
        .update(checklistItems)
        .set(patch)
        .where(eq(checklistItems.id, itemId))
        .returning();
      if (!updated) throw new TripNotFoundError();
      markChanged();
      return dbChecklistItemToType(updated);
    },
  }));
}

/** Deleting an item that is already gone succeeds once the caller is authorized for the supplied trip. */
export async function deleteChecklistItem(
  actor: Actor,
  itemId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<null> {
  itemId = deleteItemContract.params.parse({ itemId }).itemId;
  const body = deleteItemContract.body.parse(input);
  const { tripId } = body;
  await requireTripRole(tripId, actor.userId, "editor");
  return runChecklistWrite<null>(actor, tripId, { replay, payload: body }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
      const currentTripId = await readItemTripId(transaction, itemId);
      if (currentTripId && currentTripId !== tripId) throw new TripNotFoundError();
    },
    mutate: async () => {
      if (await readItemTripId(transaction, itemId)) {
        await transaction.delete(checklistItems).where(eq(checklistItems.id, itemId));
        markChanged();
      }
      return null;
    },
  }));
}
