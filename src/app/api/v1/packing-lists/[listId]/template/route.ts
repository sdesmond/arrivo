import { apiRoute } from "@/lib/api/route";
import { savePackingListAsTemplate } from "@/lib/api/contract/packing-templates";
import { savePackingListAsTemplate as save } from "@/lib/services/packing-templates";
export const POST = apiRoute(
  savePackingListAsTemplate,
  ({ actor, params, body, replay }) => save(actor, params.listId, body, replay),
  { idempotent: {} }
);
