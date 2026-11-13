import { apiRoute } from "@/lib/api/route";
import { setTripCover as setContract, deleteTripCover } from "@/lib/api/contract/covers";
import { setTripCover, removeTripCover } from "@/lib/services/covers";
export const PUT = apiRoute(
  setContract,
  ({ actor, params, body, replay }) => setTripCover(actor, params.tripId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(
  deleteTripCover,
  ({ actor, params, body, replay }) => removeTripCover(actor, params.tripId, body, replay),
  { idempotent: {} }
);
