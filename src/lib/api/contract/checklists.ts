import { z } from "zod";
import type { Checklist, ChecklistItem } from "@/data/types";
import { defineEndpoint } from "../endpoint";
import { checklistTitleSchema, checklistItemContentSchema, itineraryPositionSchema } from "@/lib/validation-schemas";
const lifecycleUuid = z.uuid().toLowerCase();
const checklistParams = z.object({ checklistId: lifecycleUuid });
// Trim first so the cap and blank check apply to what is stored, matching the inline editor that trims before saving.
// Shared by item create/update and a checklist's first item so a blank item is rejected the same way everywhere.
const itemContent = z
  .string({ error: "Checklist item must be text." })
  .trim()
  .min(1, "Checklist item is required.")
  .pipe(checklistItemContentSchema);
/** Where a checklist's title and items are copied from: one of the actor's templates or a packing list on the trip. */
const packingSourceSchema = z.strictObject({ type: z.enum(["template", "packing-list"]), id: lifecycleUuid });
export const createChecklist = defineEndpoint<Checklist>()({
  method: "POST",
  path: "/api/v1/trips/:tripId/checklists",
  params: z.object({ tripId: lifecycleUuid }),
  body: z
    .strictObject({
      dayId: lifecycleUuid,
      position: itineraryPositionSchema,
      id: lifecycleUuid.optional(),
      title: checklistTitleSchema,
      firstItem: z.strictObject({ id: lifecycleUuid.optional(), content: itemContent }).optional(),
      source: packingSourceSchema.optional(),
    })
    // A source supplies the title and every item, so it excludes the two fields that would also set them.
    .refine((body) => body.source === undefined || (body.title === undefined && body.firstItem === undefined), {
      path: ["source"],
      message: "A packing source cannot be combined with a title or first item.",
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
