import { z } from "zod";
import type { Document } from "@/data/types";
import { MAX_UPLOAD_BYTES } from "@/lib/utils";
import { defineEndpoint } from "../endpoint";

const uuidLower = z.uuid().toLowerCase();

/**
 * Uploads one file as a trip-scope document (multipart: a `file` part and an optional client `id`). The same `id` on a
 * retry of the same file returns the stored row, so a lost response never stores the file twice. There is no
 * `Idempotency-Key`: no file body is hashed.
 */
export const uploadTripDocument = defineEndpoint<Document>()({
  method: "POST",
  path: "/api/v1/trips/:tripId/documents",
  params: z.object({ tripId: uuidLower }),
  body: z.strictObject({ id: uuidLower.optional() }),
  multipart: { maxFileBytes: MAX_UPLOAD_BYTES },
});

/** Uploads one file attached to a real event; optional client id makes retries safe. */
export const uploadEventDocument = defineEndpoint<Document>()({
  method: "POST",
  path: "/api/v1/events/:eventId/documents",
  params: z.object({ eventId: uuidLower }),
  body: z.strictObject({ id: uuidLower.optional() }),
  multipart: { maxFileBytes: MAX_UPLOAD_BYTES },
});

/** Uploads one file attached to a real reservation; optional client id makes retries safe. */
export const uploadReservationDocument = defineEndpoint<Document>()({
  method: "POST",
  path: "/api/v1/reservations/:reservationId/documents",
  params: z.object({ reservationId: uuidLower }),
  body: z.strictObject({ id: uuidLower.optional() }),
  multipart: { maxFileBytes: MAX_UPLOAD_BYTES },
});
