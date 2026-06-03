"use server";

import { and, asc, eq, gt, inArray, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { idempotencyKeys, packingItems, packingTemplateItems, packingTemplates } from "@/db/schema";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { withErrorHandling } from "@/lib/error-utils";
import type {
  AddPackingItemInput,
  PullTemplatesResult,
  SaveTripAsTemplateResult,
  UpdatePackingItemInput,
} from "@/data/types";

const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

type LabelValidationExecutor = Pick<typeof db, "select">;

function normalizePackingItemName(name: string | undefined): string {
  const trimmedName = name?.trim() ?? "";
  if (!trimmedName) {
    throw new Error("Packing item name is required");
  }
  return trimmedName;
}

async function validateLabelId(
  tripId: string,
  labelId: string | null,
  executor: LabelValidationExecutor = db
): Promise<void> {
  if (labelId === null) {
    return;
  }

  const [label] = await executor
    .select({ id: packingItems.id })
    .from(packingItems)
    .where(and(eq(packingItems.id, labelId), eq(packingItems.isLabel, true), eq(packingItems.tripId, tripId)));

  if (!label) {
    throw new Error("Invalid labelId: referenced row is not a label or belongs to a different trip");
  }
}

function isSaveTripAsTemplateResult(value: unknown): value is SaveTripAsTemplateResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "templateId" in value && typeof value.templateId === "string";
}

async function getCachedTemplateResult(
  idempotencyKey: string,
  userId: string
): Promise<SaveTripAsTemplateResult | null> {
  const [existing] = await db
    .select({
      result: idempotencyKeys.result,
      createdAt: idempotencyKeys.createdAt,
    })
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.key, idempotencyKey), eq(idempotencyKeys.userId, userId)));

  if (!existing) {
    return null;
  }

  if (Date.now() - existing.createdAt.getTime() >= IDEMPOTENCY_WINDOW_MS) {
    return null;
  }

  return isSaveTripAsTemplateResult(existing.result) ? existing.result : null;
}

async function addPackingItemImpl(tripId: string, input: AddPackingItemInput): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  const name = normalizePackingItemName(input.name);
  const labelId = input.isLabel ? null : (input.labelId ?? null);

  if (input.afterItemId) {
    const afterItemId = input.afterItemId;
    await db.transaction(async (tx) => {
      await validateLabelId(tripId, labelId, tx);

      const [targetItem] = await tx
        .select()
        .from(packingItems)
        .where(and(eq(packingItems.id, afterItemId), eq(packingItems.tripId, tripId)));
      if (!targetItem) {
        throw new Error("Target item not found");
      }

      await tx
        .update(packingItems)
        .set({ position: sql`${packingItems.position} + 1` })
        .where(and(eq(packingItems.tripId, tripId), gt(packingItems.position, targetItem.position)));
      await tx.insert(packingItems).values({
        tripId,
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
      await validateLabelId(tripId, labelId, tx);

      const [targetItem] = await tx
        .select()
        .from(packingItems)
        .where(and(eq(packingItems.id, beforeItemId), eq(packingItems.tripId, tripId)));
      if (!targetItem) {
        throw new Error("Target item not found");
      }

      await tx
        .update(packingItems)
        .set({ position: sql`${packingItems.position} + 1` })
        .where(and(eq(packingItems.tripId, tripId), gt(packingItems.position, targetItem.position - 1)));
      await tx.insert(packingItems).values({
        tripId,
        name,
        done: false,
        isLabel: input.isLabel ?? false,
        position: targetItem.position,
        labelId,
      });
    });
  } else {
    await validateLabelId(tripId, labelId);

    const [{ maxPos }] = await db
      .select({ maxPos: max(packingItems.position) })
      .from(packingItems)
      .where(eq(packingItems.tripId, tripId));

    await db.insert(packingItems).values({
      tripId,
      name,
      done: false,
      isLabel: input.isLabel ?? false,
      position: (maxPos ?? -1) + 1,
      labelId,
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
  const [item] = await db.select().from(packingItems).where(eq(packingItems.id, itemId));
  if (!item) {
    return;
  }
  await assertTripAccess(item.tripId, user.id!, "editor");
  await db.update(packingItems).set({ done: !item.done }).where(eq(packingItems.id, itemId));
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
    for (const entry of ordered) {
      await validateLabelId(tripId, entry.labelId, tx);
      await tx
        .update(packingItems)
        .set({ position: entry.position, labelId: entry.labelId })
        .where(and(eq(packingItems.id, entry.id), eq(packingItems.tripId, tripId)));
    }
  });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
}

async function pullTemplatesOntoTripImpl(tripId: string, templateIds: string[]): Promise<PullTemplatesResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  const uniqueIds = [...new Set(templateIds)];
  if (uniqueIds.length === 0) {
    return { added: 0, skipped: 0 };
  }

  const existingRows = await db
    .select({ name: packingItems.name, id: packingItems.id, isLabel: packingItems.isLabel })
    .from(packingItems)
    .where(eq(packingItems.tripId, tripId));
  const existingNames = new Set(existingRows.map((row) => row.name.toLowerCase().trim()));
  const existingLabelNameToId = new Map<string, string>();
  for (const row of existingRows) {
    if (row.isLabel) {
      existingLabelNameToId.set(row.name.toLowerCase().trim(), row.id);
    }
  }

  const ownedTemplates = await db
    .select({ id: packingTemplates.id })
    .from(packingTemplates)
    .where(and(inArray(packingTemplates.id, uniqueIds), eq(packingTemplates.userId, user.id!)));
  const ownedIds = new Set(ownedTemplates.map((template) => template.id));

  let added = 0;
  let skipped = 0;

  await db.transaction(async (tx) => {
    const [maxPosRow] = await tx
      .select({ maxPos: max(packingItems.position) })
      .from(packingItems)
      .where(eq(packingItems.tripId, tripId));
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
  if (trimmedName.length > 100) {
    throw new Error("Template name must be 100 characters or fewer");
  }

  let result: SaveTripAsTemplateResult = { templateId: "" };

  await db.transaction(async (tx) => {
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

export async function reorderPackingItems(
  tripId: string,
  ordered: { id: string; labelId: string | null; position: number }[]
): Promise<void> {
  return reorderPackingItemsWithErrorHandling(tripId, ordered);
}

export async function pullTemplatesOntoTrip(tripId: string, templateIds: string[]): Promise<PullTemplatesResult> {
  return pullTemplatesOntoTripWithErrorHandling(tripId, templateIds);
}

export async function saveTripListAsTemplate(
  tripId: string,
  name: string,
  idempotencyKey?: string
): Promise<SaveTripAsTemplateResult> {
  return saveTripListAsTemplateWithErrorHandling(tripId, name, idempotencyKey);
}
