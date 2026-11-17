import { apiRoute } from "@/lib/api/route";
import { listInvitableUsers } from "@/lib/api/contract/sharing";
import { listInvitableUsers as service } from "@/lib/services/sharing";
export const GET = apiRoute(listInvitableUsers, ({ actor, body }) => service(actor, body.tripId));
