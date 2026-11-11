import { apiRoute } from "@/lib/api/route";
import { addDay } from "@/lib/api/contract/days";
import { addDay as add } from "@/lib/services/days";
export const POST = apiRoute(addDay, ({ actor, params, body, replay }) => add(actor, params.tripId, body, replay), {
  idempotent: {},
});
