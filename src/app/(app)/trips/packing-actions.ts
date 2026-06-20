"use server";

import { and, asc, eq, gt, inArray, isNull, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { idempotencyKeys, packingItems, packingTemplateItems, packingTemplates, tripPackingLists } from "@/db/schema";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { withErrorHandling } from "@/lib/error-utils";
import { lockTripForUpdate } from "@/lib/server-action-locks";
import type {
  AddPackingItemInput,
  PullTemplatesResult,
  RemovePackingSectionInput,
  SaveTripAsTemplateResult,
  UpdatePackingItemInput,
} from "@/data/types";
import { RemovePackingSectionMode } from "@/data/types";

const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;
const TEMPLATE_NAME_MAX = 30;

type LabelValidationExecutor = Pick<typeof db, "select">;

function buildPackingListItemScope(tripId: string, listId: string | null) {
  if (listId === null) {
    return and(eq(packingItems.tripId, tripId), isNull(packingItems.listId));
  }

  return and(eq(packingItems.tripId, tripId), eq(packingItems.listId, listId));
}

const PACKING_ITEM_TEXT_MAX = 30;

function normalizePackingItemName(name: string | undefined): string {
  const trimmedName = name?.trim() ?? "";
  if (!trimmedName) {
    throw new Error("Packing item name is required");
  }
  if (trimmedName.length > PACKING_ITEM_TEXT_MAX) {
    throw new Error(`Packing item name must be ${PACKING_ITEM_TEXT_MAX} characters or fewer.`);
  }
  return trimmedName;
}

async function validatePackingListId(
  tripId: string,
  listId: string | null,
  executor: LabelValidationExecutor = db
): Promise<void> {
  if (listId === null) {
    return;
  }

  const [list] = await executor
    .select({ id: tripPackingLists.id })
    .from(tripPackingLists)
    .where(and(eq(tripPackingLists.id, listId), eq(tripPackingLists.tripId, tripId)));

  if (!list) {
    throw new Error("Invalid listId: referenced packing list belongs to a different trip");
  }
}

async function validateLabelId(
  tripId: string,
  listId: string | null,
  labelId: string | null,
  executor: LabelValidationExecutor = db
): Promise<void> {
  if (labelId === null) {
    return;
  }

  const [label] = await executor
    .select({ id: packingItems.id, listId: packingItems.listId })
    .from(packingItems)
    .where(and(eq(packingItems.id, labelId), eq(packingItems.isLabel, true), eq(packingItems.tripId, tripId)));

  if (!label) {
    throw new Error("Invalid labelId: referenced row is not a label or belongs to a different trip");
  }

  if ((label.listId ?? null) !== listId) {
    throw new Error("Invalid labelId: referenced row belongs to a different packing list");
  }
}

function isSaveTripAsTemplateResult(value: unknown): value is SaveTripAsTemplateResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "templateId" in value && typeof value.templateId === "string";
}

