import { apiRoute } from "@/lib/api/route";
import { getPackingTemplate, renamePackingTemplate, deletePackingTemplate } from "@/lib/api/contract/packing-templates";
import {
  getPackingTemplate as detail,
  renamePackingTemplate as rename,
  deletePackingTemplate as remove,
} from "@/lib/services/packing-templates";

export const GET = apiRoute(getPackingTemplate, ({ actor, params }) => detail(actor, params.templateId));
export const PATCH = apiRoute(
  renamePackingTemplate,
  ({ actor, params, body, replay }) => rename(actor, params.templateId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(deletePackingTemplate, ({ actor, params }) => remove(actor, params.templateId));
