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
export const updateChecklistItem = defineEndpoint<ChecklistItem>()({
  method: "PATCH",
  path: "/api/v1/checklist-items/:itemId",
  params: z.object({ itemId: z.uuid() }),
  body: z.strictObject({ isChecked: z.boolean() }),
});