async function addPackingItemImpl(tripId: string, input: AddPackingItemInput): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  const name = normalizePackingItemName(input.name);
  const labelId = input.isLabel ? null : (input.labelId ?? null);
  const listId = input.listId ?? null;

  if (input.afterItemId) {
    const afterItemId = input.afterItemId;
    await db.transaction(async (tx) => {
      await lockTripForUpdate(tx, tripId);
      await validatePackingListId(tripId, listId, tx);
      await validateLabelId(tripId, listId, labelId, tx);

      const [targetItem] = await tx
        .select()
        .from(packingItems)
        .where(and(eq(packingItems.id, afterItemId), eq(packingItems.tripId, tripId)));
      if (!targetItem) {
        throw new Error("Target item not found");
      }
      if ((targetItem.listId ?? null) !== listId) {
        throw new Error("Target item belongs to a different packing list");
      }

      await tx
        .update(packingItems)
        .set({ position: sql`${packingItems.position} + 1` })
        .where(and(buildPackingListItemScope(tripId, listId), gt(packingItems.position, targetItem.position)));
      await tx.insert(packingItems).values({
        tripId,
        listId,
        name,
        done: false,
        isLabel: input.isLabel ?? false,
        position: targetItem.position + 1,
        labelId,
      });
    });
  } else if (input.beforeItemId) {
    const beforeItemId = input.beforeItemId;
    await db.transaction(async (tx) => {
      await lockTripForUpdate(tx, tripId);
      await validatePackingListId(tripId, listId, tx);
      await validateLabelId(tripId, listId, labelId, tx);

      const [targetItem] = await tx
        .select()
        .from(packingItems)
        .where(and(eq(packingItems.id, beforeItemId), eq(packingItems.tripId, tripId)));
      if (!targetItem) {
        throw new Error("Target item not found");
      }
      if ((targetItem.listId ?? null) !== listId) {
        throw new Error("Target item belongs to a different packing list");
      }

      await tx
        .update(packingItems)
        .set({ position: sql`${packingItems.position} + 1` })
        .where(and(buildPackingListItemScope(tripId, listId), gt(packingItems.position, targetItem.position - 1)));
      await tx.insert(packingItems).values({
        tripId,
        listId,
        name,
        done: false,
        isLabel: input.isLabel ?? false,
        position: targetItem.position,
        labelId,
      });
    });
  } else {
    await db.transaction(async (tx) => {
      await lockTripForUpdate(tx, tripId);
      await validatePackingListId(tripId, listId, tx);
      await validateLabelId(tripId, listId, labelId, tx);

      const [{ maxPos }] = await tx
        .select({ maxPos: max(packingItems.position) })
        .from(packingItems)
        .where(buildPackingListItemScope(tripId, listId));

      await tx.insert(packingItems).values({
        tripId,
        listId,
        name,
        done: false,
        isLabel: input.isLabel ?? false,
        position: (maxPos ?? -1) + 1,
        labelId,
      });
    });
  }

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
}

async function updatePackingItemImpl(itemId: string, input: UpdatePackingItemInput): Promise<void> {
  const user = await requireUser();
  const name = normalizePackingItemName(input.name);
  const [item] = await db.select({ tripId: packingItems.tripId }).from(packingItems).where(eq(packingItems.id, itemId));
  if (!item) {
    throw new Error("Packing item not found");
  }
  await assertTripAccess(item.tripId, user.id!, "editor");
  await db.update(packingItems).set({ name }).where(eq(packingItems.id, itemId));
  revalidatePath(`/trips/${item.tripId}`);
  revalidatePath("/trips");
}

async function togglePackingItemImpl(itemId: string): Promise<void> {
  const user = await requireUser();
  const [item] = await db.select({ tripId: packingItems.tripId }).from(packingItems).where(eq(packingItems.id, itemId));
  if (!item) {
    return;
  }
  await assertTripAccess(item.tripId, user.id!, "editor");

  await db.transaction(async (tx) => {
    await lockTripForUpdate(tx, item.tripId);

    const [lockedItem] = await tx.select().from(packingItems).where(eq(packingItems.id, itemId));
    if (!lockedItem) {
      return;
    }

    await tx.update(packingItems).set({ done: !lockedItem.done }).where(eq(packingItems.id, itemId));
  });

  revalidatePath(`/trips/${item.tripId}`);
  revalidatePath("/trips");
}

async function removePackingItemImpl(itemId: string): Promise<void> {
  const user = await requireUser();
  const [item] = await db.select().from(packingItems).where(eq(packingItems.id, itemId));
  if (!item) {
    return;
  }
  await assertTripAccess(item.tripId, user.id!, "editor");
  await db.delete(packingItems).where(eq(packingItems.id, itemId));
  revalidatePath(`/trips/${item.tripId}`);
  revalidatePath("/trips");
}

