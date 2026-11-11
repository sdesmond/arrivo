import { apiRoute } from "@/lib/api/route";
import { createTripNote } from "@/lib/api/contract/trip-notes";
import { createTripNote as create } from "@/lib/services/trip-notes";
export const POST = apiRoute(
  createTripNote,
  ({ actor, params, body, replay }) => create(actor, params.tripId, body, replay),
  { idempotent: {} }
);
