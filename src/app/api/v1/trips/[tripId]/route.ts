import { apiRoute } from "@/lib/api/route";
import { updateTrip } from "@/lib/api/contract/trips";
import { updateTrip as update } from "@/lib/services/trips";

export const PATCH = apiRoute(
  updateTrip,
  ({ actor, params, body, replay }) => update(actor, params.tripId, body, replay),
  { idempotent: {} }
);
