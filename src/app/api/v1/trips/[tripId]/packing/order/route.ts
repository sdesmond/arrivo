import { apiRoute } from "@/lib/api/route";
import { reorderPackingItems } from "@/lib/api/contract/packing";
import { reorderPackingItems as reorder } from "@/lib/services/packing";

export const PUT = apiRoute(
  reorderPackingItems,
  ({ actor, params, body, replay }) => reorder(actor, params.tripId, body, replay),
  { idempotent: {} }
);
