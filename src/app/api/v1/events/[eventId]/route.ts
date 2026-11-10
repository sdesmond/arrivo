import { apiRoute } from "@/lib/api/route";
import { updateEvent, deleteEvent } from "@/lib/api/contract/events";
import { updateEvent as update, deleteEvent as remove } from "@/lib/services/events";
export const PATCH = apiRoute(
  updateEvent,
  ({ actor, params, body, replay }) => update(actor, params.eventId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(
  deleteEvent,
  ({ actor, params, body, replay }) => remove(actor, params.eventId, body, replay),
  { idempotent: {} }
);
