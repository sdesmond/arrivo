import { apiRoute } from "@/lib/api/route";
import { resolveDestinationCenter as contract } from "@/lib/api/contract/cover-images";
import { resolveDestinationCenter } from "@/lib/services/cover-search";
export const GET = apiRoute(contract, async ({ actor, body }) => ({
  center: await resolveDestinationCenter(actor, body.name),
}));
