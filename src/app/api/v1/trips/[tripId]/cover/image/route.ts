import { apiRoute } from "@/lib/api/route";
import { uploadTripCoverImage as uploadContract } from "@/lib/api/contract/covers";
import { uploadTripCoverImage } from "@/lib/services/covers";
// Multipart: no `Idempotency-Key`. Every attempt stores a fresh file, so a retry replaces the cover again.
export const POST = apiRoute(uploadContract, ({ actor, params, body, file }) =>
  uploadTripCoverImage(actor, params.tripId, body, file!)
);