async function removePackingSectionImpl(sectionId: string, input: RemovePackingSectionInput): Promise<void> {
  const user = await requireUser();
  const [section] = await db
    .select({ tripId: packingItems.tripId })
    .from(packingItems)
    .where(eq(packingItems.id, sectionId));
  if (!section) {
    return;
  }

  await assertTripAccess(section.tripId, user.id!, "editor");
  let revalidateTripId = section.tripId;

  await db.transaction(async (tx) => {
    await lockTripForUpdate(tx, section.tripId);

    const [lockedSection] = await tx
      .select({ id: packingItems.id, tripId: packingItems.tripId, isLabel: packingItems.isLabel })
      .from(packingItems)
      .where(eq(packingItems.id, sectionId));
    if (!lockedSection) {
      return;
    }
    if (!lockedSection.isLabel) {
      throw new Error("Packing section not found");
    }
    revalidateTripId = lockedSection.tripId;

    if (input.mode === RemovePackingSectionMode.DeleteItems) {
      await tx
        .delete(packingItems)
        .where(and(eq(packingItems.tripId, lockedSection.tripId), eq(packingItems.labelId, lockedSection.id)));
    } else if (input.mode === RemovePackingSectionMode.MoveItemsToUngrouped) {
      await tx
        .update(packingItems)
        .set({ labelId: null })
        .where(and(eq(packingItems.tripId, lockedSection.tripId), eq(packingItems.labelId, lockedSection.id)));
    } else {
      const exhaustiveMode: never = input.mode;
      throw new Error(`Unsupported section removal mode: ${String(exhaustiveMode)}`);
    }

    await tx.delete(packingItems).where(eq(packingItems.id, lockedSection.id));
  });

  revalidatePath(`/trips/${revalidateTripId}`);
  revalidatePath("/trips");
}

async function reorderPackingItemsImpl(
  tripId: string,
  ordered: { id: string; labelId: string | null; position: number }[]
): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  if (ordered.length === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    await lockTripForUpdate(tx, tripId);

    for (const entry of ordered) {
      const [currentItem] = await tx
        .select({ listId: packingItems.listId })
        .from(packingItems)
        .where(and(eq(packingItems.id, entry.id), eq(packingItems.tripId, tripId)));
      if (!currentItem) {
        throw new Error("Packing item not found");
      }

      await validateLabelId(tripId, currentItem.listId ?? null, entry.labelId, tx);
      await tx
        .update(packingItems)
        .set({ position: entry.position, labelId: entry.labelId })
        .where(and(eq(packingItems.id, entry.id), eq(packingItems.tripId, tripId)));
    }
  });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
}

