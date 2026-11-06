import { z } from "zod";
import { ReservationType, type TransitMode } from "@/data/types";
import {
  FIELD_LIMITS,
  isValidIsoDate,
  isValidIsoDateTime,
  MAX_BUDGET_TOTAL,
  MAX_ITINERARY_POSITION,
  overLimitMessage,
} from "@/lib/validation-limits";

// Server-side input schemas for the trip, itinerary and reservation actions. `z.object` drops unknown keys, so a
// crafted payload can't smuggle extra columns past an action. Client forms read the caps from validation-limits.

/** Parse `value` or throw an `Error` carrying the first issue's message. */
export function parseInput<Output>(schema: z.ZodType<Output>, value: unknown): Output {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input.");
  }
  return result.data;
}

function text(label: string, limit: number) {
  return z.string({ error: `${label} must be text.` }).max(limit, overLimitMessage(label, limit));
}

function requiredText(label: string, limit: number) {
  return text(label, limit).refine((value) => value.trim().length > 0, `${label} is required.`);
}

function isoDate(message: string) {
  return z.string({ error: message }).refine(isValidIsoDate, message);
}

function isoDateTime(message: string) {
  return z.string({ error: message }).refine(isValidIsoDateTime, message);
}

const latitude = z
  .number({ error: "Latitude must be between -90 and 90." })
  .min(-90, "Latitude must be between -90 and 90.")
  .max(90, "Latitude must be between -90 and 90.");

const longitude = z
  .number({ error: "Longitude must be between -180 and 180." })
  .min(-180, "Longitude must be between -180 and 180.")
  .max(180, "Longitude must be between -180 and 180.");

const budgetTotal = z
  .number({ error: "Budget must be a number." })
  .min(0, "Budget must be 0 or more.")
  .max(MAX_BUDGET_TOTAL, "Budget is too large.");

const position = z
  .number({ error: "Invalid position." })
  .int("Invalid position.")
  .min(0, "Invalid position.")
  .max(MAX_ITINERARY_POSITION, "Invalid position.");

const tags = z
  .array(requiredText("Tag", FIELD_LIMITS.tag), { error: "Tags must be a list." })
  .max(FIELD_LIMITS.tagCount, `A trip can have at most ${FIELD_LIMITS.tagCount} tags.`);

// Currency and transit mode keep their dedicated checks in the trip actions; here they only get type and size bounds.
const currencyField = z.string({ error: "Invalid budget currency." }).max(16, "Invalid budget currency.");
const transitModeField = z.custom<TransitMode>((value) => typeof value === "string" && value.length <= 16, {
  error: "Invalid transit mode.",
});

export const createTripSchema = z.object({
  name: requiredText("Trip name", FIELD_LIMITS.tripName),
  startDate: isoDate("Invalid start date format. Expected YYYY-MM-DD.").optional(),
  endDate: isoDate("Invalid end date format. Expected YYYY-MM-DD.").optional(),
  coverImageUrl: z.string().optional(),
  destinationName: text("Destination", FIELD_LIMITS.destination).optional(),
  destinationCountry: text("Destination country", FIELD_LIMITS.destination).optional(),
  destinationCountryCode: text("Destination country code", FIELD_LIMITS.countryCode).optional(),
  destinationCenter: z.tuple([longitude, latitude]).optional(),
  notes: text("Notes", FIELD_LIMITS.tripNotes).optional(),
  budgetCurrency: currencyField.optional(),
  budgetTotal: budgetTotal.optional(),
  tags: tags.optional(),
  transitMode: transitModeField.nullable().optional(),
});

export const updateTripSchema = z.object({
  name: requiredText("Trip name", FIELD_LIMITS.tripName).optional(),
  startDate: isoDate("Invalid start date format. Expected YYYY-MM-DD.").nullable().optional(),
  endDate: isoDate("Invalid end date format. Expected YYYY-MM-DD.").nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  destinationName: text("Destination", FIELD_LIMITS.destination).nullable().optional(),
  destinationCountry: text("Destination country", FIELD_LIMITS.destination).nullable().optional(),
  destinationCountryCode: text("Destination country code", FIELD_LIMITS.countryCode).nullable().optional(),
  notes: text("Notes", FIELD_LIMITS.tripNotes).optional(),
  budgetCurrency: currencyField.optional(),
  budgetTotal: budgetTotal.optional(),
  tags: tags.optional(),
  transitMode: transitModeField.nullable().optional(),
});

