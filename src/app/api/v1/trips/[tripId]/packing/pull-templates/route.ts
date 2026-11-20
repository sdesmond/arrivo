import { apiRoute } from "@/lib/api/route";
import { pullTemplatesOntoTrip } from "@/lib/api/contract/packing";
import { pullTemplatesOntoTrip as pull } from "@/lib/services/packing";

export const POST = apiRoute(
  pullTemplatesOntoTrip,
  ({ actor, params, body, replay }) => pull(actor, params.tripId, body, replay),
  { idempotent: {} }
);
