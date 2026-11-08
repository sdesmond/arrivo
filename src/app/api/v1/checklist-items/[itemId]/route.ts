import { apiRoute } from "@/lib/api/route";
import { updateChecklistItem } from "@/lib/api/contract/checklists";
import { updateChecklistItem as update } from "@/lib/services/checklists";
export const PATCH = apiRoute(
  updateChecklistItem,
  ({ actor, params, body, replay }) => update(actor, params.itemId, body, replay),
  { idempotent: {} }
);
