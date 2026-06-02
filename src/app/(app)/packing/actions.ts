"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { packingTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import type { CreatePackingTemplateInput, UpdatePackingTemplatePatch } from "@/data/types";
import { normalizeTemplateName } from "./template-name";

export async function createTemplate(input: CreatePackingTemplateInput): Promise<{ id: string }> {
  const user = await requireUser();
  const name = normalizeTemplateName(input.name);

  const [template] = await db
    .insert(packingTemplates)
    .values({
      userId: user.id!,
      name,
    })
    .returning({ id: packingTemplates.id });

  if (!template) throw new Error("Failed to create template.");

  revalidatePath("/packing");
  return { id: template.id };
}

export async function renameTemplate(id: string, patch: UpdatePackingTemplatePatch): Promise<void> {
  const user = await requireUser();
  const name = normalizeTemplateName(patch.name);

  await db
    .update(packingTemplates)
    .set({ name })
    .where(and(eq(packingTemplates.id, id), eq(packingTemplates.userId, user.id!)));

  revalidatePath("/packing");
}

export async function deleteTemplate(id: string): Promise<void> {
  const user = await requireUser();

  await db.delete(packingTemplates).where(and(eq(packingTemplates.id, id), eq(packingTemplates.userId, user.id!)));

  revalidatePath("/packing");
}
