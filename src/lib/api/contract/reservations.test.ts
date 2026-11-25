import { expect, it } from "vitest";
import { createReservation, getReservation, listReservations, updateReservation } from "./reservations";

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

it("defines GET and PATCH by reservation ID and normalizes the ID", () => {
  expect(getReservation.path).toBe("/api/v1/reservations/:reservationId");
  expect(getReservation.method).toBe("GET");
  expect(updateReservation.path).toBe("/api/v1/reservations/:reservationId");
  expect(updateReservation.method).toBe("PATCH");
  expect(updateReservation.params.parse({ reservationId: id.toUpperCase() })).toEqual({ reservationId: id });
  expect(getReservation.body.safeParse({}).success).toBe(true);
  expect(getReservation.body.safeParse({ extra: 1 }).success).toBe(false);
});

it("accepts partial patches where null clears every field except provider", () => {
  expect(updateReservation.body.parse({})).toEqual({});
  expect(updateReservation.body.parse({ provider: "Hotel" })).toEqual({ provider: "Hotel" });
  const cleared = {
    startAt: null,
    endAt: "",
    startAddress: null,
    startLocationName: null,
    startLocationLat: null,
    startLocationLng: null,
    endAddress: null,
    endLocationName: null,
    endLocationLat: null,
    endLocationLng: null,
    confirmationCode: null,
    serviceNumber: null,
    notes: null,
  };
  expect(updateReservation.body.safeParse(cleared).success).toBe(true);
  expect(updateReservation.body.safeParse({ provider: null }).success).toBe(false);
});

it("rejects unknown fields, the type, invalid values and an end before the start", () => {
  for (const body of [
    { type: "flight" },
    { id },
    { provider: "   " },
    { startAt: "not-a-date" },
    { startLocationLat: 91 },
    { notes: "x".repeat(5001) },
    { startAt: "2026-01-02T12:00:00.000Z", endAt: "2026-01-01T12:00:00.000Z" },
  ])
    expect(updateReservation.body.safeParse(body).success).toBe(false);
  expect(
    updateReservation.body.safeParse({ startAt: "2026-01-01T12:00:00.000Z", endAt: "2026-01-02T12:00:00.000Z" }).success
  ).toBe(true);
});

it("defines an idempotent reservation DELETE with an empty body", async () => {
  const { deleteReservation } = await import("./reservations");
  expect(deleteReservation).toMatchObject({
    method: "DELETE",
    path: "/api/v1/reservations/:reservationId",
    status: 204,
  });
  expect(deleteReservation.params.parse({ reservationId: id.toUpperCase() })).toEqual({ reservationId: id });
  expect(deleteReservation.body.safeParse({}).success).toBe(true);
  expect(deleteReservation.body.safeParse({ extra: 1 }).success).toBe(false);
});
