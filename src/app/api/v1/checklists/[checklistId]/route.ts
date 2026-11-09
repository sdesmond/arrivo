import { apiRoute } from "@/lib/api/route";
import { updateChecklistTitle, deleteChecklist } from "@/lib/api/contract/checklists";
import { updateChecklistTitle as update, deleteChecklist as remove } from "@/lib/services/checklists";
export const PATCH = apiRoute(
  updateChecklistTitle,
  ({ actor, params, body, replay }) => update(actor, params.checklistId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(
  deleteChecklist,
  ({ actor, params, body, replay }) => remove(actor, params.checklistId, body, replay),
  { idempotent: {} }
);
