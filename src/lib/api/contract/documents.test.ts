import { expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/utils";
import { uploadTripDocument } from "./documents";

const uuid = "123e4567-e89b-12d3-a456-426614174000";
const tripId = "523e4567-e89b-12d3-a456-426614174000";

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
