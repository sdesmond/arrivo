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
export const createPackingTemplate = defineEndpoint<PackingTemplate>()({
  method: "POST",
  path: "/api/v1/packing-templates",
  params: z.object({}),
  body: z.strictObject({
    id: z.uuid().toLowerCase(),
    name: z
      .string()
      .trim()
      .min(1, "Template name is required.")
      .max(FIELD_LIMITS.templateName, overLimitMessage("Template name", FIELD_LIMITS.templateName)),
  }),
});
