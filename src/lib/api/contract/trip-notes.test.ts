import { expect, it } from "vitest";
import { FIELD_LIMITS } from "@/lib/validation-limits";
import { createTripNote, deleteTripNote, reorderTripNotes, updateTripNote } from "./trip-notes";

const uuid = "123e4567-e89b-12d3-a456-426614174000";
const otherUuid = "223e4567-e89b-12d3-a456-426614174000";
const tripId = "523e4567-e89b-12d3-a456-426614174000";

it("defines a POST on one trip's notes with a normalized UUID param", () => {
  expect(createTripNote.method).toBe("POST");
  expect(createTripNote.path).toBe("/api/v1/trips/:tripId/notes");
  expect(createTripNote.status).toBeUndefined();
  expect(createTripNote.params.parse({ tripId: tripId.toUpperCase() })).toEqual({ tripId });
  expect(createTripNote.params.safeParse({ tripId: "bad" }).success).toBe(false);
});

it("accepts a title, a body or both, with an optional lowercase client id", () => {
  expect(createTripNote.body.parse({ title: "Packing" })).toEqual({ title: "Packing" });
  expect(createTripNote.body.parse({ body: "Sunscreen" })).toEqual({ body: "Sunscreen" });
  expect(createTripNote.body.parse({ id: uuid.toUpperCase(), title: "Packing", body: " " })).toEqual({
    id: uuid,
    title: "Packing",
    body: " ",
  });
  expect(createTripNote.body.parse({ title: "x".repeat(FIELD_LIMITS.noteTitle) }).title).toHaveLength(
    FIELD_LIMITS.noteTitle
  );
  expect(createTripNote.body.parse({ body: "x".repeat(FIELD_LIMITS.noteBody) }).body).toHaveLength(
    FIELD_LIMITS.noteBody
  );
});

it.each([
  ["an empty body", {}],
  ["a blank title and no body", { title: "   " }],
  ["a blank title and a blank body", { title: "", body: "\n\t " }],
  ["a null title", { title: null, body: "x" }],
  ["a non-text body", { body: 5 }],
  ["an over-long title", { title: "x".repeat(FIELD_LIMITS.noteTitle + 1) }],
  ["an over-long body", { body: "x".repeat(FIELD_LIMITS.noteBody + 1) }],
  ["an unknown key", { title: "x", position: 1 }],
  ["a client trip id", { title: "x", tripId }],
  ["a non-UUID id", { id: "bad", title: "x" }],
  ["a linked id", { id: `linked-${uuid}`, title: "x" }],
])("rejects %s on create", (_name, body) => {
  expect(createTripNote.body.safeParse(body).success).toBe(false);
});

it("defines a PATCH on one note with a normalized UUID param", () => {
  expect(updateTripNote.method).toBe("PATCH");
  expect(updateTripNote.path).toBe("/api/v1/notes/:noteId");
  expect(updateTripNote.status).toBeUndefined();
  expect(updateTripNote.params.parse({ noteId: uuid.toUpperCase() })).toEqual({ noteId: uuid });
  for (const noteId of ["bad", `linked-${uuid}`, ""]) {
    expect(updateTripNote.params.safeParse({ noteId }).success).toBe(false);
  }
});

it("accepts a partial edit where null or blank clears a field", () => {
  expect(updateTripNote.body.parse({ title: "Packing" })).toEqual({ title: "Packing" });
  expect(updateTripNote.body.parse({ body: null })).toEqual({ body: null });
  expect(updateTripNote.body.parse({ title: "", body: "  " })).toEqual({ title: "", body: "  " });
});

it.each([
  ["no key", {}],
  ["only unset keys", { title: undefined }],
  ["an over-long title", { title: "x".repeat(FIELD_LIMITS.noteTitle + 1) }],
  ["an over-long body", { body: "x".repeat(FIELD_LIMITS.noteBody + 1) }],
  ["a non-text title", { title: 5 }],
  ["an unknown key", { title: "x", position: 1 }],
  ["an id", { title: "x", id: uuid }],
])("rejects %s on update", (_name, body) => {
  expect(updateTripNote.body.safeParse(body).success).toBe(false);
});

it("defines a DELETE with the trip in the body and a 204 status", () => {
  expect(deleteTripNote.method).toBe("DELETE");
  expect(deleteTripNote.path).toBe("/api/v1/notes/:noteId");
  expect(deleteTripNote.status).toBe(204);
  expect(deleteTripNote.params.parse({ noteId: uuid.toUpperCase() })).toEqual({ noteId: uuid });
  expect(deleteTripNote.body.parse({ tripId: tripId.toUpperCase() })).toEqual({ tripId });
});

it.each([
  ["no trip", {}],
  ["a non-UUID trip", { tripId: "bad" }],
  ["an unknown key", { tripId, force: true }],
])("rejects %s on delete", (_name, body) => {
  expect(deleteTripNote.body.safeParse(body).success).toBe(false);
});

it("defines a PUT on one trip's note order", () => {
  expect(reorderTripNotes.method).toBe("PUT");
  expect(reorderTripNotes.path).toBe("/api/v1/trips/:tripId/notes/order");
  expect(reorderTripNotes.status).toBeUndefined();
  expect(reorderTripNotes.params.parse({ tripId: tripId.toUpperCase() })).toEqual({ tripId });
});

it("accepts a unique, lowercased list of up to 500 note ids, including none", () => {
  expect(reorderTripNotes.body.parse({ noteIds: [uuid.toUpperCase(), otherUuid] })).toEqual({
    noteIds: [uuid, otherUuid],
  });
  expect(reorderTripNotes.body.parse({ noteIds: [] })).toEqual({ noteIds: [] });
  const many = Array.from(
    { length: 500 },
    (_, index) => `${String(index).padStart(8, "0")}-e89b-12d3-a456-426614174000`
  );
  expect(reorderTripNotes.body.safeParse({ noteIds: many }).success).toBe(true);
});

it.each([
  ["duplicate ids", { noteIds: [uuid, uuid] }],
  ["ids duplicated by case", { noteIds: [uuid, uuid.toUpperCase()] }],
  ["more than 500 ids", { noteIds: Array.from({ length: 501 }, () => uuid) }],
  ["a non-UUID id", { noteIds: ["bad"] }],
  ["a linked id", { noteIds: [`linked-${uuid}`] }],
  ["no list", {}],
  ["an unknown key", { noteIds: [uuid], tripId }],
])("rejects %s on reorder", (_name, body) => {
  expect(reorderTripNotes.body.safeParse(body).success).toBe(false);
});
