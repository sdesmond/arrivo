import { z } from "zod";
import type { PackingTemplate } from "@/data/types";
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
  items: import("@/data/types").PackingTemplateItem[];
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
