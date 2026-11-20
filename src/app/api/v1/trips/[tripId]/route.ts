import { apiRoute } from "@/lib/api/route";
import { getTrip, updateTrip } from "@/lib/api/contract/trips";
import { getTrip as read, updateTrip as update } from "@/lib/services/trips";

export const GET = apiRoute(getTrip, ({ actor, params }) => read(actor, params.tripId), { etag: true });

export const PATCH = apiRoute(
  updateTrip,
  ({ actor, params, body, replay }) => update(actor, params.tripId, body, replay),
  { idempotent: {} }
);
