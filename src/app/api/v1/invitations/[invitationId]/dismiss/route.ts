import { apiRoute } from "@/lib/api/route";
import { dismissInvitation } from "@/lib/api/contract/sharing";
import { dismissInvitation as service } from "@/lib/services/sharing";
export const POST = apiRoute(
  dismissInvitation,
  ({ actor, params, body, replay }) => service(actor, body.tripId, params.invitationId, replay),
  { idempotent: {} }
);
