import { z } from "zod";
import type { DayItemOrder } from "@/data/types";
import { defineEndpoint } from "../endpoint";

const uuidLower = z.uuid().toLowerCase();
const dayItem = z.strictObject({ type: z.enum(["event", "note", "checklist"]), id: uuidLower });

/**
 * Replaces a day's complete timeline order. The list must name every event, note and checklist the day holds right now:
 * a stale or foreign list is a 409, so the client refreshes instead of overwriting another editor's change.
 */
export const reorderDay = defineEndpoint<DayItemOrder>()({
  method: "PUT",
  path: "/api/v1/days/:dayId/order",
  params: z.object({ dayId: uuidLower }),
  body: z.strictObject({
    items: z
      .array(dayItem)
      .max(500)
      .refine((items) => new Set(items.map((item) => `${item.type}:${item.id}`)).size === items.length, {
        message: "Each item can appear once.",
      }),
  }),
});
