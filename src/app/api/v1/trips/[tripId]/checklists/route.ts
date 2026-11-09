import { apiRoute } from "@/lib/api/route";
import { createChecklist } from "@/lib/api/contract/checklists";
import { createChecklist as create } from "@/lib/services/checklists";
export const POST = apiRoute(
  createChecklist,
  ({ actor, params, body, replay }) => create(actor, params.tripId, body, replay),
  { idempotent: {} }
);
