import { apiRoute } from "@/lib/api/route";
import { searchLocations as contract } from "@/lib/api/contract/locations";
import { searchAddressLocations, searchDestinationLocations } from "@/lib/services/locations";
export const GET = apiRoute(contract, async ({ actor, body }) => {
  const search = body.mode === "destination" ? searchDestinationLocations : searchAddressLocations;
  return { suggestions: await search(actor, body.query, body.sessionToken) };
});
