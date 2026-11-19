import { z } from "zod";
import type { PackingItem } from "@/data/types";
import { FIELD_LIMITS } from "@/lib/validation-limits";
import { defineEndpoint } from "../endpoint";
const uuid = z.uuid().toLowerCase();
const params = z.object({ itemId: uuid });
const name = z.string().trim().min(1, "Packing item name is required").max(FIELD_LIMITS.packingItemText);
export const updatePackingItem = defineEndpoint<PackingItem>()({
  method: "PATCH",
  path: "/api/v1/packing-items/:itemId",
  params,
  body: z.strictObject({ name: name.optional(), isPacked: z.boolean().optional() }),
});
export const deletePackingItem = defineEndpoint<null>()({
  method: "DELETE",
  path: "/api/v1/packing-items/:itemId",
  params,
  body: z.strictObject({ tripId: uuid }),
  status: 204,
});
