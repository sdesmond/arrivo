import { apiRoute } from "@/lib/api/route";
import { removePackingSection } from "@/lib/api/contract/packing";
import { removePackingSection as remove } from "@/lib/services/packing";
export const DELETE = apiRoute(
  removePackingSection,
  ({ actor, params, body, replay }) => remove(actor, params.itemId, body, replay),
  { idempotent: {} }
);
