// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, db, requireUser, revalidatePath } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  db: {
    insert: vi.fn(),
  },
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess,
  requireUser,
}));

vi.mock("@/db", () => ({
  db,
}));

vi.mock("@/db/schema", () => ({
  reservations: {},
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

import { createReservation } from "./actions";
import { ReservationType } from "@/data/types";

describe("createReservation", () => {
  let insertedValues: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    insertedValues = undefined;
    db.insert.mockReturnValue({
      values: async (values: unknown) => {
        insertedValues = values;
      },
    });
  });

  it.each([ReservationType.Lodging, ReservationType.RentalCar, ReservationType.Cruise])(
    "requires an end date for %s reservations",
    async (type) => {
      await expect(
        createReservation("trip-1", {
          type,
          provider: "Acme",
          startAt: "2026-08-01T10:00:00.000Z",
        })
      ).rejects.toThrow("An end date and time is required for this reservation type.");

      expect(db.insert).not.toHaveBeenCalled();
    }
  );

  it.each([
    ReservationType.Flight,
    ReservationType.Train,
    ReservationType.Bus,
    ReservationType.Ferry,
    ReservationType.Other,
  ])("allows %s reservations without an end date", async (type) => {
    await createReservation("trip-1", {
      type,
      provider: "Acme",
      startAt: "2026-08-01T10:00:00.000Z",
    });

    expect(db.insert).toHaveBeenCalled();
    expect(insertedValues).toMatchObject({
      tripId: "trip-1",
      type,
      provider: "Acme",
      endAt: undefined,
    });
  });

  it("checks editor access before inserting", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Flight,
      provider: "Acme Air",
      startAt: "2026-08-01T10:00:00.000Z",
    });

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("inserts a reservation with all provided fields and converts dates", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Lodging,
      provider: "Grand Hotel",
      startAt: "2026-08-01T15:00:00.000Z",
      endAt: "2026-08-05T11:00:00.000Z",
      confirmationCode: "ABC123",
      notes: "Late checkout requested",
    });

    expect(insertedValues).toEqual({
      tripId: "trip-1",
      type: ReservationType.Lodging,
      provider: "Grand Hotel",
      startAt: new Date("2026-08-01T15:00:00.000Z"),
      endAt: new Date("2026-08-05T11:00:00.000Z"),
      confirmationCode: "ABC123",
      notes: "Late checkout requested",
    });
  });

  it("revalidates the trip path after a successful insert", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Flight,
      provider: "Acme Air",
      startAt: "2026-08-01T10:00:00.000Z",
    });

    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("omits startAt and endAt when not provided", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Other,
      provider: "Misc",
    });

    expect(insertedValues).toMatchObject({
      startAt: undefined,
      endAt: undefined,
    });
  });
});
