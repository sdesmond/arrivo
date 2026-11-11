import { apiRoute } from "@/lib/api/route";
import { createDayNote } from "@/lib/api/contract/itinerary-notes";
import { createDayNote as create } from "@/lib/services/itinerary-notes";
export const POST = apiRoute(
  createDayNote,
  ({ actor, params, body, replay }) => create(actor, params.dayId, body, replay),
  { idempotent: {} }
);
