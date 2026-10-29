// @vitest-environment node
import { describe, expect, it } from "vitest";
import { collaborators, days, trips } from "@/db/schema";
import { createTripWrite, type MembershipDatabase } from "./membership-writes";

function createDatabase(ownerRows: unknown[]) {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const transaction = {
    select: () => ({ from: () => ({ where: () => ({ for: async () => ownerRows }) }) }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return table === trips ? { returning: async () => [{ id: "trip-1" }] } : Promise.resolve();
      },
    }),
  };
  const database = {
    transaction: async (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction),
  } as unknown as MembershipDatabase;
  return { database, inserts };
}

const owner = { id: "owner-1", username: "owner", name: null, currency: null, transitMode: null };

describe("createTripWrite", () => {
  it("inserts trip, creator seat and day rows for the locked owner", async () => {
    const { database, inserts } = createDatabase([owner]);

    const result = await createTripWrite(database, "owner-1", (locked) => ({
      tripValues: { name: "Trip" },
      collaboratorName: locked.username,
      buildDayRows: (tripId) => [
        { tripId, dayNumber: 1, label: "Day 1" },
        { tripId, dayNumber: 2, label: "Day 2" },
      ],
    }));

    expect(result).toEqual({ tripId: "trip-1", ownerId: "owner-1", ownerUsername: "owner" });
    expect(inserts.map((insert) => insert.table)).toEqual([trips, collaborators, days]);
    expect(inserts[0].values).toEqual({ name: "Trip", ownerId: "owner-1" });
    expect(inserts[1].values).toMatchObject({ userId: "owner-1", initials: "OW", role: "manager", isCreator: true });
    expect(inserts[2].values).toHaveLength(2);
  });

  it("accepts a single dateless day row", async () => {
    const { database, inserts } = createDatabase([owner]);

    await createTripWrite(database, "owner-1", () => ({
      tripValues: { name: "Trip" },
      collaboratorName: "Owner",
      buildDayRows: (tripId) => ({ tripId, dayNumber: 1, label: "Day 1" }),
    }));

    expect(inserts[2].values).toEqual({ tripId: "trip-1", dayNumber: 1, label: "Day 1" });
  });

  it("fails without inserting when the owner row is gone", async () => {
    const { database, inserts } = createDatabase([]);

    await expect(
      createTripWrite(database, "owner-1", () => {
        throw new Error("prepare must not run");
      })
    ).rejects.toThrow("Signed-in user could not be resolved before trip creation.");
    expect(inserts).toHaveLength(0);
  });
});
