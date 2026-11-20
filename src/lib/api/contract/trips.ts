import { z } from "zod";
import type { Trip, TripDetailPayload, TripListEntry } from "@/data/types";
import { ReservationType, TransitMode, TripDateConflictResolution } from "@/data/types";
import { isSupportedCurrencyCode } from "@/lib/currencies";
import { createTripSchema, updateTripSchema } from "@/lib/validation-schemas";
import { defineEndpoint } from "../endpoint";

const isoDay = z.string().max(10);
const dateChangeConfirmation = z.object({
  removedDates: z.array(isoDay).max(100),
  removedDayLabels: z.array(z.string().max(200)).max(100).optional(),
  events: z
    .array(
      z.object({
        id: z.string().max(100),
        name: z.string().max(500),
        displacedDate: isoDay.optional(),
        docCount: z.number().int().nonnegative(),
      })
    )
    .max(5000),
  reservations: z
    .array(
      z.object({ id: z.string().max(100), provider: z.string().max(500), type: z.enum(ReservationType), date: isoDay })
    )
    .max(5000)
    .optional(),
  noteCount: z.number().int().nonnegative(),
  checklistCount: z.number().int().nonnegative(),
  eventDocumentCount: z.number().int().nonnegative(),
});

export const getTrip = defineEndpoint<TripDetailPayload>()({
  method: "GET",
  path: "/api/v1/trips/:tripId",
  params: z.object({ tripId: z.uuid().toLowerCase() }),
  body: z.strictObject({}),
});
export const updateTrip = defineEndpoint<Trip>()({
  method: "PATCH",
  path: "/api/v1/trips/:tripId",
  params: z.object({ tripId: z.uuid().toLowerCase() }),
  body: z.strictObject({
    ...updateTripSchema.pick({
      name: true,
      startDate: true,
      endDate: true,
      destinationName: true,
      destinationCountry: true,
      destinationCountryCode: true,
      notes: true,
      budgetTotal: true,
      tags: true,
    }).shape,
    budgetCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .refine(isSupportedCurrencyCode, "Invalid budget currency.")
      .optional(),
    transitMode: z.enum(TransitMode).nullable().optional(),
    convertCurrency: z.boolean().optional(),
    resolution: z.enum(TripDateConflictResolution).optional(),
    confirmation: dateChangeConfirmation.optional(),
  }),
});

const budgetCurrency = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isSupportedCurrencyCode, "Invalid budget currency.")
  .optional();

export const createTrip = defineEndpoint<Trip>()({
  method: "POST",
  path: "/api/v1/trips",
  params: z.object({}),
  body: z.strictObject({
    id: z.uuid().toLowerCase(),
    ...createTripSchema.omit({ coverImageUrl: true }).shape,
    budgetCurrency,
    transitMode: z.enum(TransitMode).nullable().optional(),
  }),
});
export const listTrips = defineEndpoint<{ trips: TripListEntry[] }>()({
  method: "GET",
  path: "/api/v1/trips",
  params: z.object({}),
  body: z.strictObject({}),
});
