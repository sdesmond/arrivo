import { apiRoute } from "@/lib/api/route";
import { updateDocument, deleteDocument } from "@/lib/api/contract/documents";
import { renameDocument, removeDocument } from "@/lib/services/documents";
export const PATCH = apiRoute(
  updateDocument,
  ({ actor, params, body, replay }) => renameDocument(actor, params.documentId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(
  deleteDocument,
  ({ actor, params, body, replay }) => removeDocument(actor, params.documentId, body, replay),
  { idempotent: {} }
);
