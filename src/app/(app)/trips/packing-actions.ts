"use server";

import { and, asc, eq, inArray, isNull, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { idempotencyKeys, packingItems, packingTemplateItems, packingTemplates, tripPackingLists } from "@/db/schema";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { withErrorHandling } from "@/lib/error-utils";
import { lockTripForUpdate } from "@/lib/server-action-locks";
import { recordTripUpdated } from "@/lib/trip-activity";
import type { PullTemplatesResult, SaveTripAsTemplateResult } from "@/data/types";
import { FIELD_LIMITS } from "@/lib/validation-limits";
import { IDEMPOTENCY_RETENTION_MS } from "@/lib/idempotency-retention";

// The sweep deletes keys older than the retention, so the replay window must not outlast it.
const IDEMPOTENCY_WINDOW_MS = IDEMPOTENCY_RETENTION_MS;
const TEMPLATE_NAME_MAX = FIELD_LIMITS.templateName;

type LabelValidationExecutor = Pick<typeof db, "select">;

function buildPackingListItemScope(tripId: string, listId: string | null) {
  if (listId === null) {
    return and(eq(packingItems.tripId, tripId), isNull(packingItems.listId));
  }

  return and(eq(packingItems.tripId, tripId), eq(packingItems.listId, listId));
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

function isSaveTripAsTemplateResult(value: unknown): value is SaveTripAsTemplateResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "templateId" in value && typeof value.templateId === "string";
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

  if (added > 0) recordTripUpdated(user.id!, tripId);
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

const pullTemplatesOntoTripWithErrorHandling = withErrorHandling(pullTemplatesOntoTripImpl);
const saveTripListAsTemplateWithErrorHandling = withErrorHandling(saveTripListAsTemplateImpl);

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