// Events treat an empty time as "no time set", so "" is allowed alongside a real datetime.
const eventFields = {
  startAt: isoDateTime("Invalid start time.").or(z.literal("")).optional(),
  endAt: isoDateTime("Invalid end time.").or(z.literal("")).optional(),
  locationName: text("Location name", FIELD_LIMITS.locationName).optional(),
  locationAddress: text("Location address", FIELD_LIMITS.locationAddress).optional(),
  locationLat: latitude.optional(),
  locationLng: longitude.optional(),
  confirmationNumber: text("Confirmation number", FIELD_LIMITS.confirmationCode).optional(),
  note: text("Note", FIELD_LIMITS.eventNote).optional(),
};

export const createEventSchema = z.object({
  name: requiredText("Event name", FIELD_LIMITS.eventName),
  ...eventFields,
  afterEventId: z.string().optional(),
  insertAtPosition: position.optional(),
});

export const updateEventSchema = z.object({
  name: requiredText("Event name", FIELD_LIMITS.eventName).optional(),
  ...eventFields,
});

export const updateDaySchema = z.object({
  label: text("Day label", FIELD_LIMITS.dayLabel).optional(),
  subtitle: text("Subtitle", FIELD_LIMITS.dayText).optional(),
  weather: text("Weather", FIELD_LIMITS.dayText).optional(),
  travelSummary: text("Travel summary", FIELD_LIMITS.dayText).optional(),
});

export const createTripNoteSchema = z.object({
  title: text("Title", FIELD_LIMITS.noteTitle).optional(),
  body: text("Note body", FIELD_LIMITS.noteBody).optional(),
});

export const updateTripNoteSchema = createTripNoteSchema;

export const itineraryNoteContentSchema = text("Note", FIELD_LIMITS.itineraryNote);
export const checklistTitleSchema = text("Checklist title", FIELD_LIMITS.checklistTitle).optional();
export const checklistItemContentSchema = text("Checklist item", FIELD_LIMITS.checklistItem);
export const documentNameSchema = requiredText("Document name", FIELD_LIMITS.documentName);
export const itineraryPositionSchema = position;

const reservationType = z.custom<ReservationType>(
  (value) => typeof value === "string" && (Object.values(ReservationType) as string[]).includes(value),
  { error: "Invalid reservation type." }
);

const reservationFields = {
  startAddress: text("Start address", FIELD_LIMITS.locationAddress).optional(),
  startLocationName: text("Start location name", FIELD_LIMITS.locationName).optional(),
  startLocationLat: latitude.optional(),
  startLocationLng: longitude.optional(),
  endAddress: text("End address", FIELD_LIMITS.locationAddress).optional(),
  endLocationName: text("End location name", FIELD_LIMITS.locationName).optional(),
  endLocationLat: latitude.optional(),
  endLocationLng: longitude.optional(),
  confirmationCode: text("Confirmation code", FIELD_LIMITS.confirmationCode).optional(),
  serviceNumber: text("Service number", FIELD_LIMITS.serviceNumber).optional(),
  notes: text("Notes", FIELD_LIMITS.reservationNotes).optional(),
};

export const createReservationSchema = z.object({
  type: reservationType,
  provider: requiredText("Provider", FIELD_LIMITS.provider),
  startAt: isoDateTime("Invalid start time.").optional(),
  endAt: isoDateTime("Invalid end time.").optional(),
  ...reservationFields,
});

export const updateReservationSchema = z.object({
  provider: requiredText("Provider", FIELD_LIMITS.provider).optional(),
  // An empty time clears the field on update.
  startAt: isoDateTime("Invalid start date and time.").or(z.literal("")).optional(),
  endAt: isoDateTime("Invalid end date and time.").or(z.literal("")).optional(),
  ...reservationFields,
});

export const addDocumentSchema = z.object({
  tripId: z.string().optional(),
  eventId: z.string().optional(),
  reservationId: z.string().optional(),
  name: documentNameSchema,
  kind: requiredText("Kind", FIELD_LIMITS.documentKind),
  size: text("Size", FIELD_LIMITS.documentSize).optional(),
  url: z.string().optional(),
});
