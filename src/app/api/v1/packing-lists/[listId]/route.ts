import { apiRoute } from "@/lib/api/route";
import { renamePackingList, deletePackingList } from "@/lib/api/contract/packing";
import { renamePackingList as rename, deletePackingList as remove } from "@/lib/services/packing";
export const PATCH = apiRoute(
  renamePackingList,
  ({ actor, params, body, replay }) => rename(actor, params.listId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(
  deletePackingList,
  ({ actor, params, body, replay }) => remove(actor, params.listId, body, replay),
  { idempotent: {} }
);
