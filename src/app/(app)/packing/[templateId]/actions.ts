"use server";

import { and, eq, gt, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { packingTemplateItems, packingTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import type { AddTemplateItemInput, UpdateTemplateItemInput } from "@/data/types";

const ITEM_TEXT_MAX = 100;

function normalizeItemText(text: string | undefined): string {
  const trimmed = text?.trim() ?? "";

  if (!trimmed) {
    throw new Error("Item text is required.");
  }

  if (trimmed.length > ITEM_TEXT_MAX) {
    throw new Error(`Item text must be ${ITEM_TEXT_MAX} characters or fewer.`);
  }

  return trimmed;
}

async function assertTemplateOwnership(templateId: string, userId: string): Promise<void> {
  const [template] = await db
    .select({ id: packingTemplates.id })
    .from(packingTemplates)
    .where(and(eq(packingTemplates.id, templateId), eq(packingTemplates.userId, userId)));

  if (!template) {
    throw new Error("Template not found.");
  }
}

async function assertItemOwnership(itemId: string, userId: string): Promise<{ templateId: string }> {
  const [item] = await db
    .select({ templateId: packingTemplateItems.templateId })
    .from(packingTemplateItems)
    .innerJoin(
      packingTemplates,
      and(eq(packingTemplateItems.templateId, packingTemplates.id), eq(packingTemplates.userId, userId))
    )
    .where(eq(packingTemplateItems.id, itemId));

  if (!item) {
    throw new Error("Item not found.");
  }

  return item;
}

export async function addTemplateItem(templateId: string, input: AddTemplateItemInput): Promise<{ id: string }> {
  const user = await requireUser();
  await assertTemplateOwnership(templateId, user.id!);
  const text = normalizeItemText(input.text);
  const labelId = input.isLabel ? null : (input.labelId ?? null);

  let newItem: { id: string } | undefined;

  if (input.afterItemId) {
    const afterItemId = input.afterItemId;
    newItem = await db.transaction(async (tx) => {
      const [targetItem] = await tx
        .select()
        .from(packingTemplateItems)
        .where(and(eq(packingTemplateItems.id, afterItemId), eq(packingTemplateItems.templateId, templateId)));

      if (!targetItem) {
        throw new Error("Target item not found.");
      }

      await tx
        .update(packingTemplateItems)
        .set({ position: sql`${packingTemplateItems.position} + 1` })
        .where(
          and(eq(packingTemplateItems.templateId, templateId), gt(packingTemplateItems.position, targetItem.position))
        );

      const [inserted] = await tx
        .insert(packingTemplateItems)
        .values({
          templateId,
          text,
          isLabel: input.isLabel ?? false,
          position: targetItem.position + 1,
          labelId,
        })
        .returning({ id: packingTemplateItems.id });

      return inserted;
    });
  } else if (input.beforeItemId) {
    const beforeItemId = input.beforeItemId;
    newItem = await db.transaction(async (tx) => {
      const [targetItem] = await tx
        .select()
        .from(packingTemplateItems)
        .where(and(eq(packingTemplateItems.id, beforeItemId), eq(packingTemplateItems.templateId, templateId)));

      if (!targetItem) {
        throw new Error("Target item not found.");
      }

      await tx
        .update(packingTemplateItems)
        .set({ position: sql`${packingTemplateItems.position} + 1` })
        .where(
          and(
            eq(packingTemplateItems.templateId, templateId),
            gt(packingTemplateItems.position, targetItem.position - 1)
          )
        );

      const [inserted] = await tx
        .insert(packingTemplateItems)
        .values({
          templateId,
          text,
          isLabel: input.isLabel ?? false,
          position: targetItem.position,
          labelId,
        })
        .returning({ id: packingTemplateItems.id });

      return inserted;
    });
  } else {
    const [{ maxPos }] = await db
      .select({ maxPos: max(packingTemplateItems.position) })
      .from(packingTemplateItems)
      .where(eq(packingTemplateItems.templateId, templateId));

    const [inserted] = await db
      .insert(packingTemplateItems)
      .values({
        templateId,
        text,
        isLabel: input.isLabel ?? false,
        position: (maxPos ?? -1) + 1,
        labelId,
      })
      .returning({ id: packingTemplateItems.id });

    newItem = inserted;
  }

  if (!newItem) {
    throw new Error("Failed to create template item.");
  }

  revalidatePath(`/packing/${templateId}`);
  return { id: newItem.id };
}

export async function updateTemplateItem(itemId: string, input: UpdateTemplateItemInput): Promise<void> {
  const user = await requireUser();
  const { templateId } = await assertItemOwnership(itemId, user.id!);
  const text = normalizeItemText(input.text);

  await db.update(packingTemplateItems).set({ text }).where(eq(packingTemplateItems.id, itemId));

  revalidatePath(`/packing/${templateId}`);
}

export async function removeTemplateItem(itemId: string): Promise<void> {
  const user = await requireUser();
  const { templateId } = await assertItemOwnership(itemId, user.id!);

  await db.delete(packingTemplateItems).where(eq(packingTemplateItems.id, itemId));

  revalidatePath(`/packing/${templateId}`);
}

export async function reorderTemplateItems(
  templateId: string,
  ordered: { id: string; labelId: string | null; position: number }[]
): Promise<void> {
  const user = await requireUser();
  await assertTemplateOwnership(templateId, user.id!);

  if (ordered.length === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    for (const item of ordered) {
      await tx
        .update(packingTemplateItems)
        .set({ position: item.position, labelId: item.labelId })
        .where(and(eq(packingTemplateItems.id, item.id), eq(packingTemplateItems.templateId, templateId)));
    }
  });

  revalidatePath(`/packing/${templateId}`);
}
