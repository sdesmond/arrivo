import { apiRoute } from "@/lib/api/route";
import { updatePackingTemplateItem, deletePackingTemplateItem } from "@/lib/api/contract/packing-templates";
import {
  updatePackingTemplateItem as update,
  deletePackingTemplateItem as remove,
} from "@/lib/services/packing-template-items";

export const PATCH = apiRoute(
  updatePackingTemplateItem,
  ({ actor, params, body, replay }) => update(actor, params.itemId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(
  deletePackingTemplateItem,
  ({ actor, params, body, replay }) => remove(actor, params.itemId, body, replay),
  { idempotent: {} }
);
