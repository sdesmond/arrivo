import { apiRoute } from "@/lib/api/route";
import { uploadTripDocument } from "@/lib/api/contract/documents";
import { uploadTripDocument as upload } from "@/lib/services/documents";
// Multipart: no `Idempotency-Key`. The client document id in the form makes a retry of the same file safe.
export const POST = apiRoute(uploadTripDocument, ({ actor, params, body, file }) =>
  upload(actor, params.tripId, body, file!)
);
