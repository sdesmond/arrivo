import "server-only";
import { and, asc, eq, gte, inArray, isNull, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { packingItems, packingTemplateItems, packingTemplates, tripPackingLists } from "@/db/schema";
import type {
  Actor,
  IdempotentRequest,
  PackingItem,
  PackingItemOrder,
  TripPackingList,
  PullTemplatesResult,
} from "@/data/types";
import { dbPackingItemToType, dbPackingListToType } from "@/lib/db-mappers";
import {
  updatePackingItem as updateContract,
  deletePackingItem as deleteContract,
  reorderPackingItems as reorderContract,
  createPackingItem as createContract,
  removePackingSection as sectionContract,
  createPackingList as createListContract,
  renamePackingList as renameListContract,
  deletePackingList as deleteListContract,
  pullTemplatesOntoTrip as pullContract,
} from "@/lib/api/contract/packing";
import type { DbTransaction } from "@/lib/server-action-locks";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { recordDeletions, refuseRecentlyDeleted } from "./deletion-records";
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
          await recordDeletions(transaction, "packing-item", [itemId], actor.userId);
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

export async function createPackingItem(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<PackingItem> {
  tripId = createContract.params.parse({ tripId }).tripId;
  const body = createContract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<PackingItem>(
    actor,
    tripId,
    { replay, payload: body, revalidate: ["/trips"] },
    (transaction, markChanged) => ({
      authorize: async () => {
        await lockClientIds(transaction, [`packing-item:${body.id}`]);
        await lockTrip(transaction, tripId);
        await requireTripRole(tripId, actor.userId, "editor", transaction);
        const existing = await readItem(transaction, body.id);
        if (existing && existing.tripId !== tripId)
          await requireTripRole(existing.tripId, actor.userId, "viewer", transaction);
      },
      mutate: async () => {
        const existing = await readItem(transaction, body.id);
        if (existing) {
          if (
            existing.tripId !== tripId ||
            existing.listId !== body.listId ||
            existing.name !== body.name ||
            existing.isLabel !== (body.isLabel ?? false)
          )
            throw new ConflictError("This ID was already used for different packing content.");
          return dbPackingItemToType(existing);
        }
        await refuseRecentlyDeleted(transaction, "packing-item", body.id);
        const invalid = (): never => {
          throw new ValidationFailedError("Invalid packing list, section or placement.", {});
        };
        if (body.listId) {
          const [list] = await transaction
            .select()
            .from(tripPackingLists)
            .where(and(eq(tripPackingLists.id, body.listId), eq(tripPackingLists.tripId, tripId)));
          if (!list) invalid();
        }
        if (body.labelId) {
          const label = await readItem(transaction, body.labelId);
          if (!label || label.tripId !== tripId || label.listId !== body.listId || !label.isLabel) invalid();
        }
        const scope = and(
          eq(packingItems.tripId, tripId),
          body.listId === null ? isNull(packingItems.listId) : eq(packingItems.listId, body.listId)
        );
        const anchorId = body.beforeItemId ?? body.afterItemId;
        let position: number;
        if (anchorId) {
          const anchor = await readItem(transaction, anchorId);
          if (!anchor || anchor.tripId !== tripId || anchor.listId !== body.listId) return invalid();
          position = anchor.position + (body.afterItemId ? 1 : 0);
          await transaction
            .update(packingItems)
            .set({ position: sql`${packingItems.position} + 1` })
            .where(and(scope, gte(packingItems.position, position)));
        } else {
          const [row] = await transaction
            .select({ position: max(packingItems.position) })
            .from(packingItems)
            .where(scope);
          position = (row.position ?? -1) + 1;
        }
        const [created] = await transaction
          .insert(packingItems)
          .values({
            id: body.id,
            tripId,
            listId: body.listId,
            name: body.name,
            isLabel: body.isLabel ?? false,
            labelId: body.labelId ?? null,
            done: false,
            position,
          })
          .returning();
        markChanged();
        return dbPackingItemToType(created);
      },
    })
  );
}

export async function removePackingSection(
  actor: Actor,
  itemId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<null> {
  itemId = sectionContract.params.parse({ itemId }).itemId;
  const body = sectionContract.body.parse(input);
  await requireTripRole(body.tripId, actor.userId, "editor");
  return runTripWrite<null>(
    actor,
    body.tripId,
    { replay, payload: body, revalidate: ["/trips"] },
    (transaction, markChanged) => ({
      authorize: async () => {
        await lockTrip(transaction, body.tripId);
        await requireTripRole(body.tripId, actor.userId, "editor", transaction);
        const section = await readItem(transaction, itemId);
        if (section && (section.tripId !== body.tripId || !section.isLabel)) throw new TripNotFoundError();
      },
      mutate: async () => {
        const section = await readItem(transaction, itemId);
        if (!section) return null;
        const scope = and(
          eq(packingItems.tripId, body.tripId),
          eq(packingItems.labelId, itemId),
          section.listId === null ? isNull(packingItems.listId) : eq(packingItems.listId, section.listId)
        );
        const removedChildIds =
          body.mode === "delete-items"
            ? (await transaction.delete(packingItems).where(scope).returning({ id: packingItems.id })).map(
                (child) => child.id
              )
            : [];
        if (body.mode !== "delete-items") await transaction.update(packingItems).set({ labelId: null }).where(scope);
        await transaction.delete(packingItems).where(eq(packingItems.id, itemId));
        await recordDeletions(transaction, "packing-item", [...removedChildIds, itemId], actor.userId);
        markChanged();
        return null;
      },
    })
  );
}

async function readList(executor: ReadExecutor, listId: string) {
  const [list] = await executor.select().from(tripPackingLists).where(eq(tripPackingLists.id, listId));
  return list;
}

export async function createPackingList(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<TripPackingList> {
  tripId = createListContract.params.parse({ tripId }).tripId;
  const body = createListContract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<TripPackingList>(
    actor,
    tripId,
    { replay, payload: body, revalidate: ["/trips"] },
    (transaction, markChanged) => ({
      authorize: async () => {
        await lockClientIds(transaction, [`packing-list:${body.id}`]);
        await lockTrip(transaction, tripId);
        await requireTripRole(tripId, actor.userId, "editor", transaction);
        const existing = await readList(transaction, body.id);
        if (existing && existing.tripId !== tripId)
          await requireTripRole(existing.tripId, actor.userId, "viewer", transaction);
      },
      mutate: async () => {
        const existing = await readList(transaction, body.id);
        if (existing) {
          if (existing.tripId !== tripId || existing.name !== body.name)
            throw new ConflictError("This ID was already used for a different packing list.");
          return dbPackingListToType(existing);
        }
        await refuseRecentlyDeleted(transaction, "packing-list", body.id);
        const [{ maxPosition }] = await transaction
          .select({ maxPosition: max(tripPackingLists.position) })
          .from(tripPackingLists)
          .where(eq(tripPackingLists.tripId, tripId));
        const [created] = await transaction
          .insert(tripPackingLists)
          .values({ id: body.id, tripId, name: body.name, position: (maxPosition ?? -1) + 1 })
          .returning();
        markChanged();
        return dbPackingListToType(created);
      },
    })
  );
}

export async function renamePackingList(
  actor: Actor,
  listId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<TripPackingList> {
  listId = renameListContract.params.parse({ listId }).listId;
  const body = renameListContract.body.parse(input);
  const { tripId } = body;
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<TripPackingList>(
    actor,
    tripId,
    { replay, payload: body, revalidate: ["/trips"] },
    (transaction, markChanged) => {
      async function current() {
        const list = await readList(transaction, listId);
        if (!list || list.tripId !== tripId) throw new TripNotFoundError();
        return list;
      }
      return {
        authorize: async () => {
          await lockTrip(transaction, tripId);
          await requireTripRole(tripId, actor.userId, "editor", transaction);
          await current();
        },
        mutate: async () => {
          const list = await current();
          if (list.name === body.name) return dbPackingListToType(list);
          const [updated] = await transaction
            .update(tripPackingLists)
            .set({ name: body.name })
            .where(eq(tripPackingLists.id, listId))
            .returning();
          if (!updated) throw new TripNotFoundError();
          markChanged();
          return dbPackingListToType(updated);
        },
      };
    }
  );
}

export async function deletePackingList(
  actor: Actor,
  listId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<null> {
  listId = deleteListContract.params.parse({ listId }).listId;
  const body = deleteListContract.body.parse(input);
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
        const list = await readList(transaction, listId);
        if (list && list.tripId !== tripId) throw new TripNotFoundError();
      },
      mutate: async () => {
        const [list] = await transaction
          .select({ id: tripPackingLists.id })
          .from(tripPackingLists)
          .where(eq(tripPackingLists.id, listId))
          .for("update");
        if (list) {
          const items = await transaction
            .delete(packingItems)
            .where(eq(packingItems.listId, listId))
            .returning({ id: packingItems.id });
          await transaction.delete(tripPackingLists).where(eq(tripPackingLists.id, listId));
          await recordDeletions(
            transaction,
            "packing-item",
            items.map(({ id }) => id),
            actor.userId
          );
          await recordDeletions(transaction, "packing-list", [listId], actor.userId);
          markChanged();
        }
        return null;
      },
    })
  );
}

export async function pullTemplatesOntoTrip(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<PullTemplatesResult> {
  tripId = pullContract.params.parse({ tripId }).tripId;
  const body = pullContract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<PullTemplatesResult>(
    actor,
    tripId,
    { replay, payload: body, revalidate: ["/trips"] },
    (transaction, markChanged) => ({
      authorize: async () => {
        await lockTrip(transaction, tripId);
        await requireTripRole(tripId, actor.userId, "editor", transaction);
      },
      mutate: async () => {
        const listId = body.listId ?? null;
        if (listId) {
          const [list] = await transaction
            .select()
            .from(tripPackingLists)
            .where(and(eq(tripPackingLists.id, listId), eq(tripPackingLists.tripId, tripId)));
          if (!list) throw new ValidationFailedError("Invalid packing list.", { listId: ["Invalid packing list."] });
        }
        const ids = [...new Set(body.templateIds)];
        if (!ids.length) return { added: 0, skipped: 0 };
        const owned = await transaction
          .select({ id: packingTemplates.id })
          .from(packingTemplates)
          .where(and(inArray(packingTemplates.id, ids), eq(packingTemplates.userId, actor.userId)));
        const ownedIds = new Set(owned.map((template) => template.id));
        const scope = and(
          eq(packingItems.tripId, tripId),
          listId === null ? isNull(packingItems.listId) : eq(packingItems.listId, listId)
        );
        const existing = await transaction.select().from(packingItems).where(scope);
        const names = new Set(existing.filter((item) => !item.isLabel).map((item) => item.name.trim().toLowerCase()));
        const labels = new Map(
          existing.filter((item) => item.isLabel).map((item) => [item.name.trim().toLowerCase(), item.id])
        );
        const mapped = new Map<string, string>();
        let position = Math.max(-1, ...existing.map((item) => item.position)) + 1;
        let added = 0;
        let skipped = 0;
        for (const templateId of ids) {
          if (!ownedIds.has(templateId)) continue;
          const items = await transaction
            .select()
            .from(packingTemplateItems)
            .where(eq(packingTemplateItems.templateId, templateId))
            .orderBy(asc(packingTemplateItems.position));
          const pendingLabels: { itemId: string; templateLabelId: string }[] = [];
          for (const item of items) {
            const normalized = item.text.trim().toLowerCase();
            if (item.isLabel ? labels.has(normalized) : names.has(normalized)) {
              const existingId = labels.get(normalized);
              if (item.isLabel && existingId) mapped.set(item.id, existingId);
              skipped++;
              continue;
            }
            const [inserted] = await transaction
              .insert(packingItems)
              .values({
                tripId,
                listId,
                name: item.text.trim(),
                done: false,
                isLabel: item.isLabel,
                position: position++,
                labelId: item.isLabel ? null : item.labelId ? (mapped.get(item.labelId) ?? null) : null,
              })
              .returning({ id: packingItems.id });
            if (!inserted) throw new Error("Failed to insert packing item during template pull");
            if (!item.isLabel && item.labelId && !mapped.has(item.labelId)) {
              pendingLabels.push({ itemId: inserted.id, templateLabelId: item.labelId });
            }
            if (item.isLabel) {
              mapped.set(item.id, inserted.id);
              labels.set(normalized, inserted.id);
            }
            if (!item.isLabel) names.add(normalized);
            added++;
          }
          for (const pending of pendingLabels) {
            const labelId = mapped.get(pending.templateLabelId);
            if (labelId) {
              await transaction.update(packingItems).set({ labelId }).where(eq(packingItems.id, pending.itemId));
            }
          }
        }
        if (added) markChanged();
        return { added, skipped };
      },
    })
  );
}
