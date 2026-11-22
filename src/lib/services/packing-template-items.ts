import "server-only";
import { and, eq, gte, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { packingTemplateItems, packingTemplates } from "@/db/schema";
import type { Actor, IdempotentRequest, PackingTemplateItem } from "@/data/types";
import {
  createPackingTemplateItem as createContract,
  updatePackingTemplateItem as updateContract,
  deletePackingTemplateItem as deleteContract,
  removePackingTemplateSection as sectionContract,
} from "@/lib/api/contract/packing-templates";
import { withIdempotency } from "@/lib/api/idempotency";
import { dbTemplateItemToType } from "@/lib/db-mappers";
import { guardTransactionDeadline } from "@/lib/request-deadline";
import { lockPackingTemplateForUpdate, type DbTransaction } from "@/lib/server-action-locks";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { recordDeletions, refuseRecentlyDeleted } from "./deletion-records";
import { TripNotFoundError } from "./trip-access";
import { ValidationFailedError } from "./validation-failed-error";

async function readItem(transaction: DbTransaction, itemId: string) {
  const [item] = await transaction.select().from(packingTemplateItems).where(eq(packingTemplateItems.id, itemId));
  return item;
}

async function isOwnedTemplate(transaction: DbTransaction, templateId: string, userId: string): Promise<boolean> {
  const [template] = await transaction
    .select({ id: packingTemplates.id })
    .from(packingTemplates)
    .where(and(eq(packingTemplates.id, templateId), eq(packingTemplates.userId, userId)));
  return Boolean(template);
}

/** Serializes writes to one template. A template deleted since the ownership check reads as not found. */
async function lockOwnedTemplate(transaction: DbTransaction, templateId: string, userId: string): Promise<void> {
  if (!(await isOwnedTemplate(transaction, templateId, userId))) throw new TripNotFoundError();
  try {
    await lockPackingTemplateForUpdate(transaction, templateId);
  } catch (error) {
    if (error instanceof Error && error.message === "Template not found.") throw new TripNotFoundError();
    throw error;
  }
}

/** The item when it sits in a template the actor owns, locking that template; otherwise undefined. */
async function lockOwnedItem(transaction: DbTransaction, itemId: string, userId: string) {
  const item = await readItem(transaction, itemId);
  if (!item || !(await isOwnedTemplate(transaction, item.templateId, userId))) return undefined;
  await lockOwnedTemplate(transaction, item.templateId, userId);
  return item;
}

/** Adds an item or section under the client id. A retry with the same content returns the row without writing. */
export async function createPackingTemplateItem(
  actor: Actor,
  templateId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<PackingTemplateItem> {
  templateId = createContract.params.parse({ templateId }).templateId;
  const body = createContract.body.parse(input);
  const isLabel = body.isLabel ?? false;
  const labelId = isLabel ? null : (body.labelId ?? null);
  let changed = false;
  const { value, replayed } = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, () =>
      withIdempotency<PackingTemplateItem>(
        transaction,
        { actor, request: replay, payload: body },
        {
          authorize: async () => {
            await lockClientIds(transaction, [`packing-template-item:${body.id}`]);
            await lockOwnedTemplate(transaction, templateId, actor.userId);
            const existing = await readItem(transaction, body.id);
            if (
              existing &&
              existing.templateId !== templateId &&
              !(await isOwnedTemplate(transaction, existing.templateId, actor.userId))
            )
              throw new TripNotFoundError();
          },
          mutate: async () => {
            changed = false;
            const existing = await readItem(transaction, body.id);
            if (existing) {
              if (
                existing.templateId !== templateId ||
                existing.text !== body.text ||
                existing.isLabel !== isLabel ||
                existing.labelId !== labelId
              )
                throw new ConflictError("This ID was already used for different template content.");
              return dbTemplateItemToType(existing);
            }
            await refuseRecentlyDeleted(transaction, "packing-template-item", body.id);
            const invalid = (): never => {
              throw new ValidationFailedError("Invalid template section or placement.", {});
            };
            if (labelId) {
              const [section] = await transaction
                .select({ id: packingTemplateItems.id })
                .from(packingTemplateItems)
                .where(
                  and(
                    eq(packingTemplateItems.id, labelId),
                    eq(packingTemplateItems.templateId, templateId),
                    eq(packingTemplateItems.isLabel, true)
                  )
                );
              if (!section) invalid();
            }
            const anchorId = body.beforeItemId ?? body.afterItemId;
            let position: number;
            if (anchorId) {
              const anchor = await readItem(transaction, anchorId);
              if (!anchor || anchor.templateId !== templateId) return invalid();
              position = anchor.position + (body.afterItemId ? 1 : 0);
              await transaction
                .update(packingTemplateItems)
                .set({ position: sql`${packingTemplateItems.position} + 1` })
                .where(
                  and(eq(packingTemplateItems.templateId, templateId), gte(packingTemplateItems.position, position))
                );
            } else {
              const [row] = await transaction
                .select({ position: max(packingTemplateItems.position) })
                .from(packingTemplateItems)
                .where(eq(packingTemplateItems.templateId, templateId));
              position = (row.position ?? -1) + 1;
            }
            const [created] = await transaction
              .insert(packingTemplateItems)
              .values({ id: body.id, templateId, text: body.text, isLabel, labelId, position })
              .returning();
            changed = true;
            return dbTemplateItemToType(created);
          },
        }
      )
    )
  );
  if (changed && !replayed) revalidatePath(`/packing/${templateId}`);
  return value;
}

