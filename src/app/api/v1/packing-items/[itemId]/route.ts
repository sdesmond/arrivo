import { apiRoute } from "@/lib/api/route";
import { updatePackingItem, deletePackingItem } from "@/lib/api/contract/packing";
import { updatePackingItem as update, deletePackingItem as remove } from "@/lib/services/packing";
export const PATCH = apiRoute(
  updatePackingItem,
  ({ actor, params, body, replay }) => update(actor, params.itemId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(
  deletePackingItem,
  ({ actor, params, body, replay }) => remove(actor, params.itemId, body, replay),
  { idempotent: {} }
);
