import "server-only";
import { db } from "@/db";
import { checklistItems, itineraryChecklists, days } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Actor, ChecklistItem, IdempotentRequest } from "@/data/types";
import { dbChecklistItemToType } from "@/lib/db-mappers";
import { lockTripForUpdate, TRIP_NOT_FOUND_MESSAGE, type DbTransaction } from "@/lib/server-action-locks";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { afterTripWrite } from "./trip-write-effects";
import { updateChecklistItem as endpoint } from "@/lib/api/contract/checklists";
import { withIdempotency } from "@/lib/api/idempotency";
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
