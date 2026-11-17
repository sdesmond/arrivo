import { apiRoute } from "@/lib/api/route";
import { createInvitation } from "@/lib/api/contract/sharing";
import { createInvitation as service } from "@/lib/services/sharing";
export const POST = apiRoute(
  createInvitation,
  ({ actor, params, body, replay }) => service(actor, params.tripId, body, replay),
  { idempotent: {} }
);
