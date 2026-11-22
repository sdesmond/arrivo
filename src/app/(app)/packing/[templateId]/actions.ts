"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { packingTemplateItems, packingTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import { withErrorHandling } from "@/lib/error-utils";
import { lockPackingTemplateForUpdate } from "@/lib/server-action-locks";

async function assertTemplateOwnership(templateId: string, userId: string): Promise<void> {
  const [template] = await db
    .select({ id: packingTemplates.id })
    .from(packingTemplates)
    .where(and(eq(packingTemplates.id, templateId), eq(packingTemplates.userId, userId)));

  if (!template) {
    throw new Error("Template not found.");
  }
}

type TemplateQueryExecutor = Pick<typeof db, "select">;

/** Section (label) ids arrive from the client; each must be a section row of this same template. */
async function assertLabelsInTemplate(
  executor: TemplateQueryExecutor,
  templateId: string,
  labelIds: (string | null | undefined)[]
): Promise<void> {
  const uniqueLabelIds = [...new Set(labelIds.filter((labelId): labelId is string => Boolean(labelId)))];
  if (uniqueLabelIds.length === 0) return;

  const found = await executor
    .select({ id: packingTemplateItems.id })
    .from(packingTemplateItems)
    .where(
      and(
        eq(packingTemplateItems.templateId, templateId),
        eq(packingTemplateItems.isLabel, true),
        inArray(packingTemplateItems.id, uniqueLabelIds)
      )
    );

  if (found.length !== uniqueLabelIds.length) {
    throw new Error("Invalid labelId.");
  }
}

async function reorderTemplateItemsImpl(
  templateId: string,
  ordered: { id: string; labelId: string | null; position: number }[]
): Promise<void> {
  const user = await requireUser();
  await assertTemplateOwnership(templateId, user.id!);

  if (ordered.length === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    await lockPackingTemplateForUpdate(tx, templateId);
    await assertLabelsInTemplate(
      tx,
      templateId,
      ordered.map((item) => item.labelId)
    );

    for (const item of ordered) {
      await tx
        .update(packingTemplateItems)
        .set({ position: item.position, labelId: item.labelId })
        .where(and(eq(packingTemplateItems.id, item.id), eq(packingTemplateItems.templateId, templateId)));
    }
  });

  revalidatePath(`/packing/${templateId}`);
}

const reorderTemplateItemsWithErrorHandling = withErrorHandling(reorderTemplateItemsImpl);

export async function reorderTemplateItems(
  templateId: string,
  ordered: { id: string; labelId: string | null; position: number }[]
): Promise<void> {
  return reorderTemplateItemsWithErrorHandling(templateId, ordered);
}
