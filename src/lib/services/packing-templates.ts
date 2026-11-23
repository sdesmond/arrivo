import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { packingItems, packingTemplateItems, packingTemplates, tripPackingLists } from "@/db/schema";
import type { Actor, IdempotentRequest, PackingTemplate } from "@/data/types";
import {
  createPackingTemplate as createContract,
  listPackingTemplates as listContract,
  getPackingTemplate as detailContract,
  renamePackingTemplate as renameContract,
  deletePackingTemplate as deleteContract,
  savePackingListAsTemplate as saveListContract,
} from "@/lib/api/contract/packing-templates";
import { withIdempotency } from "@/lib/api/idempotency";
import { dbTemplateToType } from "@/lib/db-mappers";
import { getTemplateWithItems, listTemplatesForUser } from "@/lib/queries";
import { guardTransactionDeadline } from "@/lib/request-deadline";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { recordDeletions, refuseRecentlyDeleted } from "./deletion-records";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite } from "./trip-write";
import { ValidationFailedError } from "./validation-failed-error";

export async function listPackingTemplates(
  actor: Actor,
  input: unknown = {}
): Promise<{ templates: PackingTemplate[] }> {
  listContract.body.parse(input);
  return { templates: await listTemplatesForUser(actor.userId) };
}

/** Creates an owned template under the client id. A retry of the same id and name returns the row without writing. */
export async function createPackingTemplate(
  actor: Actor,
  input: unknown,
  replay?: IdempotentRequest
): Promise<PackingTemplate> {
  const body = createContract.body.parse(input);
  let created = false;
  const { value, replayed } = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, () =>
      withIdempotency<PackingTemplate>(
        transaction,
        { actor, request: replay, payload: body },
        {
          authorize: async () => {
            await lockClientIds(transaction, [`packing-template:${body.id}`]);
            const [existing] = await transaction
              .select({ userId: packingTemplates.userId })
              .from(packingTemplates)
              .where(eq(packingTemplates.id, body.id));
            if (existing && existing.userId !== actor.userId) throw new TripNotFoundError();
          },
          validateReplay: async (result) => {
            const [row] = await transaction
              .select({ userId: packingTemplates.userId, createdAt: packingTemplates.createdAt })
              .from(packingTemplates)
              .where(eq(packingTemplates.id, body.id));
            if (
              !row ||
              row.userId !== actor.userId ||
              !row.createdAt ||
              row.createdAt.toISOString() !== result.createdAt
            )
              throw new TripNotFoundError();
          },
          mutate: async () => {
            created = false;
            const [existing] = await transaction
              .select()
              .from(packingTemplates)
              .where(eq(packingTemplates.id, body.id));
            if (existing) {
              if (existing.name !== body.name)
                throw new ConflictError("This ID was already used for a different template.");
              return dbTemplateToType(existing);
            }
            await refuseRecentlyDeleted(transaction, "packing-template", body.id);
            const [row] = await transaction
              .insert(packingTemplates)
              .values({ id: body.id, userId: actor.userId, name: body.name })
              .returning();
            created = true;
            return dbTemplateToType(row);
          },
        }
      )
    )
  );
  if (created && !replayed) revalidatePath("/packing");
  return value;
}

/**
 * Copies one list's items, in order, into a new owned template under the client id. Sections are rebuilt first so the
 * copied items can point at them; every copy starts unchecked. A retry of the same id and name returns the row.
 */
