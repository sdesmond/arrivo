import { z } from "zod";
import type { PackingItem, PackingItemOrder, TripPackingList } from "@/data/types";
import { FIELD_LIMITS, overLimitMessage } from "@/lib/validation-limits";
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
export const createPackingItem = defineEndpoint<PackingItem>()({
  method: "POST",
  path: "/api/v1/trips/:tripId/packing-items",
  params: z.object({ tripId: uuid }),
  body: z
    .strictObject({
      id: uuid,
      name,
      listId: uuid.nullable(),
      isLabel: z.boolean().optional(),
      labelId: uuid.nullable().optional(),
      beforeItemId: uuid.optional(),
      afterItemId: uuid.optional(),
    })
    .refine((body) => !(body.beforeItemId && body.afterItemId), { message: "Choose one placement anchor." })
    .refine((body) => !(body.isLabel && body.labelId), { message: "Sections cannot have a parent section." }),
});
export const removePackingSection = defineEndpoint<null>()({
  method: "DELETE",
  path: "/api/v1/packing-items/:itemId/section",
  params,
  body: z.strictObject({ tripId: uuid, mode: z.enum(["delete-items", "move-items-to-ungrouped"]) }),
  status: 204,
});

const listName = z
  .string()
  .trim()
  .min(1, "List name is required")
  .max(FIELD_LIMITS.packingListName, overLimitMessage("List name", FIELD_LIMITS.packingListName));
const listParams = z.object({ listId: uuid });
/** The client mints the list ID, so a retried create returns the same list instead of adding another. */
export const createPackingList = defineEndpoint<TripPackingList>()({
  method: "POST",
  path: "/api/v1/trips/:tripId/packing-lists",
  params: z.object({ tripId: uuid }),
  body: z.strictObject({ id: uuid, name: listName }),
});
export const renamePackingList = defineEndpoint<TripPackingList>()({
  method: "PATCH",
  path: "/api/v1/packing-lists/:listId",
  params: listParams,
  body: z.strictObject({ tripId: uuid, name: listName }),
});
/** Deletes the list and every item in it. An already-absent list is a quiet 204. */
export const deletePackingList = defineEndpoint<null>()({
  method: "DELETE",
  path: "/api/v1/packing-lists/:listId",
  params: listParams,
  body: z.strictObject({ tripId: uuid }),
  status: 204,
});
