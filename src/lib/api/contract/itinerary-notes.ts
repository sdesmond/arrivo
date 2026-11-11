import { z } from "zod";
import type { Note } from "@/data/types";
import { defineEndpoint } from "../endpoint";
import { itineraryNoteContentSchema, itineraryPositionSchema } from "@/lib/validation-schemas";

const lifecycleUuid = z.uuid().toLowerCase();
const noteParams = z.object({ noteId: lifecycleUuid });

/** A client `id` makes the create retry-safe. Placement: at `insertAtPosition`, else appended to the day. */
export const createDayNote = defineEndpoint<Note>()({
  method: "POST",
  path: "/api/v1/days/:dayId/notes",
  params: z.object({ dayId: lifecycleUuid }),
  body: z.strictObject({
    id: lifecycleUuid.optional(),
    content: itineraryNoteContentSchema,
    insertAtPosition: itineraryPositionSchema.optional(),
  }),
});

export const updateDayNote = defineEndpoint<Note>()({
  method: "PATCH",
  path: "/api/v1/itinerary-notes/:noteId",
  params: noteParams,
  body: z.strictObject({ content: itineraryNoteContentSchema }),
});

/** The body names the trip so a retry after the row is gone is still authorized. */
export const deleteDayNote = defineEndpoint<null>()({
  method: "DELETE",
  path: "/api/v1/itinerary-notes/:noteId",
  params: noteParams,
  body: z.strictObject({ tripId: lifecycleUuid }),
  status: 204,
});
