import { apiRoute } from "@/lib/api/route";
import { deleteReservation, getReservation, updateReservation } from "@/lib/api/contract/reservations";
import {
  deleteReservation as remove,
  getReservation as read,
  updateReservation as update,
} from "@/lib/services/reservations";

export const GET = apiRoute(getReservation, ({ actor, params, body }) => read(actor, params.reservationId, body));
export const PATCH = apiRoute(
  updateReservation,
  ({ actor, params, body, replay }) => update(actor, params.reservationId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(deleteReservation, ({ actor, params, body }) =>
  remove(actor, params.reservationId, body)
);
