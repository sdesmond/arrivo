import { apiRoute } from "@/lib/api/route";
import { updateChecklistItem, deleteChecklistItem } from "@/lib/api/contract/checklists";
import { updateChecklistItem as update, deleteChecklistItem as remove } from "@/lib/services/checklists";
export const PATCH = apiRoute(
  updateChecklistItem,
  ({ actor, params, body, replay }) => update(actor, params.itemId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(
  deleteChecklistItem,
  ({ actor, params, body, replay }) => remove(actor, params.itemId, body, replay),
  { idempotent: {} }
);
