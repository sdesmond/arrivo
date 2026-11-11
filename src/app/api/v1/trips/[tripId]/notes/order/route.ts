import { apiRoute } from "@/lib/api/route";
import { reorderTripNotes } from "@/lib/api/contract/trip-notes";
import { reorderTripNotes as reorder } from "@/lib/services/trip-notes";
export const PUT = apiRoute(
  reorderTripNotes,
  ({ actor, params, body, replay }) => reorder(actor, params.tripId, body, replay),
  { idempotent: {} }
);
