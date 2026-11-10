import { apiRoute } from "@/lib/api/route";
import { createEvent } from "@/lib/api/contract/events";
import { createEvent as create } from "@/lib/services/events";
export const POST = apiRoute(
  createEvent,
  ({ actor, params, body, replay }) => create(actor, params.dayId, body, replay),
  { idempotent: {} }
);
