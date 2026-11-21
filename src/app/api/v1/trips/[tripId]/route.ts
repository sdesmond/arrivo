import { apiRoute } from "@/lib/api/route";
import { deleteTrip, getTrip, updateTrip } from "@/lib/api/contract/trips";
import { deleteTrip as remove, getTrip as read, updateTrip as update } from "@/lib/services/trips";

export const GET = apiRoute(getTrip, ({ actor, params }) => read(actor, params.tripId), { etag: true });

export const PATCH = apiRoute(
  updateTrip,
  ({ actor, params, body, replay }) => update(actor, params.tripId, body, replay),
  { idempotent: {} }
);

export const DELETE = apiRoute(
  deleteTrip,
  ({ actor, params, body, replay }) => remove(actor, params.tripId, body, replay),
  { idempotent: {} }
);
