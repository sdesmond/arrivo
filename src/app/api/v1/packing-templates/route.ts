import { apiRoute } from "@/lib/api/route";
import { createPackingTemplate, listPackingTemplates } from "@/lib/api/contract/packing-templates";
import { createPackingTemplate as create, listPackingTemplates as list } from "@/lib/services/packing-templates";

export const GET = apiRoute(listPackingTemplates, ({ actor, body }) => list(actor, body));

export const POST = apiRoute(createPackingTemplate, ({ actor, body, replay }) => create(actor, body, replay), {
  idempotent: {},
});
