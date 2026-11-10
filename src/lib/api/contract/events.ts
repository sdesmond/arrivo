import { z } from "zod";
import type { TripEvent } from "@/data/types";
import { defineEndpoint } from "../endpoint";
import { itineraryPositionSchema, updateEventSchema } from "@/lib/validation-schemas";

const lifecycleUuid = z.uuid().toLowerCase();
const eventParams = z.object({ eventId: lifecycleUuid });
const fields = updateEventSchema.shape;

/** Absent leaves a field alone and `null` clears it, so the name is the only field that cannot be null. */
export const updateEvent = defineEndpoint<TripEvent>()({
  method: "PATCH",
  path: "/api/v1/events/:eventId",
  params: eventParams,
  body: z.strictObject({
    name: fields.name,
    startAt: fields.startAt.unwrap().nullable().optional(),
    endAt: fields.endAt.unwrap().nullable().optional(),
    locationName: fields.locationName.unwrap().nullable().optional(),
    locationAddress: fields.locationAddress.unwrap().nullable().optional(),
    locationLat: fields.locationLat.unwrap().nullable().optional(),
    locationLng: fields.locationLng.unwrap().nullable().optional(),
    confirmationNumber: fields.confirmationNumber.unwrap().nullable().optional(),
    note: fields.note.unwrap().nullable().optional(),
  }),
});

/**
 * A client `id` makes the create retry-safe. Placement: after `afterEventId`, else at `insertAtPosition`, else appended.
 * Fields can be omitted but not cleared, so none accepts `null`.
 */
export const createEvent = defineEndpoint<TripEvent>()({
  method: "POST",
  path: "/api/v1/days/:dayId/events",
  params: z.object({ dayId: lifecycleUuid }),
  body: z.strictObject({
    id: lifecycleUuid.optional(),
    name: fields.name.unwrap(),
    startAt: fields.startAt,
    endAt: fields.endAt,
    locationName: fields.locationName,
    locationAddress: fields.locationAddress,
    locationLat: fields.locationLat,
    locationLng: fields.locationLng,
    confirmationNumber: fields.confirmationNumber,
    note: fields.note,
    afterEventId: lifecycleUuid.optional(),
    insertAtPosition: itineraryPositionSchema.optional(),
  }),
});

/** The body names the trip so a retry after the row is gone is still authorized. `keepDocuments` absent discards them. */
export const deleteEvent = defineEndpoint<null>()({
  method: "DELETE",
  path: "/api/v1/events/:eventId",
  params: eventParams,
  body: z.strictObject({ tripId: lifecycleUuid, keepDocuments: z.boolean().optional() }),
  status: 204,
});
