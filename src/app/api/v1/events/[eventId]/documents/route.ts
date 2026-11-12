import { apiRoute } from "@/lib/api/route";
import { uploadEventDocument } from "@/lib/api/contract/documents";
import { uploadEventDocument as upload } from "@/lib/services/documents";
// Multipart: no `Idempotency-Key`. The client document id in the form makes a retry of the same file safe.
export const POST = apiRoute(uploadEventDocument, ({ actor, params, body, file }) =>
  upload(actor, params.eventId, body, file!)
);
