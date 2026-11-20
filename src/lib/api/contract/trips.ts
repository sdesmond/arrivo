import { z } from "zod";
import type { Trip } from "@/data/types";
import { TransitMode } from "@/data/types";
import { isSupportedCurrencyCode } from "@/lib/currencies";
import { updateTripSchema } from "@/lib/validation-schemas";
import { defineEndpoint } from "../endpoint";

export const updateTrip = defineEndpoint<Trip>()({
  method: "PATCH",
  path: "/api/v1/trips/:tripId",
  params: z.object({ tripId: z.uuid().toLowerCase() }),
  body: z.strictObject({
    ...updateTripSchema.pick({
      name: true,
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
  }),
});
