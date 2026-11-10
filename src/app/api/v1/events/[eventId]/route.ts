import { apiRoute } from "@/lib/api/route";
import { updateEvent } from "@/lib/api/contract/events";
import { updateEvent as update } from "@/lib/services/events";
export const PATCH = apiRoute(
  updateEvent,
  ({ actor, params, body, replay }) => update(actor, params.eventId, body, replay),
  { idempotent: {} }
);
