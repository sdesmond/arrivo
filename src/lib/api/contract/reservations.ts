import { z } from "zod";
import type { Reservation } from "@/data/types";
import { createReservationSchema, updateReservationSchema } from "@/lib/validation-schemas";
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

const reservationParams = z.object({ reservationId: z.uuid().toLowerCase() });
const reservationPath = "/api/v1/reservations/:reservationId";
const fields = updateReservationSchema.shape;

export const getReservation = defineEndpoint<Reservation>()({
  method: "GET",
  path: reservationPath,
  params: reservationParams,
  body: z.strictObject({}),
});

/**
 * Absent leaves a field alone and `null` clears it (an empty time clears too), so the provider is the only field that
 * cannot be null. Clearing an address also clears its location name, latitude and longitude.
 */
export const updateReservation = defineEndpoint<Reservation>()({
  method: "PATCH",
  path: reservationPath,
  params: reservationParams,
  body: z
    .strictObject({
      provider: fields.provider,
      startAt: fields.startAt.unwrap().nullable().optional(),
      endAt: fields.endAt.unwrap().nullable().optional(),
      startAddress: fields.startAddress.unwrap().nullable().optional(),
      startLocationName: fields.startLocationName.unwrap().nullable().optional(),
      startLocationLat: fields.startLocationLat.unwrap().nullable().optional(),
      startLocationLng: fields.startLocationLng.unwrap().nullable().optional(),
      endAddress: fields.endAddress.unwrap().nullable().optional(),
      endLocationName: fields.endLocationName.unwrap().nullable().optional(),
      endLocationLat: fields.endLocationLat.unwrap().nullable().optional(),
      endLocationLng: fields.endLocationLng.unwrap().nullable().optional(),
      confirmationCode: fields.confirmationCode.unwrap().nullable().optional(),
      serviceNumber: fields.serviceNumber.unwrap().nullable().optional(),
      notes: fields.notes.unwrap().nullable().optional(),
    })
    .superRefine((body, context) => {
      if (body.startAt && body.endAt && new Date(body.endAt).getTime() < new Date(body.startAt).getTime())
        context.addIssue({
          code: "custom",
          message: "The end date and time must be after the start date and time.",
          path: ["endAt"],
        });
    }),
});
