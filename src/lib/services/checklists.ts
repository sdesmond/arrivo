import "server-only";
import { db } from "@/db";
import { checklistItems, itineraryChecklists, days } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Actor, ChecklistItem } from "@/data/types";
import { dbChecklistItemToType } from "@/lib/db-mappers";
import { lockTripForUpdate, TRIP_NOT_FOUND_MESSAGE, type DbTransaction } from "@/lib/server-action-locks";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { afterTripWrite } from "./trip-write-effects";
import { updateChecklistItem as endpoint } from "@/lib/api/contract/checklists";
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
export async function updateChecklistItem(actor: Actor, itemId: string, input: unknown): Promise<ChecklistItem> {
  endpoint.params.parse({ itemId });
  const patch = endpoint.body.parse(input);
  const tripId = await itemTripId(db, itemId);
  await requireTripRole(tripId, actor.userId, "editor");
  const item = await db.transaction(async (transaction) => {
    try {
      await lockTripForUpdate(transaction, tripId);
    } catch (error) {
      if (error instanceof Error && error.message === TRIP_NOT_FOUND_MESSAGE) throw new TripNotFoundError();
      throw error;
    }
    if ((await itemTripId(transaction, itemId)) !== tripId) throw new TripNotFoundError();
    await requireTripRole(tripId, actor.userId, "editor", transaction);
    const [updated] = await transaction
      .update(checklistItems)
      .set(patch)
      .where(eq(checklistItems.id, itemId))
      .returning();
    if (!updated) throw new TripNotFoundError();
    return dbChecklistItemToType(updated);
  });
  afterTripWrite(actor, tripId);
  return item;
}
