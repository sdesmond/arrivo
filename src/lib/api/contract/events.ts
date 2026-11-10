import { z } from "zod";
import type { TripEvent } from "@/data/types";
import { defineEndpoint } from "../endpoint";
import { updateEventSchema } from "@/lib/validation-schemas";

const eventParams = z.object({ eventId: z.uuid().toLowerCase() });
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
