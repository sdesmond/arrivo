import { apiRoute } from "@/lib/api/route";
import { updateDay, deleteDay } from "@/lib/api/contract/days";
import { updateDay as update, deleteDay as remove } from "@/lib/services/days";
export const PATCH = apiRoute(
  updateDay,
  ({ actor, params, body, replay }) => update(actor, params.dayId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(
  deleteDay,
  ({ actor, params, body, replay }) => remove(actor, params.dayId, body, replay),
  { idempotent: {} }
);
