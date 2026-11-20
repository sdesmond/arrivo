import { apiRoute } from "@/lib/api/route";
import { createPackingList } from "@/lib/api/contract/packing";
import { createPackingList as create } from "@/lib/services/packing";
export const POST = apiRoute(
  createPackingList,
  ({ actor, params, body, replay }) => create(actor, params.tripId, body, replay),
  { idempotent: {} }
);
