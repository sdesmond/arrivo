import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { packingItems } from "@/db/schema";
import type { Actor, IdempotentRequest, PackingItem } from "@/data/types";
import { dbPackingItemToType } from "@/lib/db-mappers";
import { updatePackingItem as updateContract, deletePackingItem as deleteContract } from "@/lib/api/contract/packing";
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
