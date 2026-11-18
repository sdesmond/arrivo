import { apiRoute } from "@/lib/api/route";
import { resendInvitation } from "@/lib/api/contract/sharing";
import { resendInvitation as service } from "@/lib/services/sharing";
export const POST = apiRoute(
  resendInvitation,
  ({ actor, params, body, replay }) => service(actor, body.tripId, params.invitationId, replay),
  { idempotent: {} }
);
