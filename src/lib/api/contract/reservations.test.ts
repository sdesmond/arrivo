import { expect, it } from "vitest";
import { createReservation, listReservations } from "./reservations";

const id = "123e4567-e89b-12d3-a456-426614174000";

it("defines trip reservation endpoints and normalizes client IDs", () => {
  expect(listReservations.path).toBe("/api/v1/trips/:tripId/reservations");
  expect(listReservations.method).toBe("GET");
  expect(createReservation.method).toBe("POST");
  expect(createReservation.params.parse({ tripId: id.toUpperCase() })).toEqual({ tripId: id });
  expect(createReservation.body.parse({ id: id.toUpperCase(), type: "other", provider: "Test" }).id).toBe(id);
});

it("requires an ID and rejects invalid ranges and missing required end dates", () => {
  for (const body of [
    { type: "other", provider: "Test" },
    { id, type: "lodging", provider: "Test" },
    { id, type: "other", provider: "Test", endAt: "2026-01-01T12:00:00.000Z" },
    { id, type: "other", provider: "Test", startAt: "2026-01-02T12:00:00.000Z", endAt: "2026-01-01T12:00:00.000Z" },
  ])
    expect(createReservation.body.safeParse(body).success).toBe(false);
});

it("preserves create validation for provider, dates, text limits and coordinates", () => {
  const base = { id, type: "other", provider: "Test" };
  for (const body of [
    { ...base, type: "teleport" },
    { ...base, provider: "   " },
    { ...base, provider: "x".repeat(201) },
    { ...base, notes: "x".repeat(5001) },
    { ...base, confirmationCode: "x".repeat(65) },
    { ...base, startLocationLat: 91 },
    { ...base, startAt: "" },
    { ...base, endAt: "not-a-date" },
  ])
    expect(createReservation.body.safeParse(body).success).toBe(false);
  for (const type of ["flight", "train", "bus", "ferry", "other"])
    expect(createReservation.body.safeParse({ ...base, type }).success).toBe(true);
  for (const type of ["lodging", "rental-car", "cruise"])
    expect(createReservation.body.safeParse({ ...base, type }).success).toBe(false);
});
