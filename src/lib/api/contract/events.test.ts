import { expect, it } from "vitest";
import { updateEvent } from "./events";

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
