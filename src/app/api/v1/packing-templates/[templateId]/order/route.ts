import { apiRoute } from "@/lib/api/route";
import { reorderPackingTemplateItems } from "@/lib/api/contract/packing-templates";
import { reorderPackingTemplateItems as reorder } from "@/lib/services/packing-template-items";

export const PUT = apiRoute(
  reorderPackingTemplateItems,
  ({ actor, params, body, replay }) => reorder(actor, params.templateId, body, replay),
  { idempotent: {} }
);