export async function savePackingListAsTemplate(
  actor: Actor,
  listId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<PackingTemplate> {
  listId = saveListContract.params.parse({ listId }).listId;
  const body = saveListContract.body.parse(input);
  const { tripId } = body;
  await requireTripRole(tripId, actor.userId, "editor");
  let created = false;
  const template = await runTripWrite<PackingTemplate>(actor, tripId, { replay, payload: body }, (transaction) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
      const [list] = await transaction.select().from(tripPackingLists).where(eq(tripPackingLists.id, listId));
      if (!list || list.tripId !== tripId) throw new TripNotFoundError();
      await lockClientIds(transaction, [`packing-template:${body.id}`]);
      const [existing] = await transaction
        .select({ userId: packingTemplates.userId })
        .from(packingTemplates)
        .where(eq(packingTemplates.id, body.id));
      if (existing && existing.userId !== actor.userId) throw new TripNotFoundError();
    },
    validateReplay: async (result) => {
      const [row] = await transaction
        .select({ userId: packingTemplates.userId, createdAt: packingTemplates.createdAt })
        .from(packingTemplates)
        .where(eq(packingTemplates.id, body.id));
      if (!row || row.userId !== actor.userId || !row.createdAt || row.createdAt.toISOString() !== result.createdAt)
        throw new TripNotFoundError();
    },
    mutate: async () => {
      const [existing] = await transaction.select().from(packingTemplates).where(eq(packingTemplates.id, body.id));
      if (existing) {
        if (existing.name !== body.name) throw new ConflictError("This ID was already used for a different template.");
        return dbTemplateToType(existing);
      }
      await refuseRecentlyDeleted(transaction, "packing-template", body.id);
      const items = await transaction
        .select()
        .from(packingItems)
        .where(and(eq(packingItems.tripId, tripId), eq(packingItems.listId, listId)))
        .orderBy(asc(packingItems.position));
      if (items.length === 0)
        throw new ValidationFailedError("This packing list has no items to save.", {
          listId: ["This packing list has no items to save."],
        });
      const [row] = await transaction
        .insert(packingTemplates)
        .values({ id: body.id, userId: actor.userId, name: body.name })
        .returning();
      const copies = items.map((item, position) => ({
        id: randomUUID(),
        templateId: row.id,
        text: item.name,
        isLabel: item.isLabel,
        position,
        source: item,
      }));
      const copyIds = new Map(copies.map((copy) => [copy.source.id, copy.id] as const));
      const toRow = ({ source, ...copy }: (typeof copies)[number]) => ({
        ...copy,
        labelId: source.isLabel || !source.labelId ? null : (copyIds.get(source.labelId) ?? null),
      });
      const sections = copies.filter((copy) => copy.isLabel).map(toRow);
      if (sections.length > 0) await transaction.insert(packingTemplateItems).values(sections);
      const entries = copies.filter((copy) => !copy.isLabel).map(toRow);
      if (entries.length > 0) await transaction.insert(packingTemplateItems).values(entries);
      created = true;
      return dbTemplateToType(row);
    },
  }));
  // A template write is not a trip change: no activity or live event, only the pages that show it.
  if (created) {
    revalidatePath("/packing");
    revalidatePath(`/trips/${tripId}`);
  }
  return template;
}

export async function getPackingTemplate(actor: Actor, templateId: string) {
  const params = detailContract.params.parse({ templateId });
  const detail = await getTemplateWithItems(params.templateId, actor.userId);
  if (!detail) throw new TripNotFoundError();
  return detail;
}
export async function renamePackingTemplate(
  actor: Actor,
  templateId: string,
  input: unknown,
  replay?: IdempotentRequest
) {
  templateId = renameContract.params.parse({ templateId }).templateId;
  const body = renameContract.body.parse(input);
  const { value, replayed } = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, () =>
      withIdempotency<PackingTemplate>(
        transaction,
        { actor, request: replay, payload: body },
        {
          authorize: async () => {
            await lockClientIds(transaction, [`packing-template:${templateId}`]);
            const [row] = await transaction
              .select()
              .from(packingTemplates)
              .where(and(eq(packingTemplates.id, templateId), eq(packingTemplates.userId, actor.userId)));
            if (!row) throw new TripNotFoundError();
          },
          validateReplay: async (result) => {
            const [row] = await transaction
              .select({ createdAt: packingTemplates.createdAt })
              .from(packingTemplates)
              .where(and(eq(packingTemplates.id, templateId), eq(packingTemplates.userId, actor.userId)));
            if (!row?.createdAt || row.createdAt.toISOString() !== result.createdAt) throw new TripNotFoundError();
          },
          mutate: async () => {
            const [row] = await transaction
              .update(packingTemplates)
              .set({ name: body.name })
              .where(and(eq(packingTemplates.id, templateId), eq(packingTemplates.userId, actor.userId)))
              .returning();
            return dbTemplateToType(row);
          },
        }
      )
    )
  );
  if (!replayed) revalidatePath("/packing");
  return value;
}

export async function deletePackingTemplate(actor: Actor, templateId: string): Promise<void> {
  templateId = deleteContract.params.parse({ templateId }).templateId;
  const deleted = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, async () => {
      await lockClientIds(transaction, [`packing-template:${templateId}`]);
      // The items cascade with the template, so read their ids first: an item create reusing one under another
      // owned template must conflict too.
      const itemIds = await transaction
        .select({ id: packingTemplateItems.id })
        .from(packingTemplateItems)
        .where(eq(packingTemplateItems.templateId, templateId));
      const removed = await transaction
        .delete(packingTemplates)
        .where(and(eq(packingTemplates.id, templateId), eq(packingTemplates.userId, actor.userId)))
        .returning({ id: packingTemplates.id });
      if (removed.length > 0) {
        await recordDeletions(transaction, "packing-template", [templateId], actor.userId);
        await recordDeletions(
          transaction,
          "packing-template-item",
          itemIds.map((item) => item.id),
          actor.userId
        );
      }
      return removed;
    })
  );
  if (deleted.length > 0) revalidatePath("/packing");
}
