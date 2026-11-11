import { apiRoute } from "@/lib/api/route";
import { updateDayNote, deleteDayNote } from "@/lib/api/contract/itinerary-notes";
import { updateDayNote as update, deleteDayNote as remove } from "@/lib/services/itinerary-notes";
export const PATCH = apiRoute(
  updateDayNote,
  ({ actor, params, body, replay }) => update(actor, params.noteId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(
  deleteDayNote,
  ({ actor, params, body, replay }) => remove(actor, params.noteId, body, replay),
  { idempotent: {} }
);
