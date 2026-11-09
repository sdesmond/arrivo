import { z } from "zod";
import type { Checklist, ChecklistItem } from "@/data/types";
import { defineEndpoint } from "../endpoint";
import { checklistTitleSchema, checklistItemContentSchema, itineraryPositionSchema } from "@/lib/validation-schemas";
const lifecycleUuid = z.uuid().toLowerCase();
const checklistParams = z.object({ checklistId: lifecycleUuid });
export const createChecklist = defineEndpoint<Checklist>()({
  method: "POST",
  path: "/api/v1/trips/:tripId/checklists",
  params: z.object({ tripId: lifecycleUuid }),
  body: z.strictObject({
    dayId: lifecycleUuid,
    position: itineraryPositionSchema,
    id: lifecycleUuid.optional(),
    title: checklistTitleSchema,
    firstItem: z.strictObject({ id: lifecycleUuid.optional(), content: checklistItemContentSchema }).optional(),
  }),
});
export const updateChecklistTitle = defineEndpoint<Checklist>()({
  method: "PATCH",
  path: "/api/v1/checklists/:checklistId",
  params: checklistParams,
  body: z.strictObject({ title: checklistTitleSchema.nullable() }),
});
export const deleteChecklist = defineEndpoint<null>()({
  method: "DELETE",
  path: "/api/v1/checklists/:checklistId",
  params: checklistParams,
  body: z.strictObject({ tripId: lifecycleUuid }),
  status: 204,
});
const itemParams = z.object({ itemId: lifecycleUuid });
// Trim first so the cap and blank check apply to what is stored, matching the inline editor that trims before saving.
const itemContent = z
  .string({ error: "Checklist item must be text." })
  .trim()
  .min(1, "Checklist item is required.")
  .pipe(checklistItemContentSchema);
export const createChecklistItem = defineEndpoint<ChecklistItem>()({
  method: "POST",
  path: "/api/v1/checklists/:checklistId/items",
  params: checklistParams,
  body: z.strictObject({ id: lifecycleUuid.optional(), content: itemContent }),
});
export const updateChecklistItem = defineEndpoint<ChecklistItem>()({
  method: "PATCH",
  path: "/api/v1/checklist-items/:itemId",
  params: itemParams,
  body: z.strictObject({ content: itemContent.optional(), isChecked: z.boolean().optional() }),
});
export const deleteChecklistItem = defineEndpoint<null>()({
  method: "DELETE",
  path: "/api/v1/checklist-items/:itemId",
  params: itemParams,
  body: z.strictObject({ tripId: lifecycleUuid }),
  status: 204,
});
