import { apiRoute } from "@/lib/api/route";
import { acceptInvitation } from "@/lib/api/contract/sharing";
import { acceptInvitation as service } from "@/lib/services/sharing";
export const POST = apiRoute(
  acceptInvitation,
  ({ actor, params, replay }) => service(actor, params.invitationId, replay),
  { idempotent: {} }
);
