import { z } from "zod";
import type { DayItemOrder, DayRecord } from "@/data/types";
import { dayFieldSchemas } from "@/lib/validation-schemas";
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

/** A partial edit: an absent field is kept, `null` clears the text fields, and the label cannot be cleared. */
export const updateDay = defineEndpoint<DayRecord>()({
  method: "PATCH",
  path: "/api/v1/days/:dayId",
  params: z.object({ dayId: uuidLower }),
  body: z.strictObject({
    label: dayFieldSchemas.label.optional(),
    subtitle: dayFieldSchemas.subtitle.nullable().optional(),
    weather: dayFieldSchemas.weather.nullable().optional(),
    travelSummary: dayFieldSchemas.travelSummary.nullable().optional(),
  }),
});

/** Appends a day to the trip. A client `id` makes the create retry-safe. */
export const addDay = defineEndpoint<DayRecord>()({
  method: "POST",
  path: "/api/v1/trips/:tripId/days",
  params: z.object({ tripId: uuidLower }),
  body: z.strictObject({ id: uuidLower.optional() }),
});

/**
 * Removes the trip's last day. The body names the trip so a retry after the day is gone is still authorized, and
 * `confirmDestructive` is required when the day holds events, notes or checklists.
 */
export const deleteDay = defineEndpoint<null>()({
  method: "DELETE",
  path: "/api/v1/days/:dayId",
  params: z.object({ dayId: uuidLower }),
  body: z.strictObject({ tripId: uuidLower, confirmDestructive: z.boolean().optional() }),
  status: 204,
});