async function pullTemplatesOntoTripImpl(
  tripId: string,
  templateIds: string[],
  listId?: string | null
): Promise<PullTemplatesResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  const normalizedListId = listId ?? null;
  const uniqueIds = [...new Set(templateIds)];
  if (uniqueIds.length === 0) {
    return { added: 0, skipped: 0 };
  }

  const ownedTemplates = await db
    .select({ id: packingTemplates.id })
    .from(packingTemplates)
    .where(and(inArray(packingTemplates.id, uniqueIds), eq(packingTemplates.userId, user.id!)));
  const ownedIds = new Set(ownedTemplates.map((template) => template.id));

  let added = 0;
  let skipped = 0;

  await db.transaction(async (tx) => {
    await lockTripForUpdate(tx, tripId);
    await validatePackingListId(tripId, normalizedListId, tx);

    const existingRows = await tx
      .select({ name: packingItems.name, id: packingItems.id, isLabel: packingItems.isLabel })
      .from(packingItems)
      .where(buildPackingListItemScope(tripId, normalizedListId));
    const existingNames = new Set(existingRows.map((row) => row.name.toLowerCase().trim()));
    const existingLabelNameToId = new Map<string, string>();
    for (const row of existingRows) {
      if (row.isLabel) {
        existingLabelNameToId.set(row.name.toLowerCase().trim(), row.id);
      }
    }

    const [maxPosRow] = await tx
      .select({ maxPos: max(packingItems.position) })
      .from(packingItems)
      .where(buildPackingListItemScope(tripId, normalizedListId));
    let nextPosition = (maxPosRow.maxPos ?? -1) + 1;

    const labelIdMap = new Map<string, string>();

    for (const templateId of uniqueIds) {
      if (!ownedIds.has(templateId)) {
        continue;
      }

      const items = await tx
        .select()
        .from(packingTemplateItems)
        .where(eq(packingTemplateItems.templateId, templateId))
        .orderBy(asc(packingTemplateItems.position));

      for (const item of items) {
        const normalizedText = item.text.trim().toLowerCase();
        if (existingNames.has(normalizedText)) {
          if (item.isLabel) {
            const existingId = existingLabelNameToId.get(normalizedText);
            if (existingId) {
              labelIdMap.set(item.id, existingId);
            }
          }
          skipped++;
          continue;
        }

        const newLabelId = item.isLabel ? null : item.labelId ? (labelIdMap.get(item.labelId) ?? null) : null;

        const [inserted] = await tx
          .insert(packingItems)
          .values({
            tripId,
            name: item.text.trim(),
            done: false,
            isLabel: item.isLabel,
            position: nextPosition++,
            labelId: newLabelId,
            listId: normalizedListId,
          })
          .returning({ id: packingItems.id });

        if (!inserted) {
          throw new Error("Failed to insert packing item during template pull");
        }

        if (item.isLabel) {
          labelIdMap.set(item.id, inserted.id);
        }

        added++;
        existingNames.add(normalizedText);
      }
    }
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");

  return { added, skipped };
}

async function saveTripListAsTemplateImpl(
  tripId: string,
  name: string,
  idempotencyKey?: string
): Promise<SaveTripAsTemplateResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new Error("Template name is required");
  }
  if (trimmedName.length > TEMPLATE_NAME_MAX) {
    throw new Error(`Template name must be ${TEMPLATE_NAME_MAX} characters or fewer`);
  }

  let result: SaveTripAsTemplateResult = { templateId: "" };

  await db.transaction(async (tx) => {
    await lockTripForUpdate(tx, tripId);

    if (idempotencyKey) {
      const [existing] = await tx
        .select({ result: idempotencyKeys.result, createdAt: idempotencyKeys.createdAt })
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.key, idempotencyKey), eq(idempotencyKeys.userId, user.id!)));

      if (existing && Date.now() - existing.createdAt.getTime() < IDEMPOTENCY_WINDOW_MS) {
        const cached = isSaveTripAsTemplateResult(existing.result) ? existing.result : null;
        if (cached) {
          result = cached;
          return;
        }
      }
    }

    const tripItems = await tx
      .select()
      .from(packingItems)
      .where(eq(packingItems.tripId, tripId))
      .orderBy(asc(packingItems.position));

    if (tripItems.length === 0) {
      throw new Error("Cannot save an empty packing list as a template");
    }

    const [template] = await tx
      .insert(packingTemplates)
      .values({ userId: user.id!, name: trimmedName })
      .returning({ id: packingTemplates.id });

    if (!template) {
      throw new Error("Failed to create template");
    }

    const labelIdMap = new Map<string, string>();

    for (const item of tripItems) {
      if (item.isLabel) {
        const [inserted] = await tx
          .insert(packingTemplateItems)
          .values({
            templateId: template.id,
            text: item.name,
            isLabel: true,
            position: item.position,
            labelId: null,
          })
          .returning({ id: packingTemplateItems.id });

        if (!inserted) {
          throw new Error(`Failed to insert template label for item "${item.name}" (${item.id})`);
        }
        labelIdMap.set(item.id, inserted.id);
      }
    }

    for (const item of tripItems) {
      if (!item.isLabel) {
        if (item.labelId && !labelIdMap.has(item.labelId)) {
          throw new Error(`Item "${item.name}" (${item.id}) references a section label that no longer exists`);
        }
        const newLabelId = item.labelId ? labelIdMap.get(item.labelId)! : null;

        const [inserted] = await tx
          .insert(packingTemplateItems)
          .values({
            templateId: template.id,
            text: item.name,
            isLabel: false,
            position: item.position,
            labelId: newLabelId,
          })
          .returning({ id: packingTemplateItems.id });

        if (!inserted) {
          throw new Error(`Failed to insert template item "${item.name}" (${item.id})`);
        }
      }
    }

    if (idempotencyKey) {
      await tx
        .insert(idempotencyKeys)
        .values({
          key: idempotencyKey,
          userId: user.id!,
          result: { templateId: template.id },
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    }

    result = { templateId: template.id };
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");

  return result;
}

const addPackingItemWithErrorHandling = withErrorHandling(addPackingItemImpl);
const updatePackingItemWithErrorHandling = withErrorHandling(updatePackingItemImpl);
const togglePackingItemWithErrorHandling = withErrorHandling(togglePackingItemImpl);
const removePackingItemWithErrorHandling = withErrorHandling(removePackingItemImpl);
const removePackingSectionWithErrorHandling = withErrorHandling(removePackingSectionImpl);
const reorderPackingItemsWithErrorHandling = withErrorHandling(reorderPackingItemsImpl);
const pullTemplatesOntoTripWithErrorHandling = withErrorHandling(pullTemplatesOntoTripImpl);
const saveTripListAsTemplateWithErrorHandling = withErrorHandling(saveTripListAsTemplateImpl);

export async function addPackingItem(tripId: string, input: AddPackingItemInput): Promise<void> {
  return addPackingItemWithErrorHandling(tripId, input);
}

export async function updatePackingItem(itemId: string, input: UpdatePackingItemInput): Promise<void> {
  return updatePackingItemWithErrorHandling(itemId, input);
}

export async function togglePackingItem(itemId: string): Promise<void> {
  return togglePackingItemWithErrorHandling(itemId);
}

export async function removePackingItem(itemId: string): Promise<void> {
  return removePackingItemWithErrorHandling(itemId);
}

export async function removePackingSection(sectionId: string, input: RemovePackingSectionInput): Promise<void> {
  return removePackingSectionWithErrorHandling(sectionId, input);
}

export async function reorderPackingItems(
  tripId: string,
  ordered: { id: string; labelId: string | null; position: number }[]
): Promise<void> {
  return reorderPackingItemsWithErrorHandling(tripId, ordered);
}

export async function pullTemplatesOntoTrip(
  tripId: string,
  templateIds: string[],
  listId?: string | null
): Promise<PullTemplatesResult> {
  return pullTemplatesOntoTripWithErrorHandling(tripId, templateIds, listId);
}

export async function saveTripListAsTemplate(
  tripId: string,
  name: string,
  idempotencyKey?: string
): Promise<SaveTripAsTemplateResult> {
  return saveTripListAsTemplateWithErrorHandling(tripId, name, idempotencyKey);
}

export async function createPackingList(tripId: string, name: string): Promise<string> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("List name is required");

  const row = await db.transaction(async (tx) => {
    await lockTripForUpdate(tx, tripId);

    const [{ maxPos }] = await tx
      .select({ maxPos: max(tripPackingLists.position) })
      .from(tripPackingLists)
      .where(eq(tripPackingLists.tripId, tripId));

    const [insertedRow] = await tx
      .insert(tripPackingLists)
      .values({ tripId, name: trimmedName, position: (maxPos ?? -1) + 1 })
      .returning({ id: tripPackingLists.id });

    return insertedRow;
  });

  if (!row) throw new Error("Failed to create packing list");

  revalidatePath(`/trips/${tripId}`);
  return row.id;
}

export async function renamePackingList(listId: string, name: string): Promise<void> {
  const user = await requireUser();

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("List name is required");

  const [list] = await db
    .select({ tripId: tripPackingLists.tripId })
    .from(tripPackingLists)
    .where(eq(tripPackingLists.id, listId));
  if (!list) throw new Error("Packing list not found");

  await assertTripAccess(list.tripId, user.id!, "editor");
  await db.update(tripPackingLists).set({ name: trimmedName }).where(eq(tripPackingLists.id, listId));
  revalidatePath(`/trips/${list.tripId}`);
}

export async function deletePackingList(listId: string): Promise<void> {
  const user = await requireUser();

  const [list] = await db
    .select({ tripId: tripPackingLists.tripId })
    .from(tripPackingLists)
    .where(eq(tripPackingLists.id, listId));
  if (!list) return;

  await assertTripAccess(list.tripId, user.id!, "editor");

  await db.transaction(async (tx) => {
    await lockTripForUpdate(tx, list.tripId);
    await tx.delete(packingItems).where(eq(packingItems.listId, listId));
    await tx.delete(tripPackingLists).where(eq(tripPackingLists.id, listId));
  });

  revalidatePath(`/trips/${list.tripId}`);
  revalidatePath("/trips");
}
