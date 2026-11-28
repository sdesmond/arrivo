import { apiRoute } from "@/lib/api/route";
import { retrieveLocation as contract } from "@/lib/api/contract/locations";
import { retrieveLocation } from "@/lib/services/locations";
export const GET = apiRoute(contract, async ({ actor, body }) => ({
  location: await retrieveLocation(actor, body.mapboxId, body.sessionToken),
}));
