import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { packingItems } from "@/db/schema";
import type { Actor, IdempotentRequest, PackingItem, PackingItemOrder } from "@/data/types";
import { dbPackingItemToType } from "@/lib/db-mappers";
import {
  updatePackingItem as updateContract,
  deletePackingItem as deleteContract,
  reorderPackingItems as reorderContract,
} from "@/lib/api/contract/packing";
import type { DbTransaction } from "@/lib/server-action-locks";
import { ConflictError } from "./conflict-error";
import { ValidationFailedError } from "./validation-failed-error";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite, type ReadExecutor } from "./trip-write";
async function readItem(executor: ReadExecutor, itemId: string) {
  const [item] = await executor.select().from(packingItems).where(eq(packingItems.id, itemId));
  return item;
}
export async function updatePackingItem(
  actor: Actor,
  itemId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<PackingItem> {
  itemId = updateContract.params.parse({ itemId }).itemId;
  const patch = updateContract.body.parse(input);
  const item = await readItem(db, itemId);
  if (!item) throw new TripNotFoundError();
  const tripId = item.tripId;
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<PackingItem>(
    actor,
    tripId,
    { replay, payload: patch, revalidate: ["/trips"] },
    (transaction, markChanged) => ({
      authorize: async () => {
        await lockTrip(transaction, tripId);
        const current = await readItem(transaction, itemId);
        if (!current || current.tripId !== tripId) throw new TripNotFoundError();
        await requireTripRole(tripId, actor.userId, "editor", transaction);
      },
      mutate: async () => {
        const current = await readItem(transaction, itemId);
        if (!current || current.tripId !== tripId) throw new TripNotFoundError();
        if (
          (patch.name === undefined || patch.name === current.name) &&
          (patch.isPacked === undefined || patch.isPacked === current.done)
        )
          return dbPackingItemToType(current);
        const values = {
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.isPacked === undefined ? {} : { done: patch.isPacked }),
        };
        const [updated] = await transaction
          .update(packingItems)
          .set(values)
          .where(eq(packingItems.id, itemId))
          .returning();
        if (!updated) throw new TripNotFoundError();
        markChanged();
        return dbPackingItemToType(updated);
      },
    })
  );
}
export async function deletePackingItem(
  actor: Actor,
  itemId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<null> {
  itemId = deleteContract.params.parse({ itemId }).itemId;
  const body = deleteContract.body.parse(input);
  const { tripId } = body;
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<null>(
    actor,
    tripId,
    { replay, payload: body, revalidate: ["/trips"] },
    (transaction, markChanged) => ({
      authorize: async () => {
        await lockTrip(transaction, tripId);
        await requireTripRole(tripId, actor.userId, "editor", transaction);
        const current = await readItem(transaction, itemId);
        if (current && current.tripId !== tripId) throw new TripNotFoundError();
      },
      mutate: async () => {
        if (await readItem(transaction, itemId)) {
          await transaction.delete(packingItems).where(eq(packingItems.id, itemId));
          markChanged();
        }
        return null;
      },
    })
  );
}

/**
 * Applies one list's complete order inside the trip lock. The submitted ids must be exactly the list's stored rows, so
 * a stale, partial or foreign list is a `ConflictError` with nothing written. A label must be a section of that list.
 * Returns whether anything was written: an order already stored is a quiet success.
 */
async function applyPackingOrder(
  transaction: DbTransaction,
  tripId: string,
  { listId, items }: PackingItemOrder
): Promise<boolean> {
  const scope = and(
    eq(packingItems.tripId, tripId),
    listId === null ? isNull(packingItems.listId) : eq(packingItems.listId, listId)
  );
  const stored = new Map(
    (await transaction.select().from(packingItems).where(scope)).map((row) => [row.id, row] as const)
  );
  if (stored.size !== items.length || items.some((item) => !stored.has(item.id))) {
    throw new ConflictError("This packing list changed since it was loaded.");
  }
  for (const item of items) {
    if (item.labelId === null) continue;
    if (!stored.get(item.labelId)?.isLabel || stored.get(item.id)?.isLabel) {
      throw new ValidationFailedError("A packing section must be a label of the same list.", {
        items: ["A packing section must be a label of the same list."],
      });
    }
  }
  let changed = false;
  for (const [index, item] of items.entries()) {
    const row = stored.get(item.id);
    if (row?.position === index && row.labelId === item.labelId) continue;
    await transaction
      .update(packingItems)
      .set({ position: index, labelId: item.labelId })
      .where(and(eq(packingItems.id, item.id), eq(packingItems.tripId, tripId)));
    changed = true;
  }
  return changed;
}

export async function reorderPackingItems(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<PackingItemOrder> {
  tripId = reorderContract.params.parse({ tripId }).tripId;
  const body = reorderContract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<PackingItemOrder>(
    actor,
    tripId,
    { replay, payload: body, revalidate: ["/trips"] },
    (transaction, markChanged) => ({
      authorize: async () => {
        await lockTrip(transaction, tripId);
        await requireTripRole(tripId, actor.userId, "editor", transaction);
      },
      mutate: async () => {
        if (await applyPackingOrder(transaction, tripId, body)) markChanged();
        return body;
      },
    })
  );
}
