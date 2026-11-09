import { apiRoute } from "@/lib/api/route";
import { createChecklistItem } from "@/lib/api/contract/checklists";
import { createChecklistItem as create } from "@/lib/services/checklists";
export const POST = apiRoute(
  createChecklistItem,
  ({ actor, params, body, replay }) => create(actor, params.checklistId, body, replay),
  { idempotent: {} }
);
