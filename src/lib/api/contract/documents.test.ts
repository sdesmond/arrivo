import { expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/utils";
import {
  uploadTripDocument,
  uploadEventDocument,
  uploadReservationDocument,
  updateDocument,
  deleteDocument,
} from "./documents";

const uuid = "123e4567-e89b-12d3-a456-426614174000";
const tripId = "523e4567-e89b-12d3-a456-426614174000";

it.each([
  [uploadEventDocument, "eventId", "/api/v1/events/:eventId/documents"],
  [uploadReservationDocument, "reservationId", "/api/v1/reservations/:reservationId/documents"],
])("defines UUID-target multipart uploads", (contract, target, path) => {
  expect(contract.method).toBe("POST");
  expect(contract.path).toBe(path);
  expect(contract.multipart).toEqual({ maxFileBytes: MAX_UPLOAD_BYTES });
  expect(contract.params.parse({ [target]: uuid.toUpperCase() })).toEqual({ [target]: uuid });
  expect(contract.params.safeParse({ [target]: "linked-event" }).success).toBe(false);
  expect(contract.body.parse({ id: uuid.toUpperCase() })).toEqual({ id: uuid });
  expect(contract.body.safeParse({ extra: "no" }).success).toBe(false);
});

it("defines a multipart POST on one trip's documents with the document size limit", () => {
  expect(uploadTripDocument.method).toBe("POST");
  expect(uploadTripDocument.path).toBe("/api/v1/trips/:tripId/documents");
  expect(uploadTripDocument.status).toBeUndefined();
  expect(uploadTripDocument.multipart).toEqual({ maxFileBytes: MAX_UPLOAD_BYTES });
  expect(uploadTripDocument.params.parse({ tripId: tripId.toUpperCase() })).toEqual({ tripId });
  expect(uploadTripDocument.params.safeParse({ tripId: "bad" }).success).toBe(false);
});

it("accepts no fields or one lowercase client document id", () => {
  expect(uploadTripDocument.body.parse({})).toEqual({});
  expect(uploadTripDocument.body.parse({ id: uuid.toUpperCase() })).toEqual({ id: uuid });
});

it.each([
  ["a non-UUID id", { id: "nope" }],
  ["an unknown field", { name: "x" }],
])("rejects %s", (_label, body) => {
  expect(uploadTripDocument.body.safeParse(body).success).toBe(false);
});

it("validates strict document names and delete trip authorization", () => {
  expect(updateDocument.body.parse({})).toEqual({});
  expect(updateDocument.body.parse({ name: "pass" })).toEqual({ name: "pass" });
  for (const body of [{ name: " " }, { name: "x".repeat(201) }])
    expect(updateDocument.body.safeParse(body).success).toBe(false);
  expect(deleteDocument.body.parse({ tripId })).toEqual({ tripId });
  expect(deleteDocument.body.safeParse({}).success).toBe(false);
  expect(deleteDocument.status).toBe(204);
});

it.each(["eventId", "reservationId"])("accepts one nullable UUID scope: %s", (field) => {
  expect(updateDocument.body.parse({ [field]: uuid.toUpperCase(), name: "Pass" })).toEqual({
    [field]: uuid,
    name: "Pass",
  });
  expect(updateDocument.body.parse({ [field]: null })).toEqual({ [field]: null });
  for (const value of ["linked-event", "linked-reservation", "bad", ""]) {
    expect(updateDocument.body.safeParse({ [field]: value }).success).toBe(false);
  }
});

it.each([
  { eventId: uuid, reservationId: uuid },
  { eventId: null, reservationId: null },
  { eventId: uuid, reservationId: null },
  { eventId: null, reservationId: uuid },
  { tripId },
])("rejects ambiguous scopes and unknown fields", (body) => {
  expect(updateDocument.body.safeParse(body).success).toBe(false);
});
