"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { idempotencyKeys, packingItems, packingTemplateItems, packingTemplates } from "@/db/schema";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { withErrorHandling } from "@/lib/error-utils";
import { lockTripForUpdate } from "@/lib/server-action-locks";
import type { SaveTripAsTemplateResult } from "@/data/types";
import { FIELD_LIMITS } from "@/lib/validation-limits";
import { IDEMPOTENCY_RETENTION_MS } from "@/lib/idempotency-retention";

// The sweep deletes keys older than the retention, so the replay window must not outlast it.
const IDEMPOTENCY_WINDOW_MS = IDEMPOTENCY_RETENTION_MS;
const TEMPLATE_NAME_MAX = FIELD_LIMITS.templateName;

function isSaveTripAsTemplateResult(value: unknown): value is SaveTripAsTemplateResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "templateId" in value && typeof value.templateId === "string";
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

const saveTripListAsTemplateWithErrorHandling = withErrorHandling(saveTripListAsTemplateImpl);

export async function saveTripListAsTemplate(
  tripId: string,
  name: string,
  idempotencyKey?: string
): Promise<SaveTripAsTemplateResult> {
  return saveTripListAsTemplateWithErrorHandling(tripId, name, idempotencyKey);
}
