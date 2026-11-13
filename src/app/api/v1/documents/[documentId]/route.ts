import { apiRoute } from "@/lib/api/route";
import { updateDocument as updateContract, deleteDocument } from "@/lib/api/contract/documents";
import { updateDocument, removeDocument } from "@/lib/services/documents";
export const PATCH = apiRoute(
  updateContract,
  ({ actor, params, body, replay }) => updateDocument(actor, params.documentId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(
  deleteDocument,
  ({ actor, params, body, replay }) => removeDocument(actor, params.documentId, body, replay),
  { idempotent: {} }
);
