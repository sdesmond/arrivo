import { expect, it } from "vitest";
import { FIELD_LIMITS } from "@/lib/validation-limits";
import { createDayNote, deleteDayNote, updateDayNote } from "./itinerary-notes";

const uuid = "123e4567-e89b-12d3-a456-426614174000";
const dayId = "423e4567-e89b-12d3-a456-426614174000";
const tripId = "523e4567-e89b-12d3-a456-426614174000";

it("defines a POST on one day's notes with a normalized UUID param", () => {
  expect(createDayNote.method).toBe("POST");
  expect(createDayNote.path).toBe("/api/v1/days/:dayId/notes");
  expect(createDayNote.status).toBeUndefined();
  expect(createDayNote.params.parse({ dayId: dayId.toUpperCase() })).toEqual({ dayId });
  expect(createDayNote.params.safeParse({ dayId: "bad" }).success).toBe(false);
});

it("requires content and accepts a client id and an insert position", () => {
  expect(createDayNote.body.parse({ content: "Tickets" })).toEqual({ content: "Tickets" });
  expect(createDayNote.body.parse({ id: uuid.toUpperCase(), content: "Tickets", insertAtPosition: 0 })).toEqual({
    id: uuid,
    content: "Tickets",
    insertAtPosition: 0,
  });
  expect(createDayNote.body.parse({ content: "x".repeat(FIELD_LIMITS.itineraryNote) }).content).toHaveLength(
    FIELD_LIMITS.itineraryNote
  );
});

it.each([
  ["no content", {}],
  ["null content", { content: null }],
  ["non-text content", { content: 5 }],
  ["over-long content", { content: "x".repeat(FIELD_LIMITS.itineraryNote + 1) }],
  ["an unknown key", { content: "x", position: 1 }],
  ["a client day id", { content: "x", dayId }],
  ["a non-UUID id", { id: "bad", content: "x" }],
  ["a linked id", { id: `linked-${uuid}`, content: "x" }],
  ["a negative position", { content: "x", insertAtPosition: -1 }],
  ["a fractional position", { content: "x", insertAtPosition: 1.5 }],
])("rejects %s on create", (_name, body) => {
  expect(createDayNote.body.safeParse(body).success).toBe(false);
});

it("defines a PATCH on one note with a normalized UUID param", () => {
  expect(updateDayNote.method).toBe("PATCH");
  expect(updateDayNote.path).toBe("/api/v1/itinerary-notes/:noteId");
  expect(updateDayNote.status).toBeUndefined();
  expect(updateDayNote.params.parse({ noteId: uuid.toUpperCase() })).toEqual({ noteId: uuid });
  for (const noteId of ["bad", `linked-${uuid}`, ""]) {
    expect(updateDayNote.params.safeParse({ noteId }).success).toBe(false);
  }
  expect(updateDayNote.body.parse({ content: "Tickets" })).toEqual({ content: "Tickets" });
});

it.each([
  ["no content", {}],
  ["over-long content", { content: "x".repeat(FIELD_LIMITS.itineraryNote + 1) }],
  ["an unknown key", { content: "x", id: uuid }],
  ["a position", { content: "x", position: 1 }],
])("rejects %s on update", (_name, body) => {
  expect(updateDayNote.body.safeParse(body).success).toBe(false);
});

it("defines a DELETE with the trip in the body and a 204 status", () => {
  expect(deleteDayNote.method).toBe("DELETE");
  expect(deleteDayNote.path).toBe("/api/v1/itinerary-notes/:noteId");
  expect(deleteDayNote.status).toBe(204);
  expect(deleteDayNote.params.parse({ noteId: uuid.toUpperCase() })).toEqual({ noteId: uuid });
  expect(deleteDayNote.body.parse({ tripId: tripId.toUpperCase() })).toEqual({ tripId });
});

it.each([
  ["no trip", {}],
  ["a non-UUID trip", { tripId: "bad" }],
  ["an unknown key", { tripId, force: true }],
])("rejects %s on delete", (_name, body) => {
  expect(deleteDayNote.body.safeParse(body).success).toBe(false);
});
