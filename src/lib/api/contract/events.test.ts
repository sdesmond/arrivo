import { expect, it } from "vitest";
import { createEvent, deleteEvent, updateEvent } from "./events";

const uuid = "123e4567-e89b-12d3-a456-426614174000";

it("defines a partial PATCH on one event with a normalized UUID param", () => {
  expect(updateEvent.method).toBe("PATCH");
  expect(updateEvent.path).toBe("/api/v1/events/:eventId");
  expect(updateEvent.status).toBeUndefined();
  expect(updateEvent.params.parse({ eventId: uuid.toUpperCase() })).toEqual({ eventId: uuid });
  for (const eventId of ["bad", `linked-${uuid}`, ""]) {
    expect(updateEvent.params.safeParse({ eventId }).success).toBe(false);
  }
});

it("accepts every field optionally and keeps only what was sent", () => {
  expect(updateEvent.body.parse({})).toEqual({});
  expect(updateEvent.body.parse({ name: "Dinner" })).toEqual({ name: "Dinner" });
  const full = {
    name: "Dinner",
    startAt: "2026-06-01T19:00:00.000Z",
    endAt: "2026-06-01T21:00:00.000Z",
    locationName: "Bistro",
    locationAddress: "1 Main St",
    locationLat: 48.85,
    locationLng: 2.35,
    confirmationNumber: "ABC123",
    note: "Window seat",
  };
  expect(updateEvent.body.parse(full)).toEqual(full);
});

it("accepts null to clear any field except the name, and an empty time as no time", () => {
  const cleared = {
    startAt: null,
    endAt: null,
    locationName: null,
    locationAddress: null,
    locationLat: null,
    locationLng: null,
    confirmationNumber: null,
    note: null,
  };
  expect(updateEvent.body.parse(cleared)).toEqual(cleared);
  expect(updateEvent.body.parse({ startAt: "", endAt: "" })).toEqual({ startAt: "", endAt: "" });
  expect(updateEvent.body.safeParse({ name: null }).success).toBe(false);
});

it.each([
  ["a blank name", { name: "   " }],
  ["an empty name", { name: "" }],
  ["an unknown key", { dayId: uuid }],
  ["a position", { position: 1 }],
  ["latitude 91", { locationLat: 91 }],
  ["longitude -181", { locationLng: -181 }],
  ["a malformed time", { startAt: "soon" }],
  ["a non-string note", { note: 5 }],
  ["an over-long note", { note: "x".repeat(5001) }],
  ["an over-long name", { name: "x".repeat(201) }],
  ["a malformed end time", { endAt: "2026-13-40T00:00:00Z" }],
  ["an over-long location name", { locationName: "x".repeat(201) }],
  ["longitude 181", { locationLng: 181 }],
])("rejects %s", (_name, body) => {
  expect(updateEvent.body.safeParse(body).success).toBe(false);
});

const dayId = "423e4567-e89b-12d3-a456-426614174000";
const tripId = "523e4567-e89b-12d3-a456-426614174000";

it("defines a POST on one day's events with a normalized UUID param", () => {
  expect(createEvent.method).toBe("POST");
  expect(createEvent.path).toBe("/api/v1/days/:dayId/events");
  expect(createEvent.status).toBeUndefined();
  expect(createEvent.params.parse({ dayId: dayId.toUpperCase() })).toEqual({ dayId });
  expect(createEvent.params.safeParse({ dayId: "bad" }).success).toBe(false);
});

it("requires a name and accepts every other field, a client id and one placement hint", () => {
  expect(createEvent.body.parse({ name: "Dinner" })).toEqual({ name: "Dinner" });
  const full = {
    id: uuid,
    name: "Dinner",
    startAt: "2026-06-01T19:00:00.000Z",
    endAt: "",
    locationName: "Bistro",
    locationAddress: "1 Main St",
    locationLat: 48.85,
    locationLng: 2.35,
    confirmationNumber: "ABC123",
    note: "Window seat",
    afterEventId: dayId,
    insertAtPosition: 3,
  };
  expect(createEvent.body.parse(full)).toEqual(full);
  expect(createEvent.body.parse({ id: uuid.toUpperCase(), name: "x", afterEventId: dayId.toUpperCase() })).toEqual({
    id: uuid,
    name: "x",
    afterEventId: dayId,
  });
});

it.each([
  ["no name", {}],
  ["a blank name", { name: "  " }],
  ["a null name", { name: null }],
  ["a null field", { name: "x", note: null }],
  ["an unknown key", { name: "x", position: 1 }],
  ["a client day id", { name: "x", dayId }],
  ["a linked id", { id: `linked-${uuid}`, name: "x" }],
  ["a non-UUID id", { id: "bad", name: "x" }],
  ["a non-UUID afterEventId", { name: "x", afterEventId: "bad" }],
  ["a negative position", { name: "x", insertAtPosition: -1 }],
  ["a fractional position", { name: "x", insertAtPosition: 1.5 }],
  ["an over-long name", { name: "x".repeat(201) }],
  ["an over-long note", { name: "x", note: "x".repeat(5001) }],
  ["latitude 91", { name: "x", locationLat: 91 }],
  ["a malformed time", { name: "x", startAt: "soon" }],
])("rejects %s on create", (_name, body) => {
  expect(createEvent.body.safeParse(body).success).toBe(false);
});

it("defines a DELETE with the trip in the body and a 204 status", () => {
  expect(deleteEvent.method).toBe("DELETE");
  expect(deleteEvent.path).toBe("/api/v1/events/:eventId");
  expect(deleteEvent.status).toBe(204);
  expect(deleteEvent.params.parse({ eventId: uuid.toUpperCase() })).toEqual({ eventId: uuid });
  for (const eventId of ["bad", `linked-${uuid}`, ""]) {
    expect(deleteEvent.params.safeParse({ eventId }).success).toBe(false);
  }
  expect(deleteEvent.body.parse({ tripId: tripId.toUpperCase() })).toEqual({ tripId });
  expect(deleteEvent.body.parse({ tripId, keepDocuments: true })).toEqual({ tripId, keepDocuments: true });
  expect(deleteEvent.body.parse({ tripId, keepDocuments: false })).toEqual({ tripId, keepDocuments: false });
});

it.each([
  ["no trip", {}],
  ["a non-UUID trip", { tripId: "bad" }],
  ["a non-boolean keepDocuments", { tripId, keepDocuments: "yes" }],
  ["an unknown key", { tripId, force: true }],
])("rejects %s on delete", (_name, body) => {
  expect(deleteEvent.body.safeParse(body).success).toBe(false);
});
