import { z } from "zod";
import type { Reservation } from "@/data/types";
import { createReservationSchema } from "@/lib/validation-schemas";
import { REQUIRES_END_AT } from "@/lib/reservation-types";
import { defineEndpoint } from "../endpoint";

const params = z.object({ tripId: z.uuid().toLowerCase() });
const path = "/api/v1/trips/:tripId/reservations";

export const listReservations = defineEndpoint<{ reservations: Reservation[] }>()({
  method: "GET",
  path,
  params,
  body: z.strictObject({}),
});

export const createReservation = defineEndpoint<Reservation>()({
  method: "POST",
  path,
  params,
  body: createReservationSchema
    .safeExtend({ id: z.uuid().toLowerCase() })
    .strict()
    .superRefine((body, context) => {
      if (REQUIRES_END_AT.includes(body.type) && !body.endAt)
        context.addIssue({
          code: "custom",
          message: "An end date and time is required for this reservation type.",
          path: ["endAt"],
        });
      if (body.endAt && !body.startAt)
        context.addIssue({
          code: "custom",
          message: "A start date and time is required when an end date and time is set.",
          path: ["startAt"],
        });
      if (body.startAt && body.endAt && new Date(body.endAt).getTime() < new Date(body.startAt).getTime())
        context.addIssue({
          code: "custom",
          message: "The end date and time must be after the start date and time.",
          path: ["endAt"],
        });
    }),
});
