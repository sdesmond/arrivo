import { apiRoute } from "@/lib/api/route";
import { removePackingTemplateSection } from "@/lib/api/contract/packing-templates";
import { removePackingTemplateSection as remove } from "@/lib/services/packing-template-items";

export const DELETE = apiRoute(
  removePackingTemplateSection,
  ({ actor, params, body, replay }) => remove(actor, params.itemId, body, replay),
  { idempotent: {} }
);
