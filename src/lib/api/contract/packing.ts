import { z } from "zod";
import type { PackingItem, PackingItemOrder } from "@/data/types";
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

/**
 * Replaces one packing list's complete order. The list (`listId` null is the default list) must name every item and
 * section label it holds right now: a stale or foreign list is a 409, so the client refreshes instead of overwriting
 * another editor's change. Positions are the array index; `labelId` places an item in a section of the same list.
 */
export const reorderPackingItems = defineEndpoint<PackingItemOrder>()({
  method: "PUT",
  path: "/api/v1/trips/:tripId/packing/order",
  params: z.object({ tripId: uuid }),
  body: z.strictObject({
    listId: uuid.nullable(),
    items: z
      .array(z.strictObject({ id: uuid, labelId: uuid.nullable() }))
      .max(1000)
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length, {
        message: "Each item can appear once.",
      }),
  }),
});
