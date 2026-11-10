import { apiRoute } from "@/lib/api/route";
import { reorderDay } from "@/lib/api/contract/days";
import { reorderDay as reorder } from "@/lib/services/days";
export const PUT = apiRoute(
  reorderDay,
  ({ actor, params, body, replay }) => reorder(actor, params.dayId, body, replay),
  {
    idempotent: {},
  }
);
