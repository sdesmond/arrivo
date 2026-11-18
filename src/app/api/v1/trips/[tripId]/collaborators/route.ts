import { apiRoute } from "@/lib/api/route";
import { getCollaborators, saveContributorChanges } from "@/lib/api/contract/sharing";
import { getCollaborators as service, saveContributorChanges as save } from "@/lib/services/sharing";
export const GET = apiRoute(getCollaborators, ({ actor, params }) => service(actor, params.tripId));
export const PATCH = apiRoute(
  saveContributorChanges,
  ({ actor, params, body, replay }) => save(actor, params.tripId, body, replay),
  { idempotent: {} }
);
