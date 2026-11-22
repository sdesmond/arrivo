import { apiRoute } from "@/lib/api/route";
import { createPackingTemplateItem } from "@/lib/api/contract/packing-templates";
import { createPackingTemplateItem as create } from "@/lib/services/packing-template-items";

export const POST = apiRoute(
  createPackingTemplateItem,
  ({ actor, params, body, replay }) => create(actor, params.templateId, body, replay),
  { idempotent: {} }
);
