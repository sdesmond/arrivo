import { apiRoute } from "@/lib/api/route";
import { createReservation, listReservations } from "@/lib/api/contract/reservations";
import { createReservation as create, listReservations as list } from "@/lib/services/reservations";

export const GET = apiRoute(listReservations, ({ actor, params, body }) => list(actor, params.tripId, body));
export const POST = apiRoute(
  createReservation,
  ({ actor, params, body, replay }) => create(actor, params.tripId, body, replay),
  { idempotent: {} }
);
