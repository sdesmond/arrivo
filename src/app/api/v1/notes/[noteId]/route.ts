import { apiRoute } from "@/lib/api/route";
import { updateTripNote, deleteTripNote } from "@/lib/api/contract/trip-notes";
import { updateTripNote as update, deleteTripNote as remove } from "@/lib/services/trip-notes";
export const PATCH = apiRoute(
  updateTripNote,
  ({ actor, params, body, replay }) => update(actor, params.noteId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(
  deleteTripNote,
  ({ actor, params, body, replay }) => remove(actor, params.noteId, body, replay),
  { idempotent: {} }
);
