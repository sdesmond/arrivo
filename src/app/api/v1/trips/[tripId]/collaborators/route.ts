import { apiRoute } from "@/lib/api/route";
import { getCollaborators } from "@/lib/api/contract/sharing";
import { getCollaborators as service } from "@/lib/services/sharing";
export const GET = apiRoute(getCollaborators, ({ actor, params }) => service(actor, params.tripId));
