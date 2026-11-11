import { z } from "zod";
import type { TripNote, TripNoteOrder } from "@/data/types";
import { defineEndpoint } from "../endpoint";
import { tripNoteBodySchema, tripNoteTitleSchema } from "@/lib/validation-schemas";

const uuidLower = z.uuid().toLowerCase();
const noteParams = z.object({ noteId: uuidLower });
const tripParams = z.object({ tripId: uuidLower });

/** Create and edit store a blank title or body as no value, so only a non-blank field makes a note. */
const hasText = (value: string | null | undefined) => typeof value === "string" && value.trim().length > 0;

/** Prepends a note to the trip's notes. A client `id` makes the create retry-safe. */
export const createTripNote = defineEndpoint<TripNote>()({
  method: "POST",
  path: "/api/v1/trips/:tripId/notes",
  params: tripParams,
  body: z
    .strictObject({
      id: uuidLower.optional(),
      title: tripNoteTitleSchema.optional(),
      body: tripNoteBodySchema.optional(),
    })
    .refine((note) => hasText(note.title) || hasText(note.body), { message: "A note needs a title or a body." }),
});

/** A partial edit: an absent field is kept, a null or blank one is cleared. */
export const updateTripNote = defineEndpoint<TripNote>()({
  method: "PATCH",
  path: "/api/v1/notes/:noteId",
  params: noteParams,
  body: z
    .strictObject({
      title: tripNoteTitleSchema.nullable().optional(),
      body: tripNoteBodySchema.nullable().optional(),
    })
    .refine((patch) => patch.title !== undefined || patch.body !== undefined, {
      message: "Send a title or a body to change.",
    }),
});

/** The body names the trip so a retry after the row is gone is still authorized. */
export const deleteTripNote = defineEndpoint<null>()({
  method: "DELETE",
  path: "/api/v1/notes/:noteId",
  params: noteParams,
  body: z.strictObject({ tripId: uuidLower }),
  status: 204,
});

/**
 * Replaces the trip's complete note order. The list must name every note the trip holds right now: a stale or foreign
 * list is a 409, so the client refreshes instead of overwriting another editor's change.
 */
export const reorderTripNotes = defineEndpoint<TripNoteOrder>()({
  method: "PUT",
  path: "/api/v1/trips/:tripId/notes/order",
  params: tripParams,
  body: z.strictObject({
    noteIds: z
      .array(uuidLower)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, { message: "Each note can appear once." }),
  }),
});
