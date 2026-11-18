import { apiRoute } from "@/lib/api/route";
import { declineInvitation } from "@/lib/api/contract/sharing";
import { declineInvitation as service } from "@/lib/services/sharing";
export const POST = apiRoute(
  declineInvitation,
  ({ actor, params, replay }) => service(actor, params.invitationId, replay),
  { idempotent: {} }
);
