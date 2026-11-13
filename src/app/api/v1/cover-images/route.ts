import { apiRoute } from "@/lib/api/route";
import { searchCoverImages as contract } from "@/lib/api/contract/cover-images";
import { searchCoverImages } from "@/lib/services/cover-search";
export const GET = apiRoute(contract, async ({ actor, body }) => ({
  images: await searchCoverImages(actor, body.query, body),
}));
