import { apiRoute } from "@/lib/api/route";
import { createPackingItem } from "@/lib/api/contract/packing";
import { createPackingItem as create } from "@/lib/services/packing";
export const POST = apiRoute(
  createPackingItem,
  ({ actor, params, body, replay }) => create(actor, params.tripId, body, replay),
  { idempotent: {} }
);
