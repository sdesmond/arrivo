import { apiRoute } from "@/lib/api/route";
import { rescindInvitation } from "@/lib/api/contract/sharing";
import { rescindInvitation as service } from "@/lib/services/sharing";
export const DELETE = apiRoute(
  rescindInvitation,
  ({ actor, params, replay }) => service(actor, params.tripId, params.invitationId, replay),
  { idempotent: {} }
);
