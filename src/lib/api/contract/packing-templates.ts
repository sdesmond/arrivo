import { z } from "zod";
import type { PackingTemplate, PackingTemplateItem, PackingTemplateItemOrder } from "@/data/types";
import { FIELD_LIMITS, overLimitMessage } from "@/lib/validation-limits";
import { defineEndpoint } from "../endpoint";

export const listPackingTemplates = defineEndpoint<{ templates: PackingTemplate[] }>()({
  method: "GET",
  path: "/api/v1/packing-templates",
  params: z.object({}),
  body: z.strictObject({}),
});
const templateName = z
  .string()
  .trim()
  .min(1, "Template name is required.")
  .max(FIELD_LIMITS.templateName, overLimitMessage("Template name", FIELD_LIMITS.templateName));
export const createPackingTemplate = defineEndpoint<PackingTemplate>()({
  method: "POST",
  path: "/api/v1/packing-templates",
  params: z.object({}),
  body: z.strictObject({ id: z.uuid().toLowerCase(), name: templateName }),
});
/** Copies the list's items, in order, into a new template under the client id. */
export const savePackingListAsTemplate = defineEndpoint<PackingTemplate>()({
  method: "POST",
  path: "/api/v1/packing-lists/:listId/template",
  params: z.object({ listId: z.uuid().toLowerCase() }),
  body: z.strictObject({ tripId: z.uuid().toLowerCase(), id: z.uuid().toLowerCase(), name: templateName }),
});

const templateParams = z.object({ templateId: z.uuid().toLowerCase() });
export const getPackingTemplate = defineEndpoint<{
  template: PackingTemplate;
  items: PackingTemplateItem[];
}>()({
  method: "GET",
  path: "/api/v1/packing-templates/:templateId",
  params: templateParams,
  body: z.strictObject({}),
});
export const renamePackingTemplate = defineEndpoint<PackingTemplate>()({
  method: "PATCH",
  path: "/api/v1/packing-templates/:templateId",
  params: templateParams,
  body: z.strictObject({ name: templateName }),
});
export const deletePackingTemplate = defineEndpoint<void>()({
  method: "DELETE",
  path: "/api/v1/packing-templates/:templateId",
  params: templateParams,
  body: z.strictObject({}),
  status: 204,
});

const itemText = z
  .string()
  .trim()
  .min(1, "Item text is required.")
  .max(FIELD_LIMITS.packingItemText, overLimitMessage("Item text", FIELD_LIMITS.packingItemText));
const itemParams = z.object({ itemId: z.uuid().toLowerCase() });
/**
 * Adds an item or section to an owned template under the client id. It goes last unless one anchor places it before or
 * after an item of the same template; `labelId` files an item under a section of that template.
 */
export const createPackingTemplateItem = defineEndpoint<PackingTemplateItem>()({
  method: "POST",
  path: "/api/v1/packing-templates/:templateId/items",
  params: templateParams,
  body: z
    .strictObject({
      id: z.uuid().toLowerCase(),
      text: itemText,
      isLabel: z.boolean().optional(),
      labelId: z.uuid().toLowerCase().nullable().optional(),
      beforeItemId: z.uuid().toLowerCase().optional(),
      afterItemId: z.uuid().toLowerCase().optional(),
    })
    .refine((body) => !(body.beforeItemId && body.afterItemId), { message: "Choose one placement anchor." })
    .refine((body) => !(body.isLabel && body.labelId), { message: "Sections cannot have a parent section." }),
});
export const updatePackingTemplateItem = defineEndpoint<PackingTemplateItem>()({
  method: "PATCH",
  path: "/api/v1/packing-template-items/:itemId",
  params: itemParams,
  body: z.strictObject({ text: itemText }),
});
/** An already-absent or foreign item is a quiet 204, so the answer never shows who owns an id. */
export const deletePackingTemplateItem = defineEndpoint<null>()({
  method: "DELETE",
  path: "/api/v1/packing-template-items/:itemId",
  params: itemParams,
  body: z.strictObject({}),
  status: 204,
});
export const removePackingTemplateSection = defineEndpoint<null>()({
  method: "DELETE",
  path: "/api/v1/packing-template-items/:itemId/section",
  params: itemParams,
  body: z.strictObject({ mode: z.enum(["delete-items", "move-items-to-ungrouped"]) }),
  status: 204,
});

/** Replaces the complete template order against an exact last-confirmed snapshot. */
const orderItem = z.strictObject({ id: z.uuid().toLowerCase(), labelId: z.uuid().toLowerCase().nullable() });
const uniqueIds = (items: { id: string }[]) => new Set(items.map((item) => item.id)).size === items.length;
export const reorderPackingTemplateItems = defineEndpoint<PackingTemplateItemOrder>()({
  method: "PUT",
  path: "/api/v1/packing-templates/:templateId/order",
  params: templateParams,
  body: z.strictObject({
    items: z.array(orderItem).refine(uniqueIds, { message: "Each item can appear once." }),
    expectedItems: z
      .array(orderItem.extend({ position: z.number().int() }))
      .refine(uniqueIds, { message: "Each item can appear once." }),
  }),
});