export async function updatePackingTemplateItem(
  actor: Actor,
  itemId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<PackingTemplateItem> {
  itemId = updateContract.params.parse({ itemId }).itemId;
  const body = updateContract.body.parse(input);
  let changedTemplateId: string | undefined;
  const { value, replayed } = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, () =>
      withIdempotency<PackingTemplateItem>(
        transaction,
        { actor, request: replay, payload: body },
        {
          authorize: async () => {
            if (!(await lockOwnedItem(transaction, itemId, actor.userId))) throw new TripNotFoundError();
          },
          mutate: async () => {
            changedTemplateId = undefined;
            const current = await readItem(transaction, itemId);
            if (!current || !(await isOwnedTemplate(transaction, current.templateId, actor.userId)))
              throw new TripNotFoundError();
            if (current.text === body.text) return dbTemplateItemToType(current);
            const [updated] = await transaction
              .update(packingTemplateItems)
              .set({ text: body.text })
              .where(eq(packingTemplateItems.id, itemId))
              .returning();
            changedTemplateId = updated.templateId;
            return dbTemplateItemToType(updated);
          },
        }
      )
    )
  );
  if (changedTemplateId && !replayed) revalidatePath(`/packing/${changedTemplateId}`);
  return value;
}

/** Removes the item and remembers its id. A missing or foreign item is a quiet success that writes nothing. */
export async function deletePackingTemplateItem(
  actor: Actor,
  itemId: string,
  input: unknown = {},
  replay?: IdempotentRequest
): Promise<null> {
  itemId = deleteContract.params.parse({ itemId }).itemId;
  const body = deleteContract.body.parse(input);
  let removedFrom: string | undefined;
  const { replayed } = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, () =>
      withIdempotency<null>(
        transaction,
        { actor, request: replay, payload: body },
        {
          authorize: async () => {
            await lockOwnedItem(transaction, itemId, actor.userId);
          },
          mutate: async () => {
            removedFrom = undefined;
            const item = await readItem(transaction, itemId);
            if (!item || !(await isOwnedTemplate(transaction, item.templateId, actor.userId))) return null;
            await transaction.delete(packingTemplateItems).where(eq(packingTemplateItems.id, itemId));
            await recordDeletions(transaction, "packing-template-item", [itemId], actor.userId);
            removedFrom = item.templateId;
            return null;
          },
        }
      )
    )
  );
  if (removedFrom && !replayed) revalidatePath(`/packing/${removedFrom}`);
  return null;
}

/** Removes a section, deleting its items or moving them to the ungrouped list. A non-section is 404. */
export async function removePackingTemplateSection(
  actor: Actor,
  itemId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<null> {
  itemId = sectionContract.params.parse({ itemId }).itemId;
  const body = sectionContract.body.parse(input);
  let removedFrom: string | undefined;
  const { replayed } = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, () =>
      withIdempotency<null>(
        transaction,
        { actor, request: replay, payload: body },
        {
          authorize: async () => {
            const section = await lockOwnedItem(transaction, itemId, actor.userId);
            if (section && !section.isLabel) throw new TripNotFoundError();
          },
          mutate: async () => {
            removedFrom = undefined;
            const section = await readItem(transaction, itemId);
            if (!section || !(await isOwnedTemplate(transaction, section.templateId, actor.userId))) return null;
            if (!section.isLabel) throw new TripNotFoundError();
            const children = and(
              eq(packingTemplateItems.templateId, section.templateId),
              eq(packingTemplateItems.labelId, itemId)
            );
            let removedChildIds: string[] = [];
            if (body.mode === "delete-items") {
              const removed = await transaction
                .delete(packingTemplateItems)
                .where(children)
                .returning({ id: packingTemplateItems.id });
              removedChildIds = removed.map((child) => child.id);
            } else {
              await transaction.update(packingTemplateItems).set({ labelId: null }).where(children);
            }
            await transaction.delete(packingTemplateItems).where(eq(packingTemplateItems.id, itemId));
            await recordDeletions(transaction, "packing-template-item", [...removedChildIds, itemId], actor.userId);
            removedFrom = section.templateId;
            return null;
          },
        }
      )
    )
  );
  if (removedFrom && !replayed) revalidatePath(`/packing/${removedFrom}`);
  return null;
}
