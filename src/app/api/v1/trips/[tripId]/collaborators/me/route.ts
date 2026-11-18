import { apiRoute } from "@/lib/api/route";
import { leaveTrip } from "@/lib/api/contract/sharing";
import { leaveTrip as service } from "@/lib/services/sharing";
export const DELETE = apiRoute(leaveTrip, ({ actor, params, replay }) => service(actor, params.tripId, replay), {
  idempotent: {},
});
